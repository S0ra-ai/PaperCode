import { afterEach, describe, expect, test } from "bun:test"
import { existsSync } from "fs"
import { mkdir } from "fs/promises"
import path from "path"
import { ConfigProvider, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { Flag } from "@opencode-ai/core/flag/flag"
import { stopAllPaperRunLivePreviews } from "../../src/paper/run"
import { createResearchRun } from "../../src/paper/research/runtime"
import { Server } from "../../src/server/server"
import { PaperPaths } from "../../src/server/routes/instance/httpapi/groups/paper"
import { ExperimentalHttpApiServer } from "../../src/server/routes/instance/httpapi/server"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"
import * as Log from "@opencode-ai/core/util/log"

void Log.init({ print: false })

const originalHttpApi = Flag.OPENCODE_EXPERIMENTAL_HTTPAPI
let previousPaperHome: string | undefined

function app() {
  Flag.OPENCODE_EXPERIMENTAL_HTTPAPI = true
  const handler = HttpRouter.toWebHandler(
    ExperimentalHttpApiServer.routes.pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            PAPER_FUCKER_SERVER_PASSWORD: undefined,
            OPENCODE_SERVER_PASSWORD: undefined,
          }),
        ),
      ),
    ),
    { disableLogger: true },
  ).handler

  return {
    request(input: string | URL | Request, init?: RequestInit) {
      return handler(
        input instanceof Request ? input : new Request(new URL(input, "http://localhost"), init),
        ExperimentalHttpApiServer.context,
      )
    },
  }
}

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }
}

function runPath(template: string, runID: string) {
  return template.replace(":runID", encodeURIComponent(runID))
}

afterEach(async () => {
  if (previousPaperHome === undefined) delete process.env.PAPER_FUCKER_TEST_HOME
  else process.env.PAPER_FUCKER_TEST_HOME = previousPaperHome
  previousPaperHome = undefined
  stopAllPaperRunLivePreviews()
  Flag.OPENCODE_EXPERIMENTAL_HTTPAPI = originalHttpApi
  await disposeAllInstances()
  await resetDatabase()
})

