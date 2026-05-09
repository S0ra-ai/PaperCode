import type { PromptInfo } from "@tui/component/prompt/history"
import type { PaperRunCreateRequest, PaperRunSnapshot } from "@/paper/run"
import type { PaperProfileId } from "@/paper/profiles"

export interface PaperWorkbenchSubmitInput {
  baseUrl: string
  directory?: string
  prompt: PromptInfo
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

export interface PaperWorkbenchSubmitResult {
  runID: string
  snapshot: PaperRunSnapshot
}

export interface PaperDashboardState {
  language: "zh-CN"
  run_id: string
  title: string
  stage_graph: Array<{
    id: string
    label: string
    status: string
    status_label: string
  }>
  panels: Array<{
    id: string
    label: string
    count?: number
  }>
  controls: Array<{
    id: string
    label: string
  }>
  pause_questions: Array<{
    id: string
    message: string
  }>
}

const STAGE_LABELS: Record<string, string> = {
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

const STATUS_LABELS: Record<string, string> = {
  pending: "等待",
  running: "运行中",
  succeeded: "完成",
  blocked: "阻塞",
  skipped: "跳过",
  failed: "失败",
}

function tokenize(input: string) {
  const tokens: string[] = []
  let current = ""
  let quote: "'" | '"' | undefined
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!
    if (quote) {
      if (char === quote) {
        quote = undefined
        continue
      }
      current += char
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current)
      current = ""
      continue
    }
    current += char
  }
  if (current) tokens.push(current)
  return tokens
}

function pushValue(target: string[], value: string | undefined) {
  if (!value) return
  target.push(value.replace(/\\/g, "/"))
}

function readFlagValue(token: string, tokens: string[], index: number) {
  const eq = token.indexOf("=")
  if (eq !== -1) return { value: token.slice(eq + 1), next: index }
  return { value: tokens[index + 1], next: index + 1 }
}

export function parsePaperWorkbenchPrompt(prompt: string | PromptInfo): PaperRunCreateRequest {
  const input = typeof prompt === "string" ? prompt : prompt.input
  const tokens = tokenize(input.trim())
  const topic: string[] = []
  const codePaths: string[] = []
  const paperFiles: string[] = []
  const datasetPaths: string[] = []
  const experimentLogs: string[] = []
  let profile: PaperProfileId | undefined
  let language: string | undefined
  let budget: PaperRunCreateRequest["budget_tier"]
  let quality: PaperRunCreateRequest["quality_mode"] = "reviewable_bundle"

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!
    if (token === "--code" || token.startsWith("--code=")) {
      const result = readFlagValue(token, tokens, index)
      pushValue(codePaths, result.value)
      index = result.next
      continue
    }
    if (
      token === "--paper" ||
      token === "--material" ||
      token.startsWith("--paper=") ||
      token.startsWith("--material=")
    ) {
      const result = readFlagValue(token, tokens, index)
      pushValue(paperFiles, result.value)
      index = result.next
      continue
    }
    if (token === "--data" || token === "--dataset" || token.startsWith("--data=") || token.startsWith("--dataset=")) {
      const result = readFlagValue(token, tokens, index)
      pushValue(datasetPaths, result.value)
      index = result.next
      continue
    }
    if (
      token === "--log" ||
      token === "--experiment-log" ||
      token.startsWith("--log=") ||
      token.startsWith("--experiment-log=")
    ) {
      const result = readFlagValue(token, tokens, index)
      pushValue(experimentLogs, result.value)
      index = result.next
      continue
    }
    if (token === "--profile" || token.startsWith("--profile=")) {
      const result = readFlagValue(token, tokens, index)
      profile = result.value as PaperProfileId
      index = result.next
      continue
    }
    if (
      token === "--lang" ||
      token === "--language" ||
      token.startsWith("--lang=") ||
      token.startsWith("--language=")
    ) {
      const result = readFlagValue(token, tokens, index)
      language = result.value
      index = result.next
      continue
    }
    if (token === "--budget" || token.startsWith("--budget=")) {
      const result = readFlagValue(token, tokens, index)
      budget = result.value as PaperRunCreateRequest["budget_tier"]
      index = result.next
      continue
    }
    if (token === "--submission") {
      budget = "submission"
      quality = "submission_candidate"
      continue
    }
    topic.push(token)
  }

  const normalizedTopic = topic.join(" ").trim()
  if (!normalizedTopic) throw new Error("请输入论文主题，或在路径参数后补充研究目标。")

  return {
    topic: normalizedTopic,
    code_paths: codePaths,
    paper_files: paperFiles,
    dataset_paths: datasetPaths,
    experiment_logs: experimentLogs,
    target_profile: profile,
    language: language ?? "zh-CN",
    budget_tier: budget ?? "standard",
    quality_mode: quality,
  }
}

function apiUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString()
}

export async function submitPaperWorkbenchPrompt(
  input: PaperWorkbenchSubmitInput,
): Promise<PaperWorkbenchSubmitResult> {
  const request = parsePaperWorkbenchPrompt(input.prompt)
  const response = await input.fetch(apiUrl(input.baseUrl, "paper/runs"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(input.directory ? { "x-opencode-directory": input.directory } : {}),
    },
    body: JSON.stringify(request),
  })
  if (!response.ok) throw new Error(`PaperRun 创建失败: HTTP ${response.status}`)
  const payload = (await response.json()) as { run?: PaperRunSnapshot }
  if (!payload.run?.run_id) throw new Error("PaperRun 创建响应缺少 run_id。")
  return {
    runID: payload.run.run_id,
    snapshot: payload.run,
  }
}

export async function fetchPaperRunSnapshot(input: {
  baseUrl: string
  directory?: string
  runID: string
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}) {
  const response = await input.fetch(apiUrl(input.baseUrl, `paper/runs/${encodeURIComponent(input.runID)}`), {
    headers: {
      ...(input.directory ? { "x-opencode-directory": input.directory } : {}),
    },
  })
  if (!response.ok) throw new Error(`PaperRun 读取失败: HTTP ${response.status}`)
  const payload = (await response.json()) as { run?: PaperRunSnapshot }
  if (!payload.run?.run_id) throw new Error("PaperRun 读取响应缺少 run_id。")
  return payload.run
}

export function createPaperRunDashboardState(snapshot: PaperRunSnapshot): PaperDashboardState {
  return {
    language: "zh-CN",
    run_id: snapshot.run_id,
    title: snapshot.topic,
    stage_graph: snapshot.stage_graph.stages.map((stage) => ({
      id: stage.id,
      label: STAGE_LABELS[stage.id] ?? stage.title,
      status: stage.status,
      status_label: STATUS_LABELS[stage.status] ?? stage.status,
    })),
    panels: [
      { id: "stage_graph", label: "阶段图", count: snapshot.stage_graph.stages.length },
      { id: "agent_tree", label: "Agent Tree", count: snapshot.agent_tree.nodes.length },
      { id: "sources", label: "Source Ledger", count: snapshot.source_ledger.length },
      { id: "claims", label: "Claim Ledger", count: snapshot.claim_ledger.length },
      { id: "experiments", label: "实验复现" },
      { id: "diagnostics", label: "模型/工具/成本诊断", count: snapshot.diagnostics.counts?.artifacts },
      { id: "preview", label: "Preview" },
      { id: "export", label: "Export" },
    ],
    controls: [
      { id: "resume", label: "继续" },
      { id: "preview", label: "预览" },
      { id: "export", label: "导出" },
      { id: "capabilities", label: "打开能力" },
    ],
    pause_questions: snapshot.pause_questions.map((question) => ({
      id: question.question_id,
      message: question.message,
    })),
  }
}
