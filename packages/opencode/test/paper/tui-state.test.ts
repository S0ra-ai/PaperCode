import { describe, expect, test } from "bun:test"
import {
  PAPER_RESEARCH_STAGE_GRAPH,
  createPaperWorkbenchHomeState,
  mapPaperRunToTuiState,
  type TuiResearchRunState,
} from "@/paper"

describe("paper TUI workbench state", () => {
  test("builds a Chinese paper workbench home state", () => {
    const state = createPaperWorkbenchHomeState({
      provider_model_roles: {
        writer: "deepseek/deepseek-v4-pro",
        reviewer: "openrouter/anthropic/claude-3.7-sonnet",
      },
      capability_health: {
        mcp: { exa: "enabled" },
        skills: { "nature-paper": "installed" },
        toolchain: { pandoc: "available", latex: "available" },
      },
    })

    expect(state).toMatchObject({
      schema_version: "TuiPaperWorkbenchState.v1",
      language: "zh-CN",
      title: "PaperCode 论文工作台",
      primary_input_modes: ["主题", "代码路径", "论文材料", "数据集", "实验日志"],
    })
    expect(state.model_roles.writer).toBe("deepseek/deepseek-v4-pro")
    expect(state.health_summary.some((item) => item.includes("Exa MCP"))).toBe(true)
    expect(state.home_actions.map((action) => action.label)).toEqual(["开始研究", "安装 Skill", "添加 MCP", "打开 Preview"])
  })

  test("maps paper run snapshots into stage graph, ledgers, diagnostics, and controls", () => {
    const runState = mapPaperRunToTuiState({
      run_id: "run-1",
      snapshot: {
        schema_version: "ResearchRunController.v1",
        run_id: "run-1",
        graph: PAPER_RESEARCH_STAGE_GRAPH,
        stages: PAPER_RESEARCH_STAGE_GRAPH.stages.map((stage, index) => ({
          id: stage.id,
          status: index < 2 ? "succeeded" : index === 2 ? "blocked" : "pending",
          summary: index === 2 ? "缺少 Exa MCP" : undefined,
        })),
        paused: true,
        pause: { stage: "literature", reason: "capability_missing", message: "缺少 Exa MCP" },
        updated_at: "2026-05-09T00:00:00Z",
      },
      counts: { sources: 3, claims: 2, artifacts: 4, events: 5 },
    })

    expect(runState satisfies TuiResearchRunState).toMatchObject({
      schema_version: "TuiResearchRunState.v1",
      run_id: "run-1",
      language: "zh-CN",
      paused: true,
      pause_question: "literature 需要处理: 缺少 Exa MCP",
    })
    expect(runState.stage_graph.find((stage) => stage.id === "literature")).toMatchObject({
      label: "文献检索",
      status_label: "阻塞",
    })
    expect(runState.panels.map((panel) => panel.label)).toEqual([
      "阶段图",
      "事件流",
      "Source Ledger",
      "Claim Ledger",
      "实验状态",
      "模型/工具/成本诊断",
    ])
    expect(runState.controls.map((control) => control.label)).toEqual(["暂停", "继续", "预览", "导出", "安装能力"])
  })
})
