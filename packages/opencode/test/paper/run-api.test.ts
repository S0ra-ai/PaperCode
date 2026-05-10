import { afterEach, describe, expect, test } from "bun:test"
import { ConfigProvider, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { Flag } from "@opencode-ai/core/flag/flag"
import { PaperPaths } from "../../src/server/routes/instance/httpapi/groups/paper"
import { ExperimentalHttpApiServer } from "../../src/server/routes/instance/httpapi/server"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"
import * as Log from "@opencode-ai/core/util/log"

void Log.init({ print: false })

const originalHttpApi = Flag.OPENCODE_EXPERIMENTAL_HTTPAPI

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
  Flag.OPENCODE_EXPERIMENTAL_HTTPAPI = originalHttpApi
  await disposeAllInstances()
  await resetDatabase()
})

describe("PaperRun HttpApi", () => {
  test("serves PaperRun lifecycle, diagnostics, capability, provider, and role endpoints", async () => {
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    const headers = { "x-opencode-directory": tmp.path }

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
    expect(created.run.stage_graph.stages.map((stage: { id: string }) => stage.id)).toContain("intake")
    expect(created.run.agent_tree.nodes[0].role).toBe("root_run_agent")

    const runID = created.run.run_id as string
    const get = await app().request(runPath(PaperPaths.run, runID), { headers })
    expect(get.status).toBe(200)
    expect((await get.json()).run.run_id).toBe(runID)

    const events = await app().request(runPath(PaperPaths.events, runID), { headers })
    expect(events.status).toBe(200)
    expect(events.headers.get("content-type")).toContain("text/event-stream")
    expect(await events.text()).toContain("event: paper.run.snapshot")

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
    expect((await preview.json()).readonly).toBe(true)

    const exportResponse = await app().request(runPath(PaperPaths.export, runID), {
      ...json({ forced: true }),
      headers: { ...headers, "content-type": "application/json" },
    })
    expect(exportResponse.status).toBe(200)
    expect((await exportResponse.json()).status).toBe("forced_draft")

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
    expect((await providers.json()).default_model).toBe("deepseek/deepseek-v4-pro")

    const modelRoles = await app().request(PaperPaths.modelRoles, { headers })
    expect(modelRoles.status).toBe(200)
    expect((await modelRoles.json()).roles.writer.model_id).toBe("deepseek-v4-pro")
  })
})
