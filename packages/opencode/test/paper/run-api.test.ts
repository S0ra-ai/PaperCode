import { afterEach, describe, expect, test } from "bun:test"
import { existsSync } from "fs"
import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"
import { ConfigProvider, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { Flag } from "@opencode-ai/core/flag/flag"
import {
  createPaperRun,
  PAPER_MODEL_ROLES,
  stopAllPaperRunLivePreviews,
  updatePaperModelAllowlist,
  type PaperModelRole,
} from "../../src/paper"
import { createResearchRun } from "../../src/paper/research/runtime"
import { Server } from "../../src/server/server"
import { PaperPaths } from "../../src/server/routes/instance/httpapi/groups/paper"
import { ExperimentalHttpApiServer } from "../../src/server/routes/instance/httpapi/server"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"
import * as Log from "@opencode-ai/core/util/log"

// createPaperRun drives the default engine, which renders through the real toolchain when installed.
// A full PaperRun renders through the real toolchain (pandoc + a TeX engine) when one is installed,
// which takes minutes on a loaded machine.
const PAPER_RUN_INTEGRATION_TIMEOUT = 300_000

void Log.init({ print: false })

const originalHttpApi = Flag.OPENCODE_EXPERIMENTAL_HTTPAPI
let previousPaperHome: string | undefined
const TEST_MODEL = "test-provider/test-model"

function testModelRoles(): Record<PaperModelRole, string> {
  return Object.fromEntries(PAPER_MODEL_ROLES.map((role) => [role, TEST_MODEL])) as Record<PaperModelRole, string>
}

async function seedTestModelInventory(home: string) {
  await updatePaperModelAllowlist([TEST_MODEL], { home, decision_model: TEST_MODEL })
}

function app() {
  Flag.OPENCODE_EXPERIMENTAL_HTTPAPI = true
  const handler = HttpRouter.toWebHandler(
    ExperimentalHttpApiServer.routes.pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            PAPERCODE_SERVER_PASSWORD: undefined,
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
  if (previousPaperHome === undefined) delete process.env.PAPERCODE_TEST_HOME
  else process.env.PAPERCODE_TEST_HOME = previousPaperHome
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

  test("allocates unique PaperRun directories for concurrent creates with the same generated id", async () => {
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    let eventIndex = 0
    const options = {
      workspace: tmp.path,
      home: tmp.path,
      idFactory: (kind: "run" | "event" | "artifact") =>
        kind === "run" ? "run-fixed" : `${kind}-${++eventIndex}`,
    }

    const [first, second] = await Promise.all([
      createResearchRun({ topic: "first" }, options),
      createResearchRun({ topic: "second" }, options),
    ])
    const ids = new Set([first.run.run_id, second.run.run_id])

    expect(ids.size).toBe(2)
    expect(ids.has("run-fixed")).toBe(true)
    expect([...ids].some((id) => id.startsWith("run-") && id !== "run-fixed")).toBe(true)
    expect(first.run_dir).not.toBe(second.run_dir)
    expect(existsSync(first.run_dir)).toBe(true)
    expect(existsSync(second.run_dir)).toBe(true)
  })

  test("serves Paper model inventory JSON through the default Hono TUI backend", async () => {
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    previousPaperHome = process.env.PAPERCODE_TEST_HOME
    process.env.PAPERCODE_TEST_HOME = tmp.path
    Flag.OPENCODE_EXPERIMENTAL_HTTPAPI = false

    const response = await Server.Legacy().app.request(PaperPaths.modelInventory, {
      headers: { "x-papercode-directory": tmp.path },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
    const body = await response.json()
    expect(body.inventory.schema_version).toBe("PaperModelInventory.v1")
    expect(body.inventory.allowlist).toEqual([])
    expect(body.roles).toEqual({})
    expect(body.routing.every((decision: { source: string }) => decision.source === "blocked")).toBe(true)
  })

  test("model inventory surfaces providers declared in config as registered candidates", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: {
        formatter: false,
        lsp: false,
        providers: {
          fjbdg: {
            displayName: "fjbdg",
            apiKeyEnv: "FJBDG_API_KEY",
            api: "openai-completions",
            baseURL: "https://newapi.example.test:10443/v1",
            reasoning: "max",
            models: [
              {
                id: "deepseek-v4-flash-vision-exp",
                contextWindow: 1000000,
                maxTokens: 384000,
                input: ["text", "image"],
              },
            ],
          },
        },
      },
    })
    previousPaperHome = process.env.PAPERCODE_TEST_HOME
    process.env.PAPERCODE_TEST_HOME = tmp.path
    Flag.OPENCODE_EXPERIMENTAL_HTTPAPI = false

    const response = await Server.Legacy().app.request(PaperPaths.modelInventory, {
      headers: { "x-papercode-directory": tmp.path },
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.inventory.provider_registrations.fjbdg).toMatchObject({
      kind: "manual",
      status: "registered",
      model_count: 1,
    })
    const candidate = body.inventory.candidates.find(
      (item: { model_ref: string }) => item.model_ref === "fjbdg/deepseek-v4-flash-vision-exp",
    )
    expect(candidate).toMatchObject({ source: "manual", context_hint: "long", allowed: false })
    // Declared providers are registered but their models still require an explicit allowlist choice.
    expect(body.inventory.allowlist).toEqual([])
  })

  test("registers OpenAI-compatible providers with all discovered models enabled by default", async () => {
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    previousPaperHome = process.env.PAPERCODE_TEST_HOME
    process.env.PAPERCODE_TEST_HOME = tmp.path
    const headers = { "x-papercode-directory": tmp.path }
    const previousFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      Response.json({
        data: [{ id: "paper-fast" }, { id: "paper-pro" }],
      })) as unknown as typeof fetch

    try {
      const response = await app().request(PaperPaths.providersDiscover, {
        ...json({
          provider_id: "lab",
          provider_name: "Lab Models",
          base_url: "https://lab.example/v1",
          api_key: "sk-test",
          compatibility: "openai-compatible",
          persist: true,
        }),
        headers: { ...headers, "content-type": "application/json" },
      })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.inventory.decision_model).toBe("lab/paper-fast")
      expect(body.inventory.allowlist.sort()).toEqual(["lab/paper-fast", "lab/paper-pro"])
      expect(body.inventory.candidates.map((candidate: { model_ref: string; allowed: boolean }) => [candidate.model_ref, candidate.allowed])).toEqual([
        ["lab/paper-fast", true],
        ["lab/paper-pro", true],
      ])
      expect(body.inventory.provider_registrations.lab).toMatchObject({
        provider_name: "Lab Models",
        kind: "openai_compatible",
        model_count: 2,
        allowed_count: 2,
      })
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  test("serves PaperRun lifecycle, diagnostics, capability, provider, and role endpoints", async () => {
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    previousPaperHome = process.env.PAPERCODE_TEST_HOME
    process.env.PAPERCODE_TEST_HOME = tmp.path
    const headers = { "x-papercode-directory": tmp.path }

    const create = await app().request(PaperPaths.runs, {
      ...json({
        topic: "代码仓库生成可验证论文",
        code_paths: ["packages/opencode"],
        target_journal: "中国计算机学报",
        target_journal_url: "https://cjc.ict.ac.cn/",
        language: "zh-CN",
      }),
      headers: { ...headers, "content-type": "application/json" },
    })
    expect(create.status).toBe(200)
    const created = await create.json()
    expect(created.run.intake.topic).toBe("代码仓库生成可验证论文")
    expect(created.run.intake.target_profile).toBe("cjc-paper")
    expect(created.run.intake.target_journal).toBe("中国计算机学报")
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
    expect(previewBody.snapshot.monitor.experiment_environment.status_label).toBe("可用")
    expect(previewBody.snapshot.monitor.experiment_environment.groups.map((group: { label: string }) => group.label)).toEqual([
      "GPU",
      "运行时",
      "编译器",
      "容器 / 虚拟化",
    ])
    expect(Array.isArray(previewBody.snapshot.monitor.ledger.sources)).toBe(true)
    expect(Array.isArray(previewBody.snapshot.monitor.ledger.claims)).toBe(true)
    expect(previewBody.snapshot.monitor.cost_agent.agent_tree.total_agents).toBeGreaterThanOrEqual(1)
    expect(previewBody.snapshot.monitor.cost_agent.tokens.total_tokens).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(previewBody.snapshot.monitor.model_routing)).toBe(true)

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

  test("does not let request model_roles bypass the user allowlist", async () => {
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    const run = await createPaperRun(
      {
        topic: "未授权阶段模型应阻断",
        workspace_path: tmp.path,
        language: "zh-CN",
        model_roles: testModelRoles(),
      },
      { workspace: tmp.path, home: tmp.path },
    )

    expect(run.snapshot.status).toBe("blocked")
    expect(run.snapshot.diagnostics.model_roles).toEqual({})
    const routing = run.snapshot.diagnostics.model_routing
    expect(routing).toBeDefined()
    expect(routing!.every((decision) => decision.source === "blocked")).toBe(true)
    expect(routing!.every((decision) => decision.diagnostics.includes("forced_model_not_allowed"))).toBe(true)
    const inventory = run.snapshot.diagnostics.model_inventory
    expect(inventory).toBeDefined()
    expect(inventory!.allowlist).toEqual([])
    expect(run.snapshot.agent_tree.nodes[0]).toMatchObject({
      provider_id: "unconfigured",
      model_id: "unconfigured",
      status: "blocked",
    })
  })

  test("dry-runs and applies experiment starter files to the workspace without overwriting by default", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: { formatter: false, lsp: false },
      init: async (dir) => {
        const home = path.join(dir, "paper-home")
        const workspace = path.join(dir, "workspace")
        await mkdir(path.join(workspace, "src"), { recursive: true })
        await mkdir(home, { recursive: true })
        await writeFile(
          path.join(workspace, "package.json"),
          JSON.stringify({ scripts: { test: "node -e \"console.log('ok')\"" } }, null, 2),
        )
        await writeFile(
          path.join(workspace, "src", "method.ts"),
          ["export function normalizeClaim(value: string) {", "  return value.trim().toLowerCase()", "}"].join("\n"),
        )
        return { home, workspace }
      },
    })
    previousPaperHome = process.env.PAPERCODE_TEST_HOME
    process.env.PAPERCODE_TEST_HOME = tmp.extra.home
    await seedTestModelInventory(tmp.extra.home)
    const headers = { "x-papercode-directory": tmp.extra.workspace }
    const run = await createPaperRun(
      {
        topic: "代码实验 starter 写入验证",
        workspace_path: tmp.extra.workspace,
        code_paths: ["src"],
        language: "zh-CN",
        model_roles: testModelRoles(),
      },
      { workspace: tmp.extra.workspace, home: tmp.extra.home },
    )
    expect(run.snapshot.diagnostics.experiment_starter_pack?.status).toBe("ready")

    const dryRun = await app().request(runPath(PaperPaths.experimentStarterApply, run.run_id), {
      ...json({ dry_run: true }),
      headers: { ...headers, "content-type": "application/json" },
    })
    expect(dryRun.status).toBe(200)
    const dryRunBody = await dryRun.json()
    expect(dryRunBody.dry_run).toBe(true)
    expect(dryRunBody.files.every((file: { status: string }) => file.status === "would_write")).toBe(true)
    expect(existsSync(path.join(tmp.extra.workspace, "experiments", "starter", "baseline-starter.ts"))).toBe(false)

    const apply = await app().request(runPath(PaperPaths.experimentStarterApply, run.run_id), {
      ...json({ dry_run: false }),
      headers: { ...headers, "content-type": "application/json" },
    })
    expect(apply.status).toBe(200)
    const applyBody = await apply.json()
    expect(applyBody.status).toBe("ready")
    expect(applyBody.written_count).toBe(4)
    expect(applyBody.audit_artifact_id).toMatch(/^artifact-/)
    expect(await readFile(path.join(tmp.extra.workspace, "experiments", "starter", "README.md"), "utf8")).toContain(
      "Experiment Protocol Starter",
    )

    const conflict = await app().request(runPath(PaperPaths.experimentStarterApply, run.run_id), {
      ...json({ dry_run: false }),
      headers: { ...headers, "content-type": "application/json" },
    })
    expect(conflict.status).toBe(200)
    const conflictBody = await conflict.json()
    expect(conflictBody.status).toBe("blocked")
    expect(conflictBody.conflict_count).toBe(4)

    const overwrite = await app().request(runPath(PaperPaths.experimentStarterApply, run.run_id), {
      ...json({ dry_run: false, overwrite: true, update_package_json: true, file_paths: ["experiments/starter/README.md"] }),
      headers: { ...headers, "content-type": "application/json" },
    })
    expect(overwrite.status).toBe(200)
    const overwriteBody = await overwrite.json()
    expect(overwriteBody.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "experiments/starter/README.md", status: "overwritten" }),
        expect.objectContaining({ path: "package.json", status: "overwritten" }),
      ]),
    )
    const packageJson = JSON.parse(await readFile(path.join(tmp.extra.workspace, "package.json"), "utf8"))
    expect(packageJson.scripts.test).toBe("node -e \"console.log('ok')\"")
    expect(packageJson.scripts["repro:container:starter"]).toContain("Dockerfile.repro")

    const get = await app().request(runPath(PaperPaths.run, run.run_id), { headers })
    expect(get.status).toBe(200)
    const snapshot = (await get.json()).run
    expect(snapshot.artifacts.some((artifact: { metadata?: { artifact_schema?: string } }) => artifact.metadata?.artifact_schema === "ExperimentProtocolStarterApplyResult.v1")).toBe(true)
    expect(snapshot.events.some((event: { type: string }) => event.type === "experiment.starterpack.applied")).toBe(true)
  }, PAPER_RUN_INTEGRATION_TIMEOUT)

  test("stores PaperRuns in PaperCode home by default and resumes home/workspace history", async () => {
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
    previousPaperHome = process.env.PAPERCODE_TEST_HOME
    process.env.PAPERCODE_TEST_HOME = tmp.extra.home
    const previousLegacyHome = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.extra.legacyHome
    const headers = { "x-papercode-directory": tmp.extra.workspace }

    try {
      const homeCreate = await app().request(PaperPaths.runs, {
        ...json({ topic: "默认 home run", language: "zh-CN" }),
        headers: { ...headers, "content-type": "application/json" },
      })
      expect(homeCreate.status).toBe(200)
      const homeBody = await homeCreate.json()
      expect(path.resolve(homeBody.run_dir).startsWith(path.join(tmp.extra.home, ".papercode", "runs"))).toBe(true)
      expect(path.resolve(homeBody.run_dir).startsWith(path.join(tmp.extra.workspace, ".papercode", "runs"))).toBe(false)
      expect(existsSync(path.join(tmp.extra.legacyHome, ".papercode", "runs"))).toBe(false)
      expect(homeBody.run.diagnostics.runtime_root).toBe(path.dirname(homeBody.run_dir))

      const workspaceCreate = await app().request(PaperPaths.runs, {
        ...json({ topic: "显式 workspace run", language: "zh-CN", storage_scope: "workspace" }),
        headers: { ...headers, "content-type": "application/json" },
      })
      expect(workspaceCreate.status).toBe(200)
      const workspaceBody = await workspaceCreate.json()
      expect(path.resolve(workspaceBody.run_dir).startsWith(path.join(tmp.extra.workspace, ".papercode", "runs"))).toBe(true)

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

  test("keeps diagnostics on a rejected paper request instead of an empty 400", async () => {
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    previousPaperHome = process.env.PAPERCODE_TEST_HOME
    process.env.PAPERCODE_TEST_HOME = tmp.path
    const headers = { "x-papercode-directory": tmp.path }

    const response = await app().request(PaperPaths.modelRoles, {
      ...json({ default_model: "not-a-model-ref" }),
      headers: { ...headers, "content-type": "application/json" },
    })

    const body = await response.json()
    expect(body.error?.schema_version).toBe("PaperApiError.v1")
    expect(typeof body.error?.message).toBe("string")
    expect(body.error.message.length).toBeGreaterThan(0)
    expect(typeof body.error?.log_path).toBe("string")
  }, PAPER_RUN_INTEGRATION_TIMEOUT)
})