describe("PaperRun HttpApi", () => {
  test("generates a fresh PaperRun id when a generated run id already exists", async () => {
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    let eventIndex = 0
    const options = {
      workspace: tmp.path,
      home: tmp.path,
      idFactory: (kind: "run" | "event" | "artifact") =>
        kind === "run" ? "run-fixed" : `${kind}-${++eventIndex}`,
    }

    const first = await createResearchRun({ topic: "first" }, options)
    const second = await createResearchRun({ topic: "second" }, options)

    expect(first.run.run_id).toBe("run-fixed")
    expect(second.run.run_id).not.toBe("run-fixed")
    expect(second.run.run_id.startsWith("run-")).toBe(true)
    expect(existsSync(second.run_dir)).toBe(true)
  })

  test("serves Paper model inventory JSON through the default Hono TUI backend", async () => {
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    previousPaperHome = process.env.PAPER_FUCKER_TEST_HOME
    process.env.PAPER_FUCKER_TEST_HOME = tmp.path
    Flag.OPENCODE_EXPERIMENTAL_HTTPAPI = false

    const response = await Server.Legacy().app.request(PaperPaths.modelInventory, {
      headers: { "x-paper-fucker-directory": tmp.path },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
    const body = await response.json()
    expect(body.inventory.schema_version).toBe("PaperModelInventory.v1")
    expect(body.inventory.allowlist).toEqual([])
    expect(body.roles).toEqual({})
    expect(body.routing.every((decision: { source: string }) => decision.source === "blocked")).toBe(true)
  })

  test("serves PaperRun lifecycle, diagnostics, capability, provider, and role endpoints", async () => {
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    previousPaperHome = process.env.PAPER_FUCKER_TEST_HOME
    process.env.PAPER_FUCKER_TEST_HOME = tmp.path
    const headers = { "x-paper-fucker-directory": tmp.path }

    const create = await app().request(PaperPaths.runs, {
      ...json({
        topic: "代码仓库生成可验证论文",
        code_paths: ["packages/opencode"],
        target_profile: "generic-preprint",
        language: "zh-CN",
      }),
      headers: { ...headers, "content-type": "application/json" },
    })
    expect(create.status).toBe(200)
    const created = await create.json()
    expect(created.run.intake.topic).toBe("代码仓库生成可验证论文")
    expect(created.run.status).toBe("blocked")
    expect(created.run.stage_graph.stages.map((stage: { id: string }) => stage.id)).toContain("intake")
    expect(
      created.run.pause_questions.some((question: { message: string }) => question.message.includes("模型工作台")),
    ).toBe(true)
    expect(created.run.agent_tree.nodes[0].role).toBe("root_run_agent")
    expect(created.run.agent_tree.nodes[0].provider_id).toBe("unconfigured")

    const runID = created.run.run_id as string
    const get = await app().request(runPath(PaperPaths.run, runID), { headers })
    expect(get.status).toBe(200)
    expect((await get.json()).run.run_id).toBe(runID)

    const events = await app().request(runPath(PaperPaths.events, runID), { headers })
    expect(events.status).toBe(200)
    expect(events.headers.get("content-type")).toContain("text/event-stream")
    const eventReader = events.body!.getReader()
    let eventText = ""
    while (!eventText.includes("event: stage.updated")) {
      const next = await eventReader.read()
      if (next.done) break
      eventText += new TextDecoder().decode(next.value)
    }
    await eventReader.cancel()
    expect(eventText).toContain("event: paper.run.snapshot")
    expect(eventText).toContain("event: stage.updated")

    const guidance = await app().request(runPath(PaperPaths.guidance, runID), {
      ...json({ message: "优先补充方法贡献边界" }),
      headers: { ...headers, "content-type": "application/json" },
    })
    expect(guidance.status).toBe(200)
    expect((await guidance.json()).accepted).toBe(true)

    const control = await app().request(runPath(PaperPaths.control, runID), {
      ...json({ action: "resume" }),
      headers: { ...headers, "content-type": "application/json" },
    })
    expect(control.status).toBe(200)
    expect((await control.json()).status).toBe("running")

    const preview = await app().request(runPath(PaperPaths.preview, runID), { headers })
    expect(preview.status).toBe(200)
    const previewBody = await preview.json()
    expect(previewBody.readonly).toBe(true)
    expect(previewBody.url).toContain("http://127.0.0.1:")
    expect(previewBody.snapshot.schema_version).toBe("preview.v1")

    const exportResponse = await app().request(runPath(PaperPaths.export, runID), {
      ...json({ forced: true }),
      headers: { ...headers, "content-type": "application/json" },
    })
    expect(exportResponse.status).toBe(200)
    const exported = await exportResponse.json()
    expect(exported.status).toBe("blocked")
    expect(exported.failed_checks).toContain("draft_missing")

    const capabilities = await app().request(PaperPaths.capabilities, { headers })
    expect(capabilities.status).toBe(200)
    expect((await capabilities.json()).capabilities.map((capability: { name: string }) => capability.name)).toContain(
      "exa",
    )

    const doctor = await app().request(PaperPaths.doctor, { headers })
    expect(doctor.status).toBe(200)
    expect((await doctor.json()).default_language).toBe("zh-CN")

    const providers = await app().request(PaperPaths.providersDiscover, { headers })
    expect(providers.status).toBe(200)
    const providersBody = await providers.json()
    expect(providersBody.default_model).toBeUndefined()
    expect(providersBody.sample_templates.find((provider: { id: string }) => provider.id === "deepseek").auto_enabled).toBe(false)

    const modelRoles = await app().request(PaperPaths.modelRoles, { headers })
    expect(modelRoles.status).toBe(200)
    expect((await modelRoles.json()).roles).toEqual({})

    const inventory = await app().request(PaperPaths.modelInventory, { headers })
    expect(inventory.status).toBe(200)
    const inventoryBody = await inventory.json()
    expect(inventoryBody.inventory.decision_model).toBeUndefined()
    expect(inventoryBody.inventory.allowlist).toEqual([])
    expect(inventoryBody.routing.every((decision: { source: string }) => decision.source === "blocked")).toBe(true)

    const routing = await app().request(PaperPaths.modelRoutingDecision, {
      ...json({ role: "writer", task_scale: "large", difficulty: "high" }),
      headers: { ...headers, "content-type": "application/json" },
    })
    expect(routing.status).toBe(200)
    const routingBody = await routing.json()
    expect(routingBody.source).toBe("blocked")
    expect(routingBody.diagnostics).toContain("model_allowlist_empty")
  })

  test("stores PaperRuns in Paper Fucker home by default and resumes home/workspace history", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: { formatter: false, lsp: false },
      init: async (dir) => {
        const home = path.join(dir, "paper-home")
        const workspace = path.join(dir, "workspace")
        const legacyHome = path.join(dir, "legacy-opencode-home")
        await mkdir(home, { recursive: true })
        await mkdir(workspace, { recursive: true })
        await mkdir(legacyHome, { recursive: true })
        return { home, workspace, legacyHome }
      },
    })
    previousPaperHome = process.env.PAPER_FUCKER_TEST_HOME
    process.env.PAPER_FUCKER_TEST_HOME = tmp.extra.home
    const previousLegacyHome = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.extra.legacyHome
    const headers = { "x-paper-fucker-directory": tmp.extra.workspace }

    try {
      const homeCreate = await app().request(PaperPaths.runs, {
        ...json({ topic: "默认 home run", language: "zh-CN" }),
        headers: { ...headers, "content-type": "application/json" },
      })
      expect(homeCreate.status).toBe(200)
      const homeBody = await homeCreate.json()
      expect(path.resolve(homeBody.run_dir).startsWith(path.join(tmp.extra.home, ".paper_fucker", "runs"))).toBe(true)
      expect(path.resolve(homeBody.run_dir).startsWith(path.join(tmp.extra.workspace, ".paper_fucker", "runs"))).toBe(false)
      expect(existsSync(path.join(tmp.extra.legacyHome, ".paper_fucker", "runs"))).toBe(false)
      expect(homeBody.run.diagnostics.runtime_root).toBe(path.dirname(homeBody.run_dir))

      const workspaceCreate = await app().request(PaperPaths.runs, {
        ...json({ topic: "显式 workspace run", language: "zh-CN", storage_scope: "workspace" }),
        headers: { ...headers, "content-type": "application/json" },
      })
      expect(workspaceCreate.status).toBe(200)
      const workspaceBody = await workspaceCreate.json()
      expect(path.resolve(workspaceBody.run_dir).startsWith(path.join(tmp.extra.workspace, ".paper_fucker", "runs"))).toBe(true)

      const list = await app().request(PaperPaths.runs, { headers })
      expect(list.status).toBe(200)
      const runs = (await list.json()).runs as Array<{ run_id: string; storage_scope: string }>
      expect(runs.map((run) => run.run_id)).toContain(homeBody.run.run_id)
      expect(runs.map((run) => run.run_id)).toContain(workspaceBody.run.run_id)
      expect(runs.find((run) => run.run_id === homeBody.run.run_id)?.storage_scope).toBe("home")
      expect(runs.find((run) => run.run_id === workspaceBody.run.run_id)?.storage_scope).toBe("workspace")

      const resumed = await app().request(runPath(PaperPaths.resume, homeBody.run.run_id), {
        method: "POST",
        headers,
      })
      expect(resumed.status).toBe(200)
      expect((await resumed.json()).run.run_id).toBe(homeBody.run.run_id)
    } finally {
      if (previousLegacyHome === undefined) delete process.env.OPENCODE_TEST_HOME
      else process.env.OPENCODE_TEST_HOME = previousLegacyHome
    }
  })
})
