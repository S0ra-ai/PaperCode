import { describe, expect, test } from "bun:test"
import {
  createPaperRunDashboardState,
  fetchPaperWorkbenchCapabilities,
  fetchPaperWorkbenchModelRoles,
  requestPaperWorkbenchExport,
  requestPaperWorkbenchPreview,
  sendPaperWorkbenchControl,
  submitPaperWorkbenchGuidance,
} from "../../../src/cli/cmd/tui/routes/paper/workbench"
import type { PaperRunSnapshot } from "../../../src/paper/run"

function snapshot(): PaperRunSnapshot {
  return {
    schema_version: "PaperRun.v1",
    run_id: "run-live-controls",
    topic: "中文论文工作台 live controls",
    workspace: "E:/Project/paper_fucker",
    status: "running",
    created_at: "2026-05-10T00:00:00Z",
    updated_at: "2026-05-10T00:00:00Z",
    intake: { topic: "中文论文工作台 live controls" },
    budget_tier: "standard",
    quality_mode: "reviewable_bundle",
    data_egress_policy: {
      mode: "private_first",
      allowed_paths: [],
      denied_patterns: [],
      external_model_full_text: false,
    },
    stage_graph: {
      schema_version: "ResearchRunGraph.v1",
      stages: [
        { id: "intake", title: "Intake", status: "succeeded", depends_on: [], artifact_schema: "ResearchBrief.v1" },
        {
          id: "literature",
          title: "Literature",
          status: "blocked",
          depends_on: ["intake"],
          artifact_schema: "LiteratureMap.v1",
          summary: "需要 Exa",
        },
      ],
    },
    events: [],
    source_ledger: [],
    claim_ledger: [],
    experiment_status: { planned: false, exploratory_runs: 0, reproduction_gate: "blocked" },
    agent_tree: { schema_version: "AgentTree.v1", max_depth: 2, max_parallel: 4, nodes: [] },
    diagnostics: {
      counts: {
        events: 0,
        artifacts: 0,
        sources: 0,
        tool_traces: 0,
        claims: 0,
        drafts: 0,
        reviews: 0,
        exports: 0,
        checkpoints: 0,
      },
      model_roles: {
        planner: { provider_id: "deepseek", model_id: "deepseek-v4-pro" },
        literature_researcher: { provider_id: "exa-backed", model_id: "researcher" },
        code_analyst: { provider_id: "local", model_id: "code-small" },
        experiment_designer: { provider_id: "deepseek", model_id: "deepseek-v4-pro" },
        writer: { provider_id: "deepseek", model_id: "deepseek-v4-pro" },
        reviewer: { provider_id: "openrouter", model_id: "reviewer-large" },
        citation_checker: { provider_id: "local", model_id: "citation-checker" },
        cheap_summarizer: { provider_id: "local", model_id: "small" },
      },
      cost: {},
      final_gate: { status: "blocked" },
      tool_traces: [],
    },
    artifacts: [],
    drafts: [],
    reviews: [],
    exports: [],
    pause_questions: [{ question_id: "q-data", reason: "data_egress", message: "请确认数据外传", required: true, created_at: "2026-05-10T00:00:00Z" }],
    preview_state: { readonly: true, status: "ready", run_id: "run-live-controls" },
    export_state: {
      run_id: "run-live-controls",
      status: "blocked",
      formats: [],
      artifact_ids: [],
      failed_checks: ["final_gate_not_passed"],
      message: "blocked",
    },
    controller_state: {
      schema_version: "PaperRunController.v1",
      run_id: "run-live-controls",
      status: "paused",
      checkpoints: [],
      guidance_queue: [{ guidance_id: "g1", message: "补充文献", status: "queued", event_id: "e1", created_at: "2026-05-10T00:00:00Z" }],
      controls: [],
      internal_sessions: [],
      updated_at: "2026-05-10T00:00:00Z",
    },
    internal_sessions: [],
  } as unknown as PaperRunSnapshot
}

