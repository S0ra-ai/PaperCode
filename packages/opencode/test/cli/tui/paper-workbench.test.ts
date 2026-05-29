import { describe, expect, test } from "bun:test"
import {
  createPaperRunDashboardState,
  parsePaperWorkbenchPrompt,
  requestPaperWorkbenchExperimentProtocolRun,
  requestPaperWorkbenchExperimentStarterApply,
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
    expect(request.storage_scope).toBe("home")
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

  test("uses the current conversation workspace path as PaperRun workspace", () => {
    const request = parsePaperWorkbenchPrompt({
      input: "基于当前目录生成论文",
      parts: [],
      workspace_path: "E:/Project/example-paper",
    })

    expect(request.workspace_path).toBe("E:/Project/example-paper")
    expect(request.storage_scope).toBe("home")
  })

  test("can explicitly request workspace PaperRun storage from the TUI", () => {
    const request = parsePaperWorkbenchPrompt({
      input: "基于当前目录生成论文",
      parts: [],
      workspace_path: "E:/Project/example-paper",
      storage_scope: "workspace",
    })

    expect(request.workspace_path).toBe("E:/Project/example-paper")
    expect(request.storage_scope).toBe("workspace")
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

  test("uses the TUI-selected journal context for PaperRun profile selection", () => {
    const request = parsePaperWorkbenchPrompt({
      input: "生成面向计算机学报的论文",
      parts: [],
      target_profile: "cjc-paper",
      target_journal: "中国计算机学报",
      target_journal_url: "https://cjc.ict.ac.cn/",
    })

    expect(request.topic).toBe("生成面向计算机学报的论文")
    expect(request.target_profile).toBe("cjc-paper")
    expect(request.target_journal).toBe("中国计算机学报")
    expect(request.target_journal_url).toBe("https://cjc.ict.ac.cn/")
  })

  test("keeps unknown journal selection as custom-journal for runtime profile generation", () => {
    const request = parsePaperWorkbenchPrompt({
      input: "为新期刊准备投稿草稿",
      parts: [],
      target_journal: "Journal of Unknown Systems",
      target_journal_url: "https://example.org/authors",
    })

    expect(request.target_profile).toBe("custom-journal")
    expect(request.target_journal).toBe("Journal of Unknown Systems")
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
    expect((calls[0]!.init.headers as Record<string, string>)["x-paper-fucker-directory"]).toBe("E:/Project/paper_fucker")
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({
      topic: "生成论文",
      code_paths: ["packages/opencode"],
      storage_scope: "home",
    })
  })

  test("surfaces structured Chinese PaperRun creation diagnostics", async () => {
    await expect(
      submitPaperWorkbenchPrompt({
        baseUrl: "http://localhost:4096",
        directory: "E:/Project/paper_fucker",
        prompt: { input: "我想研究关于 agent team 的论文", parts: [] },
        fetch: async () =>
          Response.json({
            error: {
              code: "paper_run_create_failed",
              message: "PaperRun 创建失败：workspace_path 缺失",
              action: "请先用 /folder 选择当前工作目录。",
              log_path: "C:/Users/13750/.paper_fucker/data/log",
            },
          }),
      }),
    ).rejects.toThrow("请先用 /folder 选择当前工作目录。")
  })

  test("applies experiment starter pack from PaperRun workbench", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const result = await requestPaperWorkbenchExperimentStarterApply({
      baseUrl: "http://localhost:4096",
      directory: "E:/Project/paper_fucker",
      runID: "run-paper",
      fetch: async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} })
        return Response.json({
          schema_version: "PaperExperimentStarterApplyResult.v1",
          run_id: "run-paper",
          status: "ready",
          dry_run: false,
          overwrite: false,
          workspace_path: "E:/Project/paper_fucker",
          files: [
            {
              path: "experiments/starter/Dockerfile.repro",
              target_path: "E:/Project/paper_fucker/experiments/starter/Dockerfile.repro",
              status: "written",
              message: "已写入",
            },
            {
              path: "package.json",
              target_path: "E:/Project/paper_fucker/package.json",
              status: "written",
              message: "已写入",
            },
          ],
          written_count: 2,
          conflict_count: 0,
          skipped_count: 0,
          message: "已写入 2 个实验 starter 项。",
        })
      },
    })

    expect(result.files.map((file) => file.path)).toEqual(["experiments/starter/Dockerfile.repro", "package.json"])
    expect(result.written_count).toBe(2)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe("http://localhost:4096/paper/runs/run-paper/experiment-starter/apply")
    expect(calls[0]!.init.method).toBe("POST")
    expect((calls[0]!.init.headers as Record<string, string>)["x-paper-fucker-directory"]).toBe("E:/Project/paper_fucker")
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      dry_run: false,
      overwrite: false,
      update_package_json: true,
    })
  })

  test("runs experiment protocol from PaperRun workbench", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const result = await requestPaperWorkbenchExperimentProtocolRun({
      baseUrl: "http://localhost:4096",
      directory: "E:/Project/paper_fucker",
      runID: "run-paper",
      fetch: async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} })
        return Response.json({
          schema_version: "PaperExperimentProtocolRunResult.v1",
          run_id: "run-paper",
          status: "succeeded",
          dry_run: false,
          workspace_path: "E:/Project/paper_fucker",
          planned_commands: [],
          host_runs: [{ experiment_id: "proposed", role: "proposed", environment: "host", status: "succeeded", command: "bun run typecheck", exit_code: 0, wall_time_seconds: 0.1, metrics: [] }],
          container_runs: [{ experiment_id: "proposed", role: "proposed", environment: "container", status: "succeeded", command: "bun run repro:container", exit_code: 0, wall_time_seconds: 0.1, metrics: [] }],
          artifact_ids: ["artifact-host", "artifact-container", "artifact-report"],
          message: "实验协议已执行，host/container 结果允许 final claim。",
        })
      },
    })

    expect(result.status).toBe("succeeded")
    expect(result.container_runs[0]!.command).toBe("bun run repro:container")
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe("http://localhost:4096/paper/runs/run-paper/experiments/run")
    expect(calls[0]!.init.method).toBe("POST")
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      dry_run: false,
      timeout_seconds: 120,
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
        machine_profile: {
          os: { platform: "win32", release: "10.0", arch: "x64", hostname: "test" },
          cpu: { model: "test cpu", cores: 8 },
          memory: { free_bytes: 1024, total_bytes: 2048 },
          disk: { path: "E:/Project/paper_fucker", free_bytes: 4096, total_bytes: 8192 },
          workspace: "E:/Project/paper_fucker",
          default_run_root: "C:/Users/test/.paper_fucker/runs",
          gpu: { mode: "cpu-only", devices: [], cuda: { status: "optional_missing" }, rocm: { status: "optional_missing" } },
          compilers: [{ id: "gcc", label: "gcc", status: "available", version: "gcc 13.2.0" }],
          runtimes: [
            { id: "python", label: "Python", status: "available", version: "Python 3.12.0" },
            { id: "bun", label: "Bun", status: "available", version: "1.3.13" },
          ],
        },
        experiment_environment: {
          available: [{ id: "python" }],
          optional_missing: [{ id: "docker" }],
          blocked: [],
        },
        final_gate: { status: "blocked", blockers: ["unsupported_claim"] },
        experiment_guidance: {
          schema_version: "ExperimentProtocolGuidance.v1",
          created_at: "2026-05-11T00:00:00Z",
          status: "needs_protocol",
          summary: "缺少 baseline 和 container reproduction 协议。",
          final_export_blocked: true,
          gaps: ["missing_baseline_runner", "missing_container_reproduction_runner"],
          suggestions: [
            {
              gap: "missing_container_reproduction_runner",
              severity: "blocking",
              recommended_script: "repro:container",
              next_action: "在 package.json scripts 中添加容器复现入口。",
            },
          ],
        },
        experiment_starter_pack: {
          schema_version: "ExperimentProtocolStarterPack.v1",
          created_at: "2026-05-11T00:00:00Z",
          status: "ready",
          summary: "已生成实验协议 starter pack。",
          package_json_scripts: {
            "baseline:starter": "bun run experiments/starter/baseline-starter.ts",
            "repro:container:starter": "docker build -f experiments/starter/Dockerfile.repro -t paper-fucker-repro . && docker run --rm paper-fucker-repro",
          },
          files: [
            {
              path: "experiments/starter/Dockerfile.repro",
              purpose: "Container reproduction skeleton.",
              content: "FROM oven/bun:1",
            },
          ],
          next_steps: ["复制 starter pack 并替换为真实实验。"],
        },
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
    expect(state.sidebar.gate.experiment_guidance).toMatchObject({
      status: "needs_protocol",
      gaps: ["missing_baseline_runner", "missing_container_reproduction_runner"],
    })
    expect(state.sidebar.gate.experiment_starter_pack).toMatchObject({
      status: "ready",
      files: ["experiments/starter/Dockerfile.repro"],
    })
    expect(state.sidebar.overview.next_action).toBe("补齐 baseline / ablation / container 实验协议")
    expect(state.sidebar.diagnostics.recent_calls[0]!.name).toBe("model.writer")
    expect(state.sidebar.machine.gpu_mode).toBe("CPU-only")
    expect(state.sidebar.machine.tool_versions).toContain("Python: Python 3.12.0")
    expect(state.sidebar.machine.optional_missing).toBe(1)
    expect(state.controls.map((control) => control.label)).toEqual([
      "发送指导",
      "继续运行",
      "重试阶段",
      "取消运行",
      "打开预览",
      "导出终稿",
      "导出 forced draft",
      "写入实验模板",
      "运行实验协议",
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
