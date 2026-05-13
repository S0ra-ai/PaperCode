import type { PromptInfo } from "@tui/component/prompt/history"
import type { PaperRunCreateRequest, PaperRunSnapshot } from "@/paper/run"
import type { PaperProfileId } from "@/paper/profiles"
import type { ResearchCapability, ResearchCapabilityType } from "@/paper/capabilities"
import type { ModelRoutingDecision, PaperModelRef, PaperModelInventory, PaperModelRole } from "@/paper"
import type { PaperRunControlAction, PaperRunControllerState } from "@/paper/run-controller"
import { summarizePaperAgentTeam } from "@/paper/agent-team"
import { readTuiJsonResponse } from "@tui/util/http"

export interface PaperWorkbenchSubmitInput {
  baseUrl: string
  directory?: string
  prompt: PromptInfo & Pick<PaperRunCreateRequest, "storage_scope">
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

export interface PaperWorkbenchSubmitResult {
  runID: string
  snapshot: PaperRunSnapshot
}

export interface PaperApiErrorPayload {
  error?: {
    schema_version?: string
    code?: string
    message?: string
    action?: string
    log_path?: string
  }
}

export interface PaperWorkbenchApiInput {
  baseUrl: string
  directory?: string
  runID: string
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

export interface PaperWorkbenchPreviewInput extends PaperWorkbenchApiInput {
  openUrl?: (url: string) => void | Promise<void>
}

export interface PaperWorkbenchPreviewResponse {
  readonly: true
  run_id: string
  status: "ready" | "blocked"
  url?: string
  token?: string
  snapshot?: unknown
}

export interface PaperRunLiveMonitor {
  close: () => void
}

export interface PaperRunPreviewStream {
  run_id: string
  connected: boolean
  last_event?: string
}

export interface PaperWorkbenchHealthInput {
  mcp?: Record<string, string>
  skills?: Record<string, string>
  toolchain?: Record<string, string>
}

export interface PaperEnvironmentStatus {
  name: string
  label: string
  status: "available" | "missing" | "optional_missing" | "blocked" | "unknown"
  message: string
  next_action?: string
}

export interface PaperWorkbenchDashboardOptions {
  capabilities?: Array<Pick<ResearchCapability, "name" | "network" | "title" | "type">>
  health?: PaperWorkbenchHealthInput
}

export interface PaperWorkbenchControl {
  id: string
  label: string
  description: string
  enabled: boolean
  method: "GET" | "POST"
  endpoint: string
  kind: "guidance" | "control" | "preview" | "export" | "capability" | "model_roles" | "model_inventory"
  danger?: boolean
  payload?: Record<string, unknown>
}

export interface PaperWorkbenchModelRoleState {
  role: string
  label: string
  provider_id: string
  model_id: string
  provider_model: string
}

export interface PaperWorkbenchModelWorkbenchState {
  decision_model?: string
  allowed_models: number
  candidates: number
  recent_decision?: string
  blocked_decisions: number
}

export interface PaperWorkbenchCapabilityHealthState {
  name: string
  label: string
  type: ResearchCapabilityType | "toolchain"
  status: string
  status_label: string
  network: string
}

export interface PaperRunCostDiagnostics {
  total_usd: number
  llm_usd: number
  api_usd: number
  budget_total_usd?: number
  alert_count: number
  total_tokens: number
  last_call_tokens: number
  context_percent?: number
  formatted_total: string
}

export interface PaperRunOutlineState {
  source: "draft" | "artifact" | "stage_graph"
  items: Array<{
    label: string
    status: string
    detail?: string
  }>
  missing_sections: string[]
}

export interface PaperRunGateSummary {
  status: "passed" | "blocked" | "open" | "not_started"
  status_label: string
  failed_checks: string[]
  reproduction_gate: string
  export_status: string
  final_export_enabled: boolean
}

export interface PaperRunSidebarState {
  overview: {
    current_stage: string
    current_stage_status: string
    next_action: string
    blockers: string[]
  }
  cost: PaperRunCostDiagnostics
  outline: PaperRunOutlineState
  agent_tree: {
    total_agents: number
    active_agents: number
    max_depth_observed: number
    depth_policy: string
    max_parallel: number
    recent_agents: Array<{
      id: string
      role: string
      status: string
      model: string
      depth: number
    }>
  }
  agent_team: {
    total_members: number
    active_members: number
    queued_tasks: number
    active_tasks: number
    completed_tasks: number
    blocked_tasks: number
    unread_messages: number
    memory_entries: number
    max_member_depth: number
    recent_tasks: Array<{
      id: string
      title: string
      status: string
    }>
  }
  gate: PaperRunGateSummary
  diagnostics: {
    recent_calls: Array<{
      name: string
      status: string
      detail: string
    }>
  }
  knowledge: {
    memory_entries: number
    redacted_memory: number
    code_files: number
    code_symbols: number
    experiment_surfaces: number
  }
  machine: {
    os: string
    cpu: string
    memory: string
    disk?: string
    workspace: string
    run_root: string
    gpu_mode: string
    gpu_devices: string[]
    available: number
    optional_missing: number
    blocked: number
  }
}

export interface PaperDashboardState {
  language: "zh-CN"
  run_id: string
  title: string
  controller_status: {
    status: PaperRunControllerState["status"]
    label: string
    pending_guidance: number
    last_control?: PaperRunControlAction
  }
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
  controls: PaperWorkbenchControl[]
  model_roles: PaperWorkbenchModelRoleState[]
  model_workbench: PaperWorkbenchModelWorkbenchState
  environment_status: PaperEnvironmentStatus[]
  capability_health: PaperWorkbenchCapabilityHealthState[]
  pause_questions: Array<{
    id: string
    message: string
  }>
  sidebar: PaperRunSidebarState
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

const CONTROLLER_STATUS_LABELS: Record<PaperRunControllerState["status"], string> = {
  running: "运行中",
  paused: "已暂停",
  review_required: "需审查",
  cancelled: "已取消",
  completed: "已完成",
}

const MODEL_ROLE_LABELS: Record<PaperModelRole | string, string> = {
  planner: "规划模型",
  literature_researcher: "文献模型",
  code_analyst: "代码分析模型",
  experiment_designer: "实验设计模型",
  writer: "写作模型",
  reviewer: "审稿模型",
  citation_checker: "引用检查模型",
  cheap_summarizer: "低成本摘要模型",
}

const HEALTH_STATUS_LABELS: Record<string, string> = {
  enabled: "已启用",
  installed: "已安装",
  available: "可用",
  ok: "正常",
  ready: "就绪",
  missing: "缺失",
  disabled: "未启用",
  unavailable: "不可用",
  unknown: "未知",
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

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

function classifyMaterialPath(input: {
  path?: string
  mime?: string
  codePaths: string[]
  paperFiles: string[]
  datasetPaths: string[]
  experimentLogs: string[]
}) {
  if (!input.path) return
  const normalized = input.path.replace(/\\/g, "/")
  const lower = normalized.toLowerCase()
  const mime = input.mime?.toLowerCase() ?? ""
  if (mime.includes("pdf") || /\.(pdf|md|markdown|tex|latex|docx?)$/.test(lower)) {
    pushValue(input.paperFiles, normalized)
    return
  }
  if (mime.includes("csv") || /\.(csv|tsv|jsonl?|parquet|xlsx?|sqlite|db)$/.test(lower)) {
    pushValue(input.datasetPaths, normalized)
    return
  }
  if (/\.(log|out|err|trace)$/.test(lower)) {
    pushValue(input.experimentLogs, normalized)
    return
  }
  pushValue(input.codePaths, normalized)
}

function readFlagValue(token: string, tokens: string[], index: number) {
  const eq = token.indexOf("=")
  if (eq !== -1) return { value: token.slice(eq + 1), next: index }
  return { value: tokens[index + 1], next: index + 1 }
}

export function parsePaperWorkbenchPrompt(
  prompt: string | (PromptInfo & Pick<PaperRunCreateRequest, "storage_scope">),
): PaperRunCreateRequest {
  const input = typeof prompt === "string" ? prompt : prompt.input
  const parts = typeof prompt === "string" ? [] : prompt.parts
  const promptBudget = typeof prompt === "string" ? undefined : prompt.budget_tier
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

  for (const part of parts) {
    if (part.type !== "file") continue
    const record = part as {
      filename?: string
      mime?: string
      source?: { path?: string }
    }
    classifyMaterialPath({
      path: record.source?.path ?? record.filename,
      mime: record.mime,
      codePaths,
      paperFiles,
      datasetPaths,
      experimentLogs,
    })
  }

  const normalizedTopic = topic.join(" ").trim()
  if (!normalizedTopic) throw new Error("请输入论文主题，或在路径参数后补充研究目标。")

  return {
    topic: normalizedTopic,
    workspace_path: typeof prompt === "string" ? undefined : prompt.workspace_path,
    storage_scope: typeof prompt === "string" ? "home" : prompt.storage_scope ?? "home",
    code_paths: codePaths,
    paper_files: paperFiles,
    dataset_paths: datasetPaths,
    experiment_logs: experimentLogs,
    target_profile: profile,
    language: language ?? "zh-CN",
    budget_tier: budget ?? promptBudget ?? "standard",
    quality_mode: quality === "submission_candidate" || budget === "submission" || promptBudget === "submission" ? "submission_candidate" : quality,
  }
}

function apiUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString()
}

function apiHeaders(directory?: string, json = false) {
  return {
    ...(json ? { "content-type": "application/json" } : {}),
    ...(directory ? { "x-paper-fucker-directory": directory } : {}),
  }
}

async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  return readTuiJsonResponse<T>(response, label)
}

export async function submitPaperWorkbenchPrompt(
  input: PaperWorkbenchSubmitInput,
): Promise<PaperWorkbenchSubmitResult> {
  const request = parsePaperWorkbenchPrompt(input.prompt)
  const response = await input.fetch(apiUrl(input.baseUrl, "paper/runs"), {
    method: "POST",
    headers: apiHeaders(input.directory, true),
    body: JSON.stringify(request),
  })
  const payload = await readJsonResponse<{ run?: PaperRunSnapshot } & PaperApiErrorPayload>(response, "PaperRun 创建失败")
  if (payload.error) {
    const detail = [payload.error.message, payload.error.action, payload.error.log_path ? `日志目录：${payload.error.log_path}` : undefined]
      .filter(Boolean)
      .join(" ")
    throw new Error(detail || "PaperRun 创建失败。")
  }
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
    headers: apiHeaders(input.directory),
  })
  const payload = await readJsonResponse<{ run?: PaperRunSnapshot }>(response, "PaperRun 读取失败")
  if (!payload.run?.run_id) throw new Error("PaperRun 读取响应缺少 run_id。")
  return payload.run
}

