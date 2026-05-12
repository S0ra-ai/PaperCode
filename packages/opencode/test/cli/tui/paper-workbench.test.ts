import { describe, expect, test } from "bun:test"
import {
  createPaperRunDashboardState,
  parsePaperWorkbenchPrompt,
  subscribePaperRunLiveMonitor,
  submitPaperWorkbenchPrompt,
} from "../../../src/cli/cmd/tui/routes/paper/workbench"
import type { PaperRunSnapshot } from "../../../src/paper/run"

describe("TUI PaperRun workbench", () => {
  test("parses natural dialog input into a PaperRun create request", () => {
    const request = parsePaperWorkbenchPrompt(
      "--code packages/opencode --paper notes/draft.pdf --data data/results.csv --log logs/run.log --profile nature-paper --lang en-US 上传代码写一篇可复现系统论文",
    )

    expect(request.topic).toBe("上传代码写一篇可复现系统论文")
    expect(request.code_paths).toEqual(["packages/opencode"])
    expect(request.paper_files).toEqual(["notes/draft.pdf"])
    expect(request.dataset_paths).toEqual(["data/results.csv"])
    expect(request.experiment_logs).toEqual(["logs/run.log"])
    expect(request.target_profile).toBe("nature-paper")
    expect(request.language).toBe("en-US")
    expect(request.quality_mode).toBe("reviewable_bundle")
  })

  test("parses submission intent into stricter PaperRun quality mode", () => {
    const request = parsePaperWorkbenchPrompt("--profile nature-paper --submission 基于仓库生成投稿候选论文")

    expect(request.topic).toBe("基于仓库生成投稿候选论文")
    expect(request.target_profile).toBe("nature-paper")
    expect(request.budget_tier).toBe("submission")
    expect(request.quality_mode).toBe("submission_candidate")
    expect(request.language).toBe("zh-CN")
  })

  test("uses the TUI-selected research depth when no prompt flag overrides it", () => {
    const request = parsePaperWorkbenchPrompt({
      input: "验证递归 agent 对大型仓库的论文产出能力",
      parts: [],
      budget_tier: "deep",
    })

    expect(request.budget_tier).toBe("deep")
    expect(request.quality_mode).toBe("reviewable_bundle")
  })

  test("submission research depth enables submission candidate checks", () => {
    const request = parsePaperWorkbenchPrompt({
      input: "准备 Nature 风格投稿候选包",
      parts: [],
      budget_tier: "submission",
    })

    expect(request.budget_tier).toBe("submission")
    expect(request.quality_mode).toBe("submission_candidate")
  })

  test("classifies attached files into PaperRun material inputs", () => {
    const request = parsePaperWorkbenchPrompt({
      input: "基于这些材料生成论文",
      parts: [
        { type: "file", url: "file:///docs/draft.pdf", mime: "application/pdf", filename: "draft.pdf", source: { type: "file", path: "docs/draft.pdf", text: { value: "", start: 0, end: 0 } } },
        { type: "file", url: "file:///data/results.csv", mime: "text/csv", filename: "results.csv", source: { type: "file", path: "data/results.csv", text: { value: "", start: 0, end: 0 } } },
        { type: "file", url: "file:///logs/run.log", mime: "text/plain", filename: "run.log", source: { type: "file", path: "logs/run.log", text: { value: "", start: 0, end: 0 } } },
        { type: "file", url: "file:///src/index.ts", mime: "text/typescript", filename: "index.ts", source: { type: "file", path: "src/index.ts", text: { value: "", start: 0, end: 0 } } },
      ],
    })

    expect(request.paper_files).toEqual(["docs/draft.pdf"])
    expect(request.dataset_paths).toEqual(["data/results.csv"])
    expect(request.experiment_logs).toEqual(["logs/run.log"])
    expect(request.code_paths).toEqual(["src/index.ts"])
  })

  test("submits home prompt to /paper/runs instead of session chat", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const result = await submitPaperWorkbenchPrompt({
      baseUrl: "http://localhost:4096",
      directory: "E:/Project/paper_fucker",
      prompt: { input: "--code packages/opencode 生成论文", parts: [] },
      fetch: async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} })
        return Response.json({
          run: {
            run_id: "run-paper",
            stage_graph: { stages: [] },
            agent_tree: { nodes: [] },
            diagnostics: {},
          },
        })
      },
    })

    expect(result.runID).toBe("run-paper")
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe("http://localhost:4096/paper/runs")
    expect(calls[0]!.init.method).toBe("POST")
    expect((calls[0]!.init.headers as Record<string, string>)["x-opencode-directory"]).toBe("E:/Project/paper_fucker")
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({
      topic: "生成论文",
      code_paths: ["packages/opencode"],
    })
  })

  test("maps PaperRun snapshot to Chinese dashboard panels", () => {
    const snapshot = {
      run_id: "run-paper",
      topic: "论文工作台",
      stage_graph: {
        stages: [
          { id: "intake", title: "Normalize", status: "succeeded" },
          { id: "planning", title: "Plan", status: "running" },
        ],
      },
      source_ledger: [{ source_id: "src-1" }],
      claim_ledger: [{ claim_id: "claim-1" }, { claim_id: "claim-2" }],
      artifacts: [{ artifact_id: "artifact-draft", kind: "outline", path: "writing/draft-stage.json", metadata: { artifact_schema: "DraftPaper.v1" } }],
      drafts: [{ draft_id: "draft-1", title: "论文工作台", format: "markdown", path: "draft.md" }],
      agent_tree: {
        max_depth: null,
        max_parallel: 4,
        recursive_policy: { depth_policy: "unbounded" },
        nodes: [
          { agent_id: "agent-root", role: "planner", status: "running", provider_id: "deepseek", model_id: "deepseek-v4-pro", depth: 0 },
          { agent_id: "agent-child", role: "reviewer", status: "planned", provider_id: "openai", model_id: "gpt-5.2", depth: 1 },
        ],
      },
      agent_team: {
        members: [
          { member_id: "member-root", status: "active" },
          { member_id: "member-child", status: "planned" },
        ],
        tasks: [
          { task_id: "team-task-code", title: "代码地图", status: "assigned" },
          { task_id: "team-task-review", title: "证据审查", status: "queued" },
        ],
        mailbox: [{ message_id: "msg-1", read_by: ["member-child"] }],
        lead_member_id: "member-root",
        coverage: {
          active_tasks: 1,
          completed_tasks: 0,
          blocked_tasks: 0,
          max_member_depth: 1,
          evidence_backed_artifacts: 0,
          rejected_evidence: 0,
        },
      },
      diagnostics: {
        counts: { events: 3, artifacts: 4 },
        cost: { total_usd: 0.42, llm_usd: 0.4, api_usd: 0.02, budget: { total_soft_usd: 5 }, alerts: [] },
        final_gate: { status: "blocked", blockers: ["unsupported_claim"] },
        tool_traces: [
          {
            tool_name: "model.writer",
            status: "succeeded",
            started_at: "2026-05-11T00:00:00Z",
            input: { tokens: { input: 1000, context_limit: 8000 } },
            output: { tokens: { output: 500 } },
          },
        ],
      },
      experiment_status: { reproduction_gate: "blocked" },
      preview_state: { status: "ready" },
      export_state: { status: "blocked", failed_checks: ["unsupported_claim"] },
      pause_questions: [{ question_id: "q1", message: "需要确认数据外传" }],
    } as unknown as PaperRunSnapshot

    const state = createPaperRunDashboardState(snapshot)

    expect(state.language).toBe("zh-CN")
    expect(state.stage_graph.map((stage) => stage.label)).toEqual(["输入整理", "研究规划"])
    expect(state.panels.map((panel) => panel.label)).toContain("Agent Tree")
    expect(state.panels.map((panel) => panel.label)).toContain("Agent Team")
    expect(state.panels.map((panel) => panel.label)).toContain("Source Ledger")
    expect(state.sidebar.cost.formatted_total).toBe("$0.42")
    expect(state.sidebar.cost.last_call_tokens).toBe(1500)
    expect(state.sidebar.outline.source).toBe("draft")
    expect(state.sidebar.agent_tree).toMatchObject({
      total_agents: 2,
      active_agents: 2,
      max_depth_observed: 1,
      depth_policy: "unbounded",
    })
    expect(state.sidebar.agent_team).toMatchObject({
      total_members: 2,
      active_members: 2,
      queued_tasks: 1,
      active_tasks: 1,
      unread_messages: 1,
      max_member_depth: 1,
    })
    expect(state.sidebar.gate).toMatchObject({
      status: "blocked",
      failed_checks: ["unsupported_claim"],
      reproduction_gate: "blocked",
    })
    expect(state.sidebar.diagnostics.recent_calls[0]!.name).toBe("model.writer")
    expect(state.controls.map((control) => control.label)).toEqual([
      "发送指导",
      "继续运行",
      "重试阶段",
      "取消运行",
      "打开预览",
      "导出终稿",
      "导出 forced draft",
      "能力健康",
      "模型工作台",
      "模型角色",
    ])
    expect(state.environment_status.map((item) => item.label)).toContain("模型工作台")
    expect(state.pause_questions[0]!.message).toBe("需要确认数据外传")
  })

  test("subscribes to PaperRun SSE snapshots for live monitor updates", async () => {
    const snapshot = { schema_version: "PaperRun.v1", run_id: "run-live" } as PaperRunSnapshot
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(`event: paper.run.snapshot\ndata: ${JSON.stringify({ snapshot })}\n\n`),
        )
        controller.close()
      },
    })
    const seen: PaperRunSnapshot[] = []
    subscribePaperRunLiveMonitor({
      baseUrl: "http://localhost:4096",
      runID: "run-live",
      fetch: async () => new Response(stream, { headers: { "content-type": "text/event-stream" } }),
      onSnapshot: (value) => seen.push(value),
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(seen.map((item) => item.run_id)).toEqual(["run-live"])
  })
})
