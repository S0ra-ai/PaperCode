import type { PaperResearchRunSnapshot, PaperResearchStageId, PaperResearchStageStatus } from "./orchestrator"

export interface TuiWorkbenchHomeState {
  schema_version: "TuiPaperWorkbenchState.v1"
  language: "zh-CN"
  title: string
  primary_input_modes: string[]
  model_roles: Record<string, string>
  health_summary: string[]
  home_actions: Array<{ id: string; label: string }>
}

export interface TuiResearchRunState {
  schema_version: "TuiResearchRunState.v1"
  run_id: string
  language: "zh-CN"
  paused: boolean
  pause_question?: string
  stage_graph: Array<{
    id: PaperResearchStageId
    label: string
    status: PaperResearchStageStatus
    status_label: string
    summary?: string
  }>
  panels: Array<{ id: string; label: string; count?: number }>
  controls: Array<{ id: string; label: string }>
}

const STAGE_LABELS: Record<PaperResearchStageId, string> = {
  intake: "输入整理",
  planning: "研究规划",
  literature: "文献检索",
  code_analysis: "代码分析",
  data: "数据发现",
  experiment_design: "实验设计",
  experiment_execution: "实验运行",
  reproduction: "复现检查",
  claim_ledger: "Claim Ledger",
  drafting: "论文草稿",
  profile_formatting: "投稿格式",
  verification: "真实性审查",
  revision: "修订",
  export: "导出",
}

const STATUS_LABELS: Record<PaperResearchStageStatus, string> = {
  pending: "等待",
  running: "运行中",
  succeeded: "完成",
  blocked: "阻塞",
  skipped: "跳过",
}

export function createPaperWorkbenchHomeState(input: {
  provider_model_roles?: Record<string, string>
  capability_health?: {
    mcp?: Record<string, string>
    skills?: Record<string, string>
    toolchain?: Record<string, string>
  }
} = {}): TuiWorkbenchHomeState {
  const mcpHealth = input.capability_health?.mcp ?? {}
  const skillHealth = input.capability_health?.skills ?? {}
  const toolchainHealth = input.capability_health?.toolchain ?? {}
  return {
    schema_version: "TuiPaperWorkbenchState.v1",
    language: "zh-CN",
    title: "PaperCode 论文工作台",
    primary_input_modes: ["主题", "代码路径", "论文材料", "数据集", "实验日志"],
    model_roles: input.provider_model_roles ?? {},
    health_summary: [
      ...Object.entries(mcpHealth).map(([name, status]) => `${name === "exa" ? "Exa MCP" : name}: ${status}`),
      ...Object.entries(skillHealth).map(([name, status]) => `${name} skill: ${status}`),
      ...Object.entries(toolchainHealth).map(([name, status]) => `${name}: ${status}`),
    ],
    home_actions: [
      { id: "start", label: "开始研究" },
      { id: "install_skill", label: "安装 Skill" },
      { id: "add_mcp", label: "添加 MCP" },
      { id: "preview", label: "打开 Preview" },
    ],
  }
}

export function mapPaperRunToTuiState(input: {
  run_id: string
  snapshot: PaperResearchRunSnapshot
  counts?: {
    sources?: number
    claims?: number
    artifacts?: number
    events?: number
  }
}): TuiResearchRunState {
  return {
    schema_version: "TuiResearchRunState.v1",
    run_id: input.run_id,
    language: "zh-CN",
    paused: input.snapshot.paused,
    pause_question: input.snapshot.pause
      ? `${input.snapshot.pause.stage} 需要处理: ${input.snapshot.pause.message}`
      : undefined,
    stage_graph: input.snapshot.stages.map((stage) => ({
      id: stage.id,
      label: STAGE_LABELS[stage.id],
      status: stage.status,
      status_label: STATUS_LABELS[stage.status],
      summary: stage.summary,
    })),
    panels: [
      { id: "stage_graph", label: "阶段图" },
      { id: "events", label: "事件流", count: input.counts?.events },
      { id: "sources", label: "Source Ledger", count: input.counts?.sources },
      { id: "claims", label: "Claim Ledger", count: input.counts?.claims },
      { id: "experiments", label: "实验状态" },
      { id: "diagnostics", label: "模型/工具/成本诊断", count: input.counts?.artifacts },
    ],
    controls: [
      { id: "pause", label: "暂停" },
      { id: "resume", label: "继续" },
      { id: "preview", label: "预览" },
      { id: "export", label: "导出" },
      { id: "capabilities", label: "安装能力" },
    ],
  }
}
