import type { PromptInfo } from "@tui/component/prompt/history"
import type { PaperRunCreateRequest, PaperRunSnapshot } from "@/paper/run"
import type { PaperProfileId } from "@/paper/profiles"
import type { ResearchCapability, ResearchCapabilityType } from "@/paper/capabilities"
import type { OpenCodeModelRef, PaperModelRole } from "@/paper/model-router"
import type { PaperRunControlAction, PaperRunControllerState } from "@/paper/run-controller"

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

export interface PaperWorkbenchApiInput {
  baseUrl: string
  directory?: string
  runID: string
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

export interface PaperWorkbenchHealthInput {
  mcp?: Record<string, string>
  skills?: Record<string, string>
  toolchain?: Record<string, string>
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
  kind: "guidance" | "control" | "preview" | "export" | "capability" | "model_roles"
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

export interface PaperWorkbenchCapabilityHealthState {
  name: string
  label: string
  type: ResearchCapabilityType | "toolchain"
  status: string
  status_label: string
  network: string
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
  capability_health: PaperWorkbenchCapabilityHealthState[]
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

function apiHeaders(directory?: string, json = false) {
  return {
    ...(json ? { "content-type": "application/json" } : {}),
    ...(directory ? { "x-opencode-directory": directory } : {}),
  }
}

async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`)
  return (await response.json()) as T
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

function modelRoleState(roles: Record<string, OpenCodeModelRef>): PaperWorkbenchModelRoleState[] {
  return Object.entries(roles).map(([role, model]) => ({
    role,
    label: MODEL_ROLE_LABELS[role] ?? role,
    provider_id: model.provider_id,
    model_id: model.model_id,
    provider_model: `${model.provider_id}/${model.model_id}`,
  }))
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
      { id: "sources", label: "Source Ledger", count: snapshot.source_ledger.length },
      { id: "claims", label: "Claim Ledger", count: snapshot.claim_ledger.length },
      { id: "experiments", label: "实验复现" },
      { id: "diagnostics", label: "模型/工具/成本诊断", count: snapshot.diagnostics.counts?.artifacts },
      { id: "preview", label: "Preview" },
      { id: "export", label: "Export" },
    ],
    controls: createLiveControls(snapshot, controller),
    model_roles: modelRoleState(snapshot.diagnostics.model_roles ?? {}),
    capability_health: capabilityHealthState(options.capabilities, options.health),
    pause_questions: snapshot.pause_questions.map((question) => ({
      id: question.question_id,
      message: question.message,
    })),
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

export async function requestPaperWorkbenchPreview(input: PaperWorkbenchApiInput) {
  const response = await input.fetch(apiUrl(input.baseUrl, `paper/runs/${encodeURIComponent(input.runID)}/preview`), {
    method: "GET",
    headers: apiHeaders(input.directory),
  })
  return readJsonResponse(response, "PaperRun Preview 读取失败")
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