type PaperRunStreamEvent = {
  event?: string
  data?: string
}

function parseSseChunk(buffer: string): { events: PaperRunStreamEvent[]; rest: string } {
  const blocks = buffer.split(/\r?\n\r?\n/)
  const rest = blocks.pop() ?? ""
  const events = blocks
    .map((block) => {
      const event: PaperRunStreamEvent = {}
      const data: string[] = []
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("event:")) event.event = line.slice("event:".length).trim()
        if (line.startsWith("data:")) data.push(line.slice("data:".length).trimStart())
      }
      if (data.length) event.data = data.join("\n")
      return event
    })
    .filter((event) => event.event || event.data)
  return { events, rest }
}

function snapshotFromSseData(data: string | undefined): PaperRunSnapshot | undefined {
  if (!data) return
  try {
    const parsed = JSON.parse(data) as unknown
    const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
    const snapshot = record.snapshot ?? parsed
    if (snapshot && typeof snapshot === "object" && (snapshot as { schema_version?: string }).schema_version === "PaperRun.v1") {
      return snapshot as PaperRunSnapshot
    }
  } catch {
    return
  }
}

export function subscribePaperRunLiveMonitor(
  input: PaperWorkbenchApiInput & {
    onSnapshot: (snapshot: PaperRunSnapshot) => void
    onEvent?: (event: { event: string; data?: unknown }) => void
    onError?: (error: Error) => void
  },
): PaperRunLiveMonitor {
  const controller = new AbortController()
  void input
    .fetch(apiUrl(input.baseUrl, `paper/runs/${encodeURIComponent(input.runID)}/events`), {
      method: "GET",
      headers: apiHeaders(input.directory),
      signal: controller.signal,
    })
    .then(async (response) => {
      if (!response.ok) throw new Error(`PaperRun 实时流连接失败: HTTP ${response.status}`)
      if (!response.body) throw new Error("PaperRun 实时流缺少响应体。")
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (!controller.signal.aborted) {
        const next = await reader.read()
        if (next.done) break
        buffer += decoder.decode(next.value, { stream: true })
        const parsed = parseSseChunk(buffer)
        buffer = parsed.rest
        for (const event of parsed.events) {
          const snapshot = snapshotFromSseData(event.data)
          if (snapshot) input.onSnapshot(snapshot)
          if (input.onEvent) {
            let data: unknown = event.data
            if (event.data) {
              try {
                data = JSON.parse(event.data)
              } catch {
                data = event.data
              }
            }
            input.onEvent({ event: event.event ?? "message", data })
          }
        }
      }
    })
    .catch((error) => {
      if (controller.signal.aborted) return
      input.onError?.(error instanceof Error ? error : new Error(String(error)))
    })
  return {
    close: () => controller.abort(),
  }
}