describe("TUI PaperRun live controls", () => {
  test("builds Chinese live controls, model roles, and capability health without chat-first actions", () => {
    const state = createPaperRunDashboardState(snapshot(), {
      capabilities: [
        { name: "exa", type: "mcp", title: "Exa", network: "required" },
        { name: "skill.nature-paper", type: "skill", title: "Nature paper", network: "required" },
        { name: "paper.export-bundle", type: "first_party_tool", title: "Export", network: "none" },
      ],
      health: {
        mcp: { exa: "enabled" },
        skills: { "nature-paper": "installed" },
        toolchain: { pandoc: "available", latex: "available" },
      },
    })

    expect(state.controller_status.label).toBe("已暂停")
    expect(state.controls.map((control) => control.label)).toContain("发送指导")
    expect(state.controls.map((control) => control.label)).toContain("继续运行")
    expect(state.controls.map((control) => control.label)).toContain("重试阶段")
    expect(state.controls.map((control) => control.label)).toContain("取消运行")
    expect(state.controls.map((control) => control.label)).toContain("打开预览")
    expect(state.controls.find((control) => control.id === "export_final")?.enabled).toBe(false)
    expect(state.controls.find((control) => control.id === "export_forced")?.enabled).toBe(true)
    expect(state.controls.some((control) => control.label.includes("普通聊天"))).toBe(false)
    expect(state.model_roles.find((role) => role.role === "writer")).toMatchObject({
      label: "写作模型",
      provider_model: "deepseek/deepseek-v4-pro",
    })
    expect(state.capability_health.map((item) => item.label)).toContain("Exa MCP")
    expect(state.capability_health.map((item) => item.label)).toContain("Nature Paper Skill")
    expect(state.capability_health.map((item) => item.status_label)).toContain("已启用")
  })

  test("calls PaperRun control, guidance, preview, export, capability, and model-role APIs", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} })
      const url = String(input)
      if (url.endsWith("/guidance")) return Response.json({ accepted: true, run_id: "run-live-controls" })
      if (url.endsWith("/control")) return Response.json({ status: "running", run_id: "run-live-controls" })
      if (url.endsWith("/preview")) return Response.json({ readonly: true, run_id: "run-live-controls" })
      if (url.endsWith("/export")) return Response.json({ status: "forced_draft", run_id: "run-live-controls" })
      if (url.endsWith("/capabilities")) return Response.json({ capabilities: [{ name: "exa" }] })
      if (url.endsWith("/model-roles")) return Response.json({ roles: { writer: { provider_id: "deepseek", model_id: "deepseek-v4-pro" } } })
      throw new Error(`unexpected url ${url}`)
    }

    await submitPaperWorkbenchGuidance({
      baseUrl: "http://localhost:4096",
      directory: "E:/Project/paper_fucker",
      runID: "run-live-controls",
      message: "优先补充方法贡献",
      fetch: fakeFetch,
    })
    await sendPaperWorkbenchControl({
      baseUrl: "http://localhost:4096",
      directory: "E:/Project/paper_fucker",
      runID: "run-live-controls",
      action: "retry",
      stage: "literature",
      fetch: fakeFetch,
    })
    await requestPaperWorkbenchPreview({
      baseUrl: "http://localhost:4096",
      directory: "E:/Project/paper_fucker",
      runID: "run-live-controls",
      fetch: fakeFetch,
    })
    await requestPaperWorkbenchExport({
      baseUrl: "http://localhost:4096",
      directory: "E:/Project/paper_fucker",
      runID: "run-live-controls",
      forced: true,
      fetch: fakeFetch,
    })
    await fetchPaperWorkbenchCapabilities({
      baseUrl: "http://localhost:4096",
      directory: "E:/Project/paper_fucker",
      fetch: fakeFetch,
    })
    await fetchPaperWorkbenchModelRoles({
      baseUrl: "http://localhost:4096",
      directory: "E:/Project/paper_fucker",
      fetch: fakeFetch,
    })

    expect(calls.map((call) => call.url)).toEqual([
      "http://localhost:4096/paper/runs/run-live-controls/guidance",
      "http://localhost:4096/paper/runs/run-live-controls/control",
      "http://localhost:4096/paper/runs/run-live-controls/preview",
      "http://localhost:4096/paper/runs/run-live-controls/export",
      "http://localhost:4096/paper/capabilities",
      "http://localhost:4096/paper/model-roles",
    ])
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ message: "优先补充方法贡献" })
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ action: "retry", stage: "literature" })
    expect(JSON.parse(String(calls[3]!.init.body))).toEqual({ forced: true })
    expect((calls[1]!.init.headers as Record<string, string>)["x-opencode-directory"]).toBe(
      "E:/Project/paper_fucker",
    )
  })
})
