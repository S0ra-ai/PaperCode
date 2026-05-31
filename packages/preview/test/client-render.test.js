import { describe, expect, test } from "bun:test"
import {
  renderCostAgent,
  renderExperimentEnvironment,
  renderExperimentEnvironmentPane,
  renderExperimentRunsPane,
  renderLedgerPane,
  renderModelRoutingPane,
} from "../src/client.js"

describe("preview client render helpers", () => {
  test("renders grouped experiment environment without requiring browser globals", () => {
    const html = renderExperimentEnvironment({
      status: "available",
      status_label: "可用",
      workspace: "E:/Project/paper_fucker",
      default_run_root: "C:/Users/test/.paper_fucker/runs",
      os: "win32 10.0 x64",
      cpu: "test cpu / 8 cores",
      memory: { free_bytes: 1024, total_bytes: 2048 },
      gpu_mode: "cpu-only",
      notes: ["缺失 Docker 时容器复现不可用。"],
      groups: [
        {
          id: "gpu",
          label: "GPU",
          status: "optional_missing",
          status_label: "可选缺失",
          available: 0,
          optional_missing: 2,
          blocked: 0,
          missing: 0,
          tools: [
            {
              id: "cuda",
              label: "CUDA",
              status: "optional_missing",
              status_label: "可选缺失",
              impact: "CUDA 实验会降级为 CPU-only。",
            },
          ],
        },
        {
          id: "runtime",
          label: "运行时",
          status: "available",
          status_label: "可用",
          available: 1,
          optional_missing: 0,
          blocked: 0,
          missing: 0,
          tools: [{ id: "python", label: "Python", status: "available", status_label: "可用", version: "Python 3.12.0" }],
        },
      ],
    })

    expect(html).toContain("机器与实验环境")
    expect(html).toContain("GPU")
    expect(html).toContain("运行时")
    expect(html).toContain("Python 3.12.0")
    expect(html).toContain("1.0 KB")
    expect(html).toContain("缺失 Docker 时容器复现不可用。")
  })

  test("escapes experiment environment labels and paths", () => {
    const html = renderExperimentEnvironment({
      status: "blocked",
      status_label: "阻断",
      workspace: "<script>alert(1)</script>",
      default_run_root: "",
      os: "win32",
      cpu: "cpu",
      memory: { free_bytes: 0, total_bytes: 0 },
      gpu_mode: "cpu-only",
      notes: [],
      groups: [
        {
          id: "runtime",
          label: "<img src=x onerror=alert(1)>",
          status: "blocked",
          status_label: "阻断",
          available: 0,
          optional_missing: 0,
          blocked: 1,
          missing: 0,
          tools: [{ id: "node", label: "Node <bad>", status: "blocked", status_label: "阻断", path: "C:/bad/<node>" }],
        },
      ],
    })

    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<img")
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(html).toContain("Node &lt;bad&gt;")
    expect(html).toContain("C:/bad/&lt;node&gt;")
  })

  test("renders a standalone experiment environment pane and falls back cleanly", () => {
    const empty = renderExperimentEnvironmentPane({})
    expect(empty).toContain("实验环境尚未同步")

    const html = renderExperimentEnvironmentPane({
      experiment_environment: {
        status: "available",
        status_label: "可用",
        workspace: "E:/Project/paper_fucker",
        default_run_root: "C:/Users/test/.paper_fucker/runs",
        os: "win32 10.0 x64",
        cpu: "test cpu / 8 cores",
        memory: { free_bytes: 2048, total_bytes: 4096 },
        gpu_mode: "cpu-only",
        notes: [],
        groups: [
          {
            id: "virtualization",
            label: "容器 / 虚拟化",
            status: "optional_missing",
            status_label: "可选缺失",
            available: 0,
            optional_missing: 1,
            blocked: 0,
            missing: 0,
            tools: [{ id: "docker", label: "Docker", status: "optional_missing", status_label: "可选缺失" }],
          },
        ],
      },
    })

    expect(html).toContain("机器与实验环境")
    expect(html).toContain("容器 / 虚拟化")
    expect(html).toContain("Docker")
  })

  test("renders standalone experiment runs and terminal traces", () => {
    expect(renderExperimentRunsPane({})).toContain("实验运行和终端证据尚未同步")

    const html = renderExperimentRunsPane({
      experiment_runs: [
        {
          run_id: "run-1",
          experiment_id: "baseline",
          role: "baseline",
          environment: "host",
          status: "succeeded",
          command: "python experiments/baseline.py",
          exit_code: 0,
          wall_time_seconds: 1.25,
          metrics: [{ name: "accuracy", value: 0.91 }],
        },
      ],
      experiment_terminal_traces: [
        {
          trace_id: "trace-1",
          experiment_id: "baseline",
          role: "baseline",
          environment: "host",
          command: "python experiments/baseline.py",
          cwd: "E:/Project/paper_fucker",
          status: "succeeded",
          exit_code: 0,
          wall_time_seconds: 1.25,
          timed_out: false,
          stdout_bytes: 12,
          stderr_bytes: 0,
          output_truncated: false,
          stdout_excerpt: "ok",
        },
      ],
    })

    expect(html).toContain("实验运行证据")
    expect(html).toContain("baseline")
    expect(html).toContain("accuracy=0.91")
    expect(html).toContain("stdout")
    expect(html).toContain("ok")
  })

  test("renders source and claim ledgers before annotation fallback", () => {
    const fallback = renderLedgerPane({ annotations: [{ kind: "claim", severity: "info", message: "fallback", source: { label: "draft" } }] })
    expect(fallback).toContain("fallback")

    const html = renderLedgerPane({
      annotations: [],
      monitor: {
        ledger: {
          sources: [
            {
              source_id: "src-1",
              kind: "paper",
              title: "Verified paper",
              locator: "https://example.org/paper",
              created_at: "2026-05-31T00:00:00Z",
            },
          ],
          claims: [
            {
              claim_id: "claim-1",
              status: "supported",
              confidence: 0.92,
              text: "The method improves reproducibility.",
              source_ids: ["src-1"],
              artifact_ids: ["artifact-1"],
              created_at: "2026-05-31T00:00:00Z",
            },
          ],
        },
      },
    })

    expect(html).toContain("Source Ledger")
    expect(html).toContain("Claim Ledger")
    expect(html).toContain("Verified paper")
    expect(html).toContain("The method improves reproducibility.")
    expect(html).toContain("confidence 0.92")
  })

  test("renders detailed cost, token, agent tree, and team state", () => {
    const html = renderCostAgent({
      diagnostics: {
        costs: { llm_usd: 0, api_usd: 0, total_usd: 0 },
        agents: [],
      },
      monitor: {
        cost_agent: {
          costs: {
            llm_usd: 0.12,
            api_usd: 0.03,
            total_usd: 0.15,
            budget_total_usd: 1,
            alerts: [{ id: "total:0.1", category: "total", threshold_usd: 0.1, observed_usd: 0.15 }],
          },
          tokens: {
            input_tokens: 1000,
            output_tokens: 500,
            total_tokens: 1500,
            estimated: false,
          },
          agent_tree: {
            total_agents: 2,
            active_agents: 1,
            blocked_agents: 1,
            max_depth: 1,
            max_parallel: 4,
            recent: [
              {
                agent_id: "agent-root",
                role: "planner",
                status: "running",
                model: "deep/deepseek-v4-pro",
                depth: 0,
              },
            ],
          },
          agent_team: {
            members: 2,
            active_members: 1,
            queued_tasks: 1,
            active_tasks: 1,
            completed_tasks: 0,
            blocked_tasks: 1,
            unread_messages: 1,
            recent_tasks: [{ task_id: "task-1", title: "代码实验", status: "blocked" }],
          },
        },
      },
    })

    expect(html).toContain("$0.1500")
    expect(html).toContain("1,500 tokens")
    expect(html).toContain("Agent Tree")
    expect(html).toContain("deep/deepseek-v4-pro")
    expect(html).toContain("Agent Team")
    expect(html).toContain("代码实验")
    expect(html).toContain("total cost alert")
  })

  test("renders model routing decisions and blocked diagnostics", () => {
    expect(renderModelRoutingPane({})).toContain("模型路由决策尚未同步")

    const html = renderModelRoutingPane({
      model_routing: [
        {
          decision_id: "decision-1",
          created_at: "2026-05-31T00:00:00Z",
          role: "writer",
          stage: "drafting",
          source: "decision_model",
          decision_model: "deep/deepseek-v4-pro",
          selected_model: "deep/deepseek-v4-flash",
          provider_id: "deep",
          model_id: "deepseek-v4-flash",
          candidate_count: 3,
          allowed_model_count: 2,
          reason: "主决策模型选择写作模型。",
          diagnostics: [],
        },
        {
          decision_id: "decision-2",
          created_at: "2026-05-31T00:01:00Z",
          role: "reviewer",
          source: "blocked",
          candidate_count: 0,
          allowed_model_count: 0,
          reason: "没有可用模型。",
          diagnostics: ["model_allowlist_empty"],
        },
      ],
    })

    expect(html).toContain("writer")
    expect(html).toContain("deep/deepseek-v4-flash")
    expect(html).toContain("reviewer")
    expect(html).toContain("blocked")
    expect(html).toContain("model_allowlist_empty")
  })
})