function controlEndpoint(snapshot: PaperRunSnapshot, suffix: string) {
  return `/paper/runs/${encodeURIComponent(snapshot.run_id)}${suffix}`
}

function blockedStage(snapshot: PaperRunSnapshot) {
  return snapshot.stage_graph.stages.find((stage) => stage.status === "blocked")
}

function snapshotController(snapshot: PaperRunSnapshot): PaperRunControllerState {
  if (snapshot.controller_state) return snapshot.controller_state
  const blocked = snapshot.stage_graph.stages.some((stage) => stage.status === "blocked")
  const terminalStages = snapshot.stage_graph.stages.every((stage) => stage.status !== "pending" && stage.status !== "running")
  return {
    schema_version: "PaperRunController.v1",
    run_id: snapshot.run_id,
    status:
      snapshot.status === "cancelled"
        ? "cancelled"
        : snapshot.status === "blocked" && terminalStages
          ? "review_required"
          : blocked || snapshot.pause_questions.length > 0
            ? "paused"
            : "running",
    checkpoints: [],
    guidance_queue: [],
    controls: [],
    internal_sessions: snapshot.internal_sessions ?? [],
    updated_at: snapshot.updated_at,
  }
}

function createLiveControls(snapshot: PaperRunSnapshot, controller: PaperRunControllerState): PaperWorkbenchControl[] {
  const blocked = blockedStage(snapshot)
  const canResume = controller.status === "paused"
  const canCancel = controller.status !== "cancelled" && controller.status !== "completed"
  return [
    {
      id: "guidance",
      label: "发送指导",
      description: "把用户补充要求写入 guidance queue，后续 stage 和 agent 自动消费。",
      enabled: true,
      method: "POST",
      endpoint: controlEndpoint(snapshot, "/guidance"),
      kind: "guidance",
      payload: { message: "" },
    },
    {
      id: "resume",
      label: "继续运行",
      description: "从暂停点继续 PaperRun。",
      enabled: canResume,
      method: "POST",
      endpoint: controlEndpoint(snapshot, "/control"),
      kind: "control",
      payload: { action: "resume" },
    },
    {
      id: "retry",
      label: "重试阶段",
      description: "重试当前阻塞或失败阶段。",
      enabled: Boolean(blocked),
      method: "POST",
      endpoint: controlEndpoint(snapshot, "/control"),
      kind: "control",
      payload: { action: "retry", ...(blocked ? { stage: blocked.id } : {}) },
    },
    {
      id: "cancel",
      label: "取消运行",
      description: "取消当前 PaperRun，不删除已生成证据。",
      enabled: canCancel,
      method: "POST",
      endpoint: controlEndpoint(snapshot, "/control"),
      kind: "control",
      danger: true,
      payload: { action: "cancel" },
    },
    {
      id: "preview",
      label: "打开预览",
      description: "打开只读 Preview，绑定 run artifacts 和 ledgers。",
      enabled: snapshot.preview_state.status === "ready",
      method: "GET",
      endpoint: controlEndpoint(snapshot, "/preview"),
      kind: "preview",
    },
    {
      id: "export_final",
      label: "导出终稿",
      description: "只有真实性 gate 通过后才允许导出终稿。",
      enabled: snapshot.export_state.status === "final",
      method: "POST",
      endpoint: controlEndpoint(snapshot, "/export"),
      kind: "export",
      payload: { forced: false },
    },
    {
      id: "export_forced",
      label: "导出 forced draft",
      description: "允许导出带失败检查标记的 forced draft。",
      enabled: snapshot.export_state.status !== "final",
      method: "POST",
      endpoint: controlEndpoint(snapshot, "/export"),
      kind: "export",
      payload: { forced: true },
    },
    {
      id: "capabilities",
      label: "能力健康",
      description: "查看 MCP、Skill、工具链和 first-party capability 状态。",
      enabled: true,
      method: "GET",
      endpoint: "/paper/capabilities",
      kind: "capability",
    },
    {
      id: "model_workbench",
      label: "模型工作台",
      description: "配置 provider、模型允许列表、主决策模型和阶段强制模型。",
      enabled: true,
      method: "GET",
      endpoint: "/paper/model-inventory",
      kind: "model_inventory",
    },
    {
      id: "model_roles",
      label: "模型角色",
      description: "查看 planner、writer、reviewer、subagent 等角色模型路由。",
      enabled: true,
      method: "GET",
      endpoint: "/paper/model-roles",
      kind: "model_roles",
    },
  ]
}

function modelWorkbenchState(snapshot: PaperRunSnapshot): PaperWorkbenchModelWorkbenchState {
  const inventory = objectValue(snapshot.diagnostics.model_inventory)
  const routing = Array.isArray(snapshot.diagnostics.model_routing)
    ? (snapshot.diagnostics.model_routing as ModelRoutingDecision[])
    : []
  const recent = routing.findLast((item) => typeof item.selected_model === "string")
  return {
    decision_model: typeof inventory.decision_model === "string" ? inventory.decision_model : undefined,
    allowed_models: arrayValue(inventory.allowlist).length,
    candidates: arrayValue(inventory.candidates).length || arrayValue(inventory.allowlist).length,
    recent_decision: recent?.selected_model,
    blocked_decisions: routing.filter((item) => item.source === "blocked").length,
  }
}

function modelRoleState(roles: Record<string, PaperModelRef>): PaperWorkbenchModelRoleState[] {
  return Object.entries(roles).map(([role, model]) => ({
    role,
    label: MODEL_ROLE_LABELS[role] ?? role,
    provider_id: model.provider_id,
    model_id: model.model_id,
    provider_model: `${model.provider_id}/${model.model_id}`,
  }))
}

function createPaperEnvironmentStatus(
  snapshot: PaperRunSnapshot,
  health?: PaperWorkbenchHealthInput,
): PaperEnvironmentStatus[] {
  const model = modelWorkbenchState(snapshot)
  const toolchain = health?.toolchain ?? {}
  const skill = health?.skills ?? {}
  const statusOf = (name: string) => toolchain[name] ?? "unknown"
  const available = (name: string) => ["available", "ok", "ready", "installed", "enabled"].includes(statusOf(name))
  const optionalTool = (name: string, label: string, message: string): PaperEnvironmentStatus => ({
    name,
    label,
    status: available(name) ? "available" : "optional_missing",
    message: available(name) ? "已可用" : message,
    next_action: available(name) ? undefined : "可稍后安装；缺失时相关导出或复现能力会降级。",
  })
  return [
    {
      name: "models",
      label: "模型工作台",
      status: model.allowed_models > 0 && model.decision_model ? "available" : "blocked",
      message:
        model.allowed_models > 0 && model.decision_model
          ? `主决策模型 ${model.decision_model}`
          : "尚未选择允许模型和主决策模型",
      next_action: model.allowed_models > 0 && model.decision_model ? undefined : "打开 /models 配置 provider、允许模型和主决策模型。",
    },
    {
      name: "skill.nature-paper",
      label: "Nature Paper Skill",
      status: ["installed", "enabled", "ok"].includes(skill["nature-paper"] ?? skill["skill.nature-paper"] ?? "")
        ? "available"
        : "optional_missing",
      message: ["installed", "enabled", "ok"].includes(skill["nature-paper"] ?? skill["skill.nature-paper"] ?? "")
        ? "已安装"
        : "未检测到本机 skill；generic-preprint 仍可运行。",
      next_action: "运行模型/环境工作台的 skill 检查，或重新执行 init 安装内置 skill。",
    },
    optionalTool("pandoc", "Pandoc", "缺失时 Markdown/LaTeX/DOCX 互转会降级。"),
    optionalTool("xelatex", "LaTeX", "缺失时 PDF 编译会降级，可先输出 Markdown/LaTeX。"),
    optionalTool("docker", "Docker", "缺失时容器复现不可用，本机实验和计划仍可运行。"),
    optionalTool("python", "Python", "缺失时 Python research-tools 与数据处理能力不可用。"),
  ]
}

function capabilityLabel(capability: Pick<ResearchCapability, "name" | "title" | "type">) {
  if (capability.name === "exa") return "Exa MCP"
  if (capability.name === "skill.nature-paper") return "Nature Paper Skill"
  return capability.title
}

function capabilityStatus(capability: Pick<ResearchCapability, "name" | "type">, health?: PaperWorkbenchHealthInput) {
  if (capability.type === "mcp") return health?.mcp?.[capability.name] ?? "unknown"
  if (capability.type === "skill") {
    const skillName = capability.name.replace(/^skill\./, "")
    return health?.skills?.[skillName] ?? health?.skills?.[capability.name] ?? "unknown"
  }
  if (capability.type === "first_party_tool" || capability.type === "builtin_tool" || capability.type === "python_tool") {
    return "available"
  }
  return "unknown"
}

function capabilityHealthState(
  capabilities: PaperWorkbenchDashboardOptions["capabilities"] = [],
  health?: PaperWorkbenchHealthInput,
): PaperWorkbenchCapabilityHealthState[] {
  const capabilityItems = capabilities.map((capability) => {
    const status = capabilityStatus(capability, health)
    return {
      name: capability.name,
      label: capabilityLabel(capability),
      type: capability.type,
      status,
      status_label: HEALTH_STATUS_LABELS[status] ?? status,
      network: capability.network,
    }
  })
  const toolchainItems = Object.entries(health?.toolchain ?? {}).map(([name, status]) => ({
    name,
    label: name,
    type: "toolchain" as const,
    status,
    status_label: HEALTH_STATUS_LABELS[status] ?? status,
    network: "none",
  }))
  return [...capabilityItems, ...toolchainItems]
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function formatBytes(value: unknown) {
  const bytes = numericValue(value)
  if (!bytes) return "unknown"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let amount = bytes
  let index = 0
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024
    index++
  }
  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : []
}

function tokenUsageFrom(value: unknown): {
  total: number
  input: number
  output: number
  reasoning: number
  cache_read: number
  cache_write: number
  context_limit?: number
} {
  const record = objectValue(value)
  const nested = [record.tokens, record.usage, record.token_usage].map(objectValue)
  const candidates = [record, ...nested]
  const read = (...keys: string[]) =>
    candidates.reduce((sum, candidate) => sum + keys.reduce((inner, key) => inner + numericValue(candidate[key]), 0), 0)
  const input = read("input_tokens", "prompt_tokens", "input")
  const output = read("output_tokens", "completion_tokens", "output")
  const reasoning = read("reasoning_tokens", "reasoning")
  const cache_read = read("cache_read_tokens", "cache_read", "cached_tokens")
  const cache_write = read("cache_write_tokens", "cache_write")
  const total = read("total_tokens", "total") || input + output + reasoning + cache_read + cache_write
  const contextLimit = candidates.map((candidate) => numericValue(candidate.context_limit ?? candidate.context_window)).find((item) => item > 0)
  return {
    total,
    input,
    output,
    reasoning,
    cache_read,
    cache_write,
    context_limit: contextLimit,
  }
}

function costDiagnostics(snapshot: PaperRunSnapshot): PaperRunCostDiagnostics {
  const cost = objectValue(snapshot.diagnostics.cost)
  const budget = objectValue(cost.budget)
  const traces = snapshot.diagnostics.tool_traces ?? []
  const usage = traces.map((trace) => {
    const input = tokenUsageFrom(trace.input)
    const output = tokenUsageFrom(trace.output)
    const total = input.total + output.total
    return {
      total,
      context_limit: input.context_limit ?? output.context_limit,
    }
  })
  const totalTokens = usage.reduce((sum, item) => sum + item.total, 0)
  const last = usage.findLast((item) => item.total > 0)
  const contextPercent =
    last?.context_limit && last.context_limit > 0 ? Math.round((last.total / last.context_limit) * 100) : undefined
  const totalUsd = numericValue(cost.total_usd)
  return {
    total_usd: totalUsd,
    llm_usd: numericValue(cost.llm_usd),
    api_usd: numericValue(cost.api_usd),
    budget_total_usd: numericValue(budget.total_soft_usd) || undefined,
    alert_count: arrayValue(cost.alerts).length,
    total_tokens: totalTokens,
    last_call_tokens: last?.total ?? 0,
    context_percent: contextPercent,
    formatted_total: money.format(totalUsd),
  }
}

function artifactSchema(artifact: PaperRunSnapshot["artifacts"][number]) {
  const metadata = objectValue(artifact.metadata)
  return typeof metadata.artifact_schema === "string" ? metadata.artifact_schema : undefined
}

function outlineState(snapshot: PaperRunSnapshot): PaperRunOutlineState {
  const artifacts = snapshot.artifacts ?? []
  const drafts = snapshot.drafts ?? []
  const claims = snapshot.claim_ledger ?? []
  const draftArtifact = artifacts.find((artifact) => artifactSchema(artifact) === "DraftPaper.v1")
  const outlineArtifact = artifacts.find((artifact) => artifact.kind === "outline")
  if (drafts.length > 0) {
    return {
      source: "draft",
      items: drafts.slice(-4).map((draft) => ({
        label: draft.title,
        status: draft.format,
        detail: draft.path,
      })),
      missing_sections: claims.length === 0 ? ["Claim Ledger"] : [],
    }
  }
  if (draftArtifact || outlineArtifact) {
    const artifact = draftArtifact ?? outlineArtifact!
    return {
      source: "artifact",
      items: [
        {
          label: artifact.path,
          status: artifactSchema(artifact) ?? artifact.kind,
          detail: artifact.artifact_id,
        },
      ],
      missing_sections: claims.length === 0 ? ["Claim Ledger", "DraftPaper"] : ["DraftPaper"],
    }
  }
  return {
    source: "stage_graph",
    items: snapshot.stage_graph.stages
      .filter((stage) => stage.status !== "pending")
      .slice(-6)
      .map((stage) => ({
        label: STAGE_LABELS[stage.id] ?? stage.title,
        status: STATUS_LABELS[stage.status] ?? stage.status,
        detail: stage.summary,
      })),
    missing_sections: ["DraftPaper", "Claim Ledger"],
  }
}

function gateSummary(snapshot: PaperRunSnapshot): PaperRunGateSummary {
  const gate = objectValue(snapshot.diagnostics.final_gate)
  const status = gate.status === "passed" || gate.status === "blocked" || gate.status === "open" ? gate.status : "not_started"
  const exportFailedChecks = snapshot.export_state.failed_checks ?? []
  const failedChecks = exportFailedChecks.length
    ? exportFailedChecks
    : arrayValue(gate.blockers).filter((item): item is string => typeof item === "string")
  const labels: Record<PaperRunGateSummary["status"], string> = {
    passed: "通过",
    blocked: "阻断",
    open: "待审查",
    not_started: "未开始",
  }
  return {
    status,
    status_label: labels[status],
    failed_checks: failedChecks,
    reproduction_gate: snapshot.experiment_status?.reproduction_gate ?? "not_started",
    export_status: snapshot.export_state.status,
    final_export_enabled: snapshot.export_state.status === "final",
  }
}

function activeStage(snapshot: PaperRunSnapshot) {
  return (
    snapshot.stage_graph.stages.find((stage) => stage.status === "blocked") ??
    snapshot.stage_graph.stages.find((stage) => stage.status === "running") ??
    snapshot.stage_graph.stages.find((stage) => stage.status === "pending") ??
    snapshot.stage_graph.stages.at(-1)
  )
}

function nextAction(snapshot: PaperRunSnapshot, gate: PaperRunGateSummary) {
  if (snapshot.pause_questions.length > 0) return "回答暂停问题"
  if (gate.failed_checks.length > 0) return "补证据或导出 forced draft"
  if (snapshot.export_state.status === "final") return "导出终稿"
  if (snapshot.status === "running") return "等待自动 stage 推进"
  return "查看 Preview / Export"
}

export function createPaperRunSidebarState(snapshot: PaperRunSnapshot): PaperRunSidebarState {
  const gate = gateSummary(snapshot)
  const current = activeStage(snapshot)
  const nodes = snapshot.agent_tree.nodes ?? []
  const team = summarizePaperAgentTeam(snapshot.agent_team)
  const memory = objectValue(snapshot.diagnostics.memory)
  const code = objectValue(snapshot.diagnostics.code_understanding)
  const machine = snapshot.diagnostics.machine_profile
  const environment = snapshot.diagnostics.experiment_environment
  const recentAgents = nodes.slice(-4).map((agent) => ({
    id: agent.agent_id,
    role: agent.role,
    status: agent.status,
    model: `${agent.provider_id}/${agent.model_id}`,
    depth: agent.depth,
  }))
  const recentCalls = (snapshot.diagnostics.tool_traces ?? []).slice(-5).map((trace) => ({
    name: trace.tool_name,
    status: trace.status,
    detail: trace.error ?? trace.ended_at ?? trace.started_at,
  }))
  return {
    overview: {
      current_stage: current ? (STAGE_LABELS[current.id] ?? current.title) : "未开始",
      current_stage_status: current ? (STATUS_LABELS[current.status] ?? current.status) : "未知",
      next_action: nextAction(snapshot, gate),
      blockers: [...gate.failed_checks, ...snapshot.pause_questions.map((question) => question.reason)].filter(Boolean),
    },
    cost: costDiagnostics(snapshot),
    outline: outlineState(snapshot),
    agent_tree: {
      total_agents: nodes.length,
      active_agents: nodes.filter((node) => node.status === "running" || node.status === "planned").length,
      max_depth_observed: nodes.reduce((max, node) => Math.max(max, node.depth), 0),
      depth_policy: snapshot.agent_tree.recursive_policy?.depth_policy ?? (snapshot.agent_tree.max_depth === null ? "unbounded" : "legacy"),
      max_parallel: snapshot.agent_tree.max_parallel,
      recent_agents: recentAgents,
    },
    agent_team: team,
    gate,
    diagnostics: {
      recent_calls: recentCalls,
    },
    knowledge: {
      memory_entries: numericValue(memory.total_entries),
      redacted_memory: numericValue(memory.redacted),
      code_files: numericValue(code.files),
      code_symbols: numericValue(code.symbols),
      experiment_surfaces: numericValue(code.experiment_surfaces),
    },
    machine:
      machine && environment
        ? {
            os: `${machine.os.platform} ${machine.os.release} ${machine.os.arch}`,
            cpu: `${machine.cpu.model} / ${machine.cpu.cores} cores`,
            memory: `${formatBytes(machine.memory.free_bytes)} free / ${formatBytes(machine.memory.total_bytes)} total`,
            disk: machine.disk
              ? `${formatBytes(machine.disk.free_bytes)} free / ${formatBytes(machine.disk.total_bytes)} total`
              : undefined,
            workspace: machine.workspace,
            run_root: machine.default_run_root,
            gpu_mode: machine.gpu.mode === "gpu" ? "GPU" : "CPU-only",
            gpu_devices: machine.gpu.devices.map((device) => `${device.vendor} ${device.name}`),
            available: environment.available.length,
            optional_missing: environment.optional_missing.length,
            blocked: environment.blocked.length,
          }
        : {
            os: "未检测",
            cpu: "未检测",
            memory: "未检测",
            workspace: snapshot.workspace,
            run_root: String(snapshot.diagnostics.runtime_root ?? ""),
            gpu_mode: "未检测",
            gpu_devices: [],
            available: 0,
            optional_missing: 0,
            blocked: 0,
          },
  }
}

export function createPaperRunDashboardState(
  snapshot: PaperRunSnapshot,
  options: PaperWorkbenchDashboardOptions = {},
): PaperDashboardState {
  const controller = snapshotController(snapshot)
  const lastControl = controller.controls.at(-1)
  return {
    language: "zh-CN",
    run_id: snapshot.run_id,
    title: snapshot.topic,
    controller_status: {
      status: controller.status,
      label: CONTROLLER_STATUS_LABELS[controller.status],
      pending_guidance: controller.guidance_queue.filter((item) => item.status === "queued").length,
      last_control: lastControl?.action,
    },
    stage_graph: snapshot.stage_graph.stages.map((stage) => ({
      id: stage.id,
      label: STAGE_LABELS[stage.id] ?? stage.title,
      status: stage.status,
      status_label: STATUS_LABELS[stage.status] ?? stage.status,
    })),
    panels: [
      { id: "stage_graph", label: "阶段图", count: snapshot.stage_graph.stages.length },
      { id: "agent_tree", label: "Agent Tree", count: snapshot.agent_tree.nodes.length },
      { id: "agent_team", label: "Agent Team", count: snapshot.agent_team?.members.length ?? 0 },
      { id: "sources", label: "Source Ledger", count: snapshot.source_ledger.length },
      { id: "claims", label: "Claim Ledger", count: snapshot.claim_ledger.length },
      { id: "experiments", label: "实验复现" },
      { id: "diagnostics", label: "模型/工具/成本诊断", count: snapshot.diagnostics.counts?.artifacts },
      { id: "preview", label: "Preview" },
      { id: "export", label: "Export" },
    ],
    controls: createLiveControls(snapshot, controller),
    model_roles: modelRoleState(snapshot.diagnostics.model_roles ?? {}),
    model_workbench: modelWorkbenchState(snapshot),
    environment_status: createPaperEnvironmentStatus(snapshot, options.health),
    capability_health: capabilityHealthState(options.capabilities, options.health),
    pause_questions: snapshot.pause_questions.map((question) => ({
      id: question.question_id,
      message: question.message,
    })),
    sidebar: createPaperRunSidebarState(snapshot),
  }
}

export async function submitPaperWorkbenchGuidance(input: PaperWorkbenchApiInput & { message: string }) {
  const response = await input.fetch(apiUrl(input.baseUrl, `paper/runs/${encodeURIComponent(input.runID)}/guidance`), {
    method: "POST",
    headers: apiHeaders(input.directory, true),
    body: JSON.stringify({ message: input.message }),
  })
  return readJsonResponse(response, "PaperRun 指导提交失败")
}

export async function sendPaperWorkbenchControl(
  input: PaperWorkbenchApiInput & { action: PaperRunControlAction; stage?: string },
): Promise<PaperRunControllerState> {
  const response = await input.fetch(apiUrl(input.baseUrl, `paper/runs/${encodeURIComponent(input.runID)}/control`), {
    method: "POST",
    headers: apiHeaders(input.directory, true),
    body: JSON.stringify({ action: input.action, ...(input.stage ? { stage: input.stage } : {}) }),
  })
  return readJsonResponse<PaperRunControllerState>(response, "PaperRun 控制失败")
}

export async function requestPaperWorkbenchPreview(input: PaperWorkbenchPreviewInput): Promise<PaperWorkbenchPreviewResponse> {
  const response = await input.fetch(apiUrl(input.baseUrl, `paper/runs/${encodeURIComponent(input.runID)}/preview`), {
    method: "GET",
    headers: apiHeaders(input.directory),
  })
  const payload = await readJsonResponse<PaperWorkbenchPreviewResponse>(response, "PaperRun Preview 读取失败")
  if (payload.url && input.openUrl) await input.openUrl(payload.url)
  return payload
}

export async function requestPaperWorkbenchExport(input: PaperWorkbenchApiInput & { forced?: boolean }) {
  const response = await input.fetch(apiUrl(input.baseUrl, `paper/runs/${encodeURIComponent(input.runID)}/export`), {
    method: "POST",
    headers: apiHeaders(input.directory, true),
    body: JSON.stringify({ forced: Boolean(input.forced) }),
  })
  return readJsonResponse(response, "PaperRun 导出失败")
}

export async function fetchPaperWorkbenchCapabilities(input: Omit<PaperWorkbenchApiInput, "runID">) {
  const response = await input.fetch(apiUrl(input.baseUrl, "paper/capabilities"), {
    method: "GET",
    headers: apiHeaders(input.directory),
  })
  return readJsonResponse<{ capabilities: ResearchCapability[] }>(response, "PaperRun 能力读取失败")
}

export async function fetchPaperWorkbenchModelRoles(input: Omit<PaperWorkbenchApiInput, "runID">) {
  const response = await input.fetch(apiUrl(input.baseUrl, "paper/model-roles"), {
    method: "GET",
    headers: apiHeaders(input.directory),
  })
  return readJsonResponse(response, "PaperRun 模型角色读取失败")
}

export async function fetchPaperWorkbenchModelInventory(input: Omit<PaperWorkbenchApiInput, "runID">) {
  const response = await input.fetch(apiUrl(input.baseUrl, "paper/model-inventory"), {
    method: "GET",
    headers: apiHeaders(input.directory),
  })
  return readJsonResponse<{ inventory: PaperModelInventory; routing: ModelRoutingDecision[] }>(
    response,
    "PaperRun 模型工作台读取失败",
  )
}

export async function fetchPaperWorkbenchDoctor(input: Omit<PaperWorkbenchApiInput, "runID">) {
  const response = await input.fetch(apiUrl(input.baseUrl, "paper/doctor"), {
    method: "GET",
    headers: apiHeaders(input.directory),
  })
  return readJsonResponse(response, "PaperRun doctor 读取失败")
}

export function paperWorkbenchHealthFromDoctor(doctor: unknown): PaperWorkbenchHealthInput {
  const value = doctor && typeof doctor === "object" ? (doctor as Record<string, unknown>) : {}
  const capabilities =
    value.capabilities && typeof value.capabilities === "object"
      ? (value.capabilities as Record<string, unknown>)
      : {}
  const mcp = Array.isArray(capabilities.mcp)
    ? Object.fromEntries(capabilities.mcp.filter((item): item is string => typeof item === "string").map((name) => [name, "enabled"]))
    : {}
  const skills = Array.isArray(capabilities.skills)
    ? Object.fromEntries(
        capabilities.skills
          .filter((item): item is string => typeof item === "string")
          .map((name) => [name.replace(/^skill\./, ""), "installed"]),
      )
    : {}
  const checks = Array.isArray(value.checks)
    ? Object.fromEntries(
        value.checks
          .filter((item): item is { name: string; status: string } => {
            return (
              Boolean(item) &&
              typeof item === "object" &&
              typeof (item as { name?: unknown }).name === "string" &&
              typeof (item as { status?: unknown }).status === "string"
            )
          })
          .map((item) => [item.name, item.status]),
      )
    : {}
  return {
    mcp,
    skills,
    toolchain: checks,
  }
}
