import path from "path"
import { EventEmitter } from "events"
import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { access, mkdir, readFile, writeFile } from "fs/promises"
import { startPreviewServer, type PreviewServerHandle } from "../../../preview/src/server"
import type { PreviewAnnotation, PreviewArtifactRef, PreviewMonitorSummary, PreviewSnapshot } from "../../../preview/src/protocol"
import {
  appendResearchEvent,
  appendResearchFact,
  createResearchRun,
  discoverRunDirs,
  getResearchRunStatus,
  loadResearchRun,
  readJsonlFacts,
  resumeResearchRun,
  setResearchFinalGate,
  updateResearchRunStatus,
  writeResearchArtifact,
  type ResearchFinalGateState,
  type ResearchRuntimeOptions,
  type ResearchStorageScope,
} from "./research/runtime"
import {
  RESEARCH_SCHEMA_VERSION,
  type ResearchArtifact,
  type ResearchClaim,
  type ResearchDraft,
  type ResearchEvent,
  type ResearchExport,
  type ResearchReview,
  type ResearchSource,
  type ResearchToolTrace,
} from "./research/contracts"
import { defaultResearchCapabilities, type ResearchCapability } from "./capabilities"
import { builtinPaperCapabilityPacks } from "./capability-pack"
import { normalizeResearchIntake, type ResearchBrief, type ResearchIntakeRequest } from "./intake"
import {
  createModelRoleRouter,
  PAPER_MODEL_ROLES,
  parsePaperModelId,
  type PaperModelRef,
  type PaperModelRole,
} from "./model-router"
import {
  loadPaperModelInventory,
  modelRolesFromInventory,
  routePaperModel,
  type ModelRoutingDecision,
  type PaperModelInventory,
} from "./model-inventory"
import {
  PAPER_RESEARCH_STAGE_GRAPH,
  startPaperResearchRun,
  type PaperResearchStageDefinition,
  type PaperResearchStageId,
  type PaperResearchStageStatus,
} from "./orchestrator"
import { budgetTierPolicy } from "./budget"
import { recordExportBundle, type ExportBundle } from "./research/export"
import { composeDraftPaper, streamMarkdownDraft, type ClaimLedger, type CodeAvailabilityMetadata, type DraftPaper } from "./research/writing"
import type { DataPlan, LiteratureMap } from "./research/sources"
import {
  paperObservabilityAuditFromEvents,
  recordDefaultPaperRunObservability,
  type PaperObservabilityAuditSummary,
} from "./observability"
import {
  recursiveAgentPolicyForBudget,
  type AgentPermissionEnvelope,
  type RecursiveAgentPolicy,
} from "./agents"
import { createPaperAgentTeam, type PaperAgentTeamState } from "./agent-team"
import { createPaperMemoryBank, memoryBankSummary, type PaperMemoryBank } from "./memory-bank"
import {
  addCodeFile,
  codeUnderstandingSummary,
  createCodeUnderstandingGraph,
  type CodeUnderstandingGraph,
} from "./code-understanding"
import { crawlerDiagnostics, type CrawlerDiagnosticsSummary } from "./crawler"
import { hfLoopDiagnostics, type HFLoopDiagnostics } from "./huggingface-loop"
import { inspectPaperManagedCapabilities, type PaperManagedCapability } from "./skill-install"
import {
  inspectPaperMachineProfile,
  type PaperExperimentEnvironmentStatus,
  type PaperMachineProfile,
} from "./machine"
import {
  planExperiments,
  plannedExperimentSpecs,
  recordExperimentLoop,
  type ExperimentCommand,
  type ExperimentEnvironment,
  type ExperimentPlan,
  type ExperimentProtocol,
  type ExperimentProtocolGuidance,
  type ExperimentProtocolStarterPack,
  type ExperimentRun,
  type ExperimentRunner,
  type ExperimentSpec,
  type ResultReport,
} from "./research/experiments"
import type { NoveltyCheckpoint, ExperimentNoveltyGate } from "./novelty"
import type { ResearchWikiDigest } from "./research-wiki"
import type { PaperSpine } from "./paper-spine"
import type { GlobalFigureSpec } from "./global-figure"
import { formatDraftPaperForProfile } from "./authoring"

import {
  applyPaperRunControl,
  controllerSseEvent,
  derivePaperRunControllerState,
  enqueuePaperRunGuidance,
  initializePaperRunControllerState,
  loadPaperRunControllerState,
  type PaperRunControlInput,
  type PaperRunControllerState,
} from "./run-controller"

export type BudgetTier = "quick" | "standard" | "deep" | "submission" | "custom"
export type QualityMode = "reviewable_bundle" | "submission_candidate"

export interface DataEgressPolicy {
  mode: "private_first" | "allow_summaries" | "allow_authorized_paths"
  allowed_paths: string[]
  denied_patterns: string[]
  external_model_full_text: boolean
}

export interface PaperRunCreateRequest extends ResearchIntakeRequest {
  budget_tier?: BudgetTier
  quality_mode?: QualityMode
  storage_scope?: ResearchStorageScope
  data_egress_policy?: Partial<DataEgressPolicy>
}

export interface PaperRunHistoryEntry {
  schema_version: "PaperRunHistoryEntry.v1"
  run_id: string
  topic: string
  workspace: string
  status: PaperRunSnapshot["status"]
  storage_scope: ResearchStorageScope
  run_dir: string
  runtime_root: string
  created_at: string
  updated_at: string
}

export interface PaperRunResumeRequest {
  run_id: string
}

export interface PaperDoctorReport {
  schema_version: "PaperDoctorReport.v1"
  configured: string[]
  missing: string[]
  optional_missing: string[]
  blocked: string[]
  next_steps: string[]
}

export interface PaperRunStageSnapshot {
  id: PaperResearchStageId
  title: string
  status: PaperResearchStageStatus
  depends_on: PaperResearchStageId[]
  artifact_schema: string
  summary?: string
}

export interface AgentNode {
  agent_id: string
  parent_agent_id?: string
  depth: number
  role: string
  provider_id: string
  model_id: string
  capabilities: string[]
  budget: {
    tier: BudgetTier
    usd_cap: number
  }
  input_artifacts: string[]
  output_artifacts: string[]
  tool_traces: string[]
  children: string[]
  permissions: AgentPermissionEnvelope
  status: "planned" | "running" | "succeeded" | "blocked" | "failed"
}

export interface AgentTree {
  schema_version: "AgentTree.v1"
  max_depth: null
  max_parallel: number
  recursive_policy: RecursiveAgentPolicy
  nodes: AgentNode[]
}

export interface PaperRunPauseQuestion {
  question_id: string
  reason: string
  message: string
  required: boolean
  created_at: string
}

export interface PaperRunGuidanceResponse {
  accepted: boolean
  run_id: string
  event_id: string
  message: string
}

export interface PaperRunEvent {
  event_id: string
  run_id: string
  type:
    | string
    | "agent.spawned"
    | "agent.completed"
    | "agent.blocked"
    | "agent.expansion_skipped"
    | "sidebar.updated"
    | "outline.updated"
    | "diagnostics.cost_updated"
    | "gate.summary_updated"
  created_at: string
  actor: ResearchEvent["actor"]
  payload: Record<string, unknown>
}

export interface PaperRunLiveEvent {
  event:
    | "paper.run.snapshot"
    | "stage.updated"
    | "draft.updated"
    | "agent.updated"
    | "model.routing_decision"
    | "diagnostics.cost_updated"
    | "gate.summary_updated"
    | "novelty.updated"
    | "paperspine.updated"
    | "figure.updated"
    | "preview.updated"
    | "export.updated"
  run_id: string
  created_at: string
  data: Record<string, unknown>
}

export interface PaperExportBundle {
  run_id: string
  status: "blocked" | "final" | "forced_draft"
  formats: Array<"markdown" | "latex" | "pdf" | "docx" | "html">
  artifact_ids: string[]
  failed_checks: string[]
  files?: Array<{
    format: "markdown" | "latex" | "pdf" | "docx" | "html"
    path: string
    status: "written" | "failed"
    mime_type?: string
    bytes?: number
    sha256?: string
  }>
  manifest_path?: string
  tool_diagnostics?: string[]
  message: string
}

export interface PaperRunSnapshot {
  schema_version: "PaperRun.v1"
  run_id: string
  topic: string
  workspace: string
  status: "initialized" | "running" | "succeeded" | "blocked" | "failed" | "cancelled"
  created_at: string
  updated_at: string
  intake: ResearchBrief
  budget_tier: BudgetTier
  quality_mode: QualityMode
  data_egress_policy: DataEgressPolicy
  stage_graph: {
    schema_version: "ResearchRunGraph.v1"
    stages: PaperRunStageSnapshot[]
  }
  events: PaperRunEvent[]
  source_ledger: ResearchSource[]
  claim_ledger: ResearchClaim[]
  experiment_status: {
    planned: boolean
    exploratory_runs: number
    reproduction_gate: "not_started" | "passed" | "blocked"
  }
  novelty: {
    checkpoints: NoveltyCheckpoint[]
    experiment_gate?: ExperimentNoveltyGate
  }
  research_wiki?: ResearchWikiDigest
  paper_spine?: PaperSpine
  global_figure?: GlobalFigureSpec
  agent_tree: AgentTree
  agent_team: PaperAgentTeamState
  memory_bank: PaperMemoryBank
  code_understanding: CodeUnderstandingGraph
  diagnostics: {
    counts: {
      events: number
      artifacts: number
      sources: number
      tool_traces: number
      claims: number
      drafts: number
      reviews: number
      exports: number
      checkpoints: number
    }
    model_roles: Partial<Record<PaperModelRole, PaperModelRef>>
    model_inventory?: PaperModelInventory
    model_routing?: ModelRoutingDecision[]
    cost: unknown
    runtime_root: string
    machine_profile: PaperMachineProfile
    experiment_environment: PaperExperimentEnvironmentStatus
    token_usage: {
      input_tokens: number
      output_tokens: number
      total_tokens: number
      estimated: boolean
    }
    final_gate: unknown
    tool_traces: ResearchToolTrace[]
    audit: PaperObservabilityAuditSummary
    memory?: ReturnType<typeof memoryBankSummary>
    code_understanding?: ReturnType<typeof codeUnderstandingSummary>
    crawler?: CrawlerDiagnosticsSummary
    huggingface?: HFLoopDiagnostics
    experiment_guidance?: ExperimentProtocolGuidance
    experiment_starter_pack?: ExperimentProtocolStarterPack
    experiment_runs?: {
      host_runs: ExperimentRun[]
      container_runs: ExperimentRun[]
    }
    experiment_terminal_traces?: PaperExperimentTerminalTraceArtifact[]
  }
  artifacts: ResearchArtifact[]
  drafts: ResearchDraft[]
  reviews: ResearchReview[]
  exports: ResearchExport[]
  pause_questions: PaperRunPauseQuestion[]
  preview_state: {
    readonly: true
    status: "ready" | "blocked"
    run_id: string
  }
  export_state: PaperExportBundle
  controller_state: PaperRunControllerState
  internal_sessions: string[]
}

export interface PaperRun {
  run_id: string
  run_dir: string
  snapshot: PaperRunSnapshot
}

export interface PaperRunPreviewResponse {
  readonly: true
  run_id: string
  status: PaperRunSnapshot["preview_state"]["status"]
  url: string
  token: string
  snapshot: PreviewSnapshot
  drafts: ResearchDraft[]
  exports: ResearchExport[]
  export_state: PaperExportBundle
  annotations: Array<{
    claim_id: string
    source_ids: string[]
    artifact_ids: string[]
  }>
  diagnostics: PaperRunSnapshot["diagnostics"]
}

export interface PaperExperimentStarterApplyRequest {
  workspace_path?: string
  dry_run?: boolean
  overwrite?: boolean
  file_paths?: readonly string[]
  update_package_json?: boolean
}

export interface PaperExperimentStarterApplyFileResult {
  path: string
  target_path: string
  artifact_id?: string
  artifact_path?: string
  status: "would_write" | "would_overwrite" | "written" | "overwritten" | "conflict" | "skipped"
  message: string
}

export interface PaperExperimentStarterApplyResult {
  schema_version: "PaperExperimentStarterApplyResult.v1"
  run_id: string
  status: "ready" | "blocked"
  dry_run: boolean
  overwrite: boolean
  workspace_path: string
  files: PaperExperimentStarterApplyFileResult[]
  written_count: number
  conflict_count: number
  skipped_count: number
  audit_artifact_id?: string
  message: string
  action?: string
}

export interface PaperExperimentProtocolRunRequest {
  workspace_path?: string
  dry_run?: boolean
  timeout_seconds?: number
}

export interface PaperExperimentProtocolRunSummary {
  experiment_id: string
  role: "proposed" | "baseline" | "ablation"
  environment: "host" | "container"
  status: string
  command: string
  exit_code: number
  wall_time_seconds: number
  metrics: Array<{ name: string; value: number; unit?: string }>
}

export interface PaperExperimentTerminalTraceSummary {
  trace_id: string
  artifact_id?: string
  experiment_id: string
  role: "proposed" | "baseline" | "ablation"
  environment: "host" | "container"
  command: string
  cwd: string
  status: string
  exit_code: number
  wall_time_seconds: number
  timed_out: boolean
  stdout_bytes: number
  stderr_bytes: number
  output_truncated: boolean
}

export interface PaperExperimentTerminalTraceArtifact extends PaperExperimentTerminalTraceSummary {
  schema_version: "ExperimentTerminalTrace.v1"
  run_id: string
  platform: NodeJS.Platform | "container"
  timeout_seconds: number
  stdout_excerpt: string
  stderr_excerpt: string
  started_at: string
  finished_at: string
}

export interface PaperExperimentProtocolRunResult {
  schema_version: "PaperExperimentProtocolRunResult.v1"
  run_id: string
  status: "ready" | "succeeded" | "blocked"
  dry_run: boolean
  workspace_path: string
  planned_commands: Array<{
    experiment_id: string
    role: "proposed" | "baseline" | "ablation" | "container_reproduction"
    environment: "host" | "container"
    command: string
  }>
  host_runs: PaperExperimentProtocolRunSummary[]
  container_runs: PaperExperimentProtocolRunSummary[]
  terminal_traces: PaperExperimentTerminalTraceSummary[]
  report?: ResultReport
  artifact_ids: string[]
  message: string
  action?: string
}

export interface PaperRunRuntimeOptions extends ResearchRuntimeOptions {
  workspace?: string
}

export class PaperRunNotFoundError extends Error {
  constructor(readonly runID: string) {
    super(`PaperRun ${runID} was not found`)
    this.name = "PaperRunNotFoundError"
  }
}

const livePreviewServers = new Map<
  string,
  {
    handle: PreviewServerHandle
    updated_at: string
  }
>()

const paperRunLiveBus = new EventEmitter()

function paperRunLiveEventsFromSnapshot(snapshot: PaperRunSnapshot): PaperRunLiveEvent[] {
  const now = new Date().toISOString()
  const events: PaperRunLiveEvent[] = [
    {
      event: "paper.run.snapshot",
      run_id: snapshot.run_id,
      created_at: now,
      data: { snapshot },
    },
    ...snapshot.stage_graph.stages.map((stage) => ({
      event: "stage.updated" as const,
      run_id: snapshot.run_id,
      created_at: now,
      data: { stage },
    })),
    ...snapshot.drafts.slice(-1).map((draft) => ({
      event: "draft.updated" as const,
      run_id: snapshot.run_id,
      created_at: now,
      data: { draft },
    })),
    {
      event: "novelty.updated",
      run_id: snapshot.run_id,
      created_at: now,
      data: { novelty: snapshot.novelty },
    },
    ...(snapshot.paper_spine
      ? [
          {
            event: "paperspine.updated" as const,
            run_id: snapshot.run_id,
            created_at: now,
            data: { paper_spine: snapshot.paper_spine },
          },
        ]
      : []),
    ...(snapshot.global_figure
      ? [
          {
            event: "figure.updated" as const,
            run_id: snapshot.run_id,
            created_at: now,
            data: { global_figure: snapshot.global_figure },
          },
        ]
      : []),
    ...snapshot.agent_tree.nodes.slice(-8).map((agent) => ({
      event: "agent.updated" as const,
      run_id: snapshot.run_id,
      created_at: now,
      data: { agent },
    })),
    ...(snapshot.diagnostics.model_routing ?? []).slice(-8).map((decision) => ({
      event: "model.routing_decision" as const,
      run_id: snapshot.run_id,
      created_at: now,
      data: { decision },
    })),
    {
      event: "diagnostics.cost_updated",
      run_id: snapshot.run_id,
      created_at: now,
      data: { cost: snapshot.diagnostics.cost },
    },
    {
      event: "gate.summary_updated",
      run_id: snapshot.run_id,
      created_at: now,
      data: { final_gate: snapshot.diagnostics.final_gate, export_state: snapshot.export_state },
    },
    {
      event: "preview.updated",
      run_id: snapshot.run_id,
      created_at: now,
      data: { preview_state: snapshot.preview_state },
    },
    {
      event: "export.updated",
      run_id: snapshot.run_id,
      created_at: now,
      data: { export_state: snapshot.export_state },
    },
  ]
  return events
}

export function initialPaperRunLiveEvents(snapshot: PaperRunSnapshot) {
  return paperRunLiveEventsFromSnapshot(snapshot)
}

export function subscribeToPaperRunLiveEvents(runID: string, listener: (event: PaperRunLiveEvent) => void) {
  const handler = (event: PaperRunLiveEvent) => {
    if (event.run_id === runID) listener(event)
  }
  paperRunLiveBus.on("event", handler)
  return () => paperRunLiveBus.off("event", handler)
}

async function publishPaperRunSnapshot(snapshot: PaperRunSnapshot, runDir?: string) {
  for (const event of paperRunLiveEventsFromSnapshot(snapshot)) paperRunLiveBus.emit("event", event)
  const existing = livePreviewServers.get(snapshot.run_id)
  if (!existing || !runDir) return
  const previewSnapshot = await createPaperRunLivePreviewSnapshot(runDir, snapshot)
  existing.handle.updateSnapshot(previewSnapshot)
  existing.updated_at = previewSnapshot.updated_at
}

function defaultDataEgressPolicy(input?: Partial<DataEgressPolicy>): DataEgressPolicy {
  return {
    mode: input?.mode ?? "private_first",
    allowed_paths: input?.allowed_paths ?? [],
    denied_patterns: input?.denied_patterns ?? ["**/.env*", "**/.git/**", "**/node_modules/**", "**/*secret*"],
    external_model_full_text: input?.external_model_full_text ?? false,
  }
}

function normalizeBudgetTier(value?: BudgetTier): BudgetTier {
  return value ?? "standard"
}

function normalizeQualityMode(value: QualityMode | undefined, budgetTier: BudgetTier): QualityMode {
  if (value) return value
  return budgetTier === "submission" ? "submission_candidate" : "reviewable_bundle"
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function metadataString(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function metadataStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function metadataBudgetTier(value: unknown): BudgetTier | undefined {
  return value === "quick" || value === "standard" || value === "deep" || value === "submission" || value === "custom"
    ? value
    : undefined
}

function metadataQualityMode(value: unknown): QualityMode | undefined {
  return value === "reviewable_bundle" || value === "submission_candidate" ? value : undefined
}

function metadataStorageScope(value: unknown): ResearchStorageScope | undefined {
  return value === "home" || value === "workspace" ? value : undefined
}

function tokenUsageFromCost(value: unknown) {
  const record = jsonRecord(value)
  const inputTokens = numberValue(record.input_tokens ?? record.prompt_tokens)
  const outputTokens = numberValue(record.output_tokens ?? record.completion_tokens)
  const totalTokens = numberValue(record.total_tokens) || inputTokens + outputTokens
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    estimated: !record.total_tokens,
  }
}

function runOptions(input?: PaperRunRuntimeOptions): PaperRunRuntimeOptions {
  return {
    ...input,
    workspace: input?.workspace ? path.resolve(input.workspace) : undefined,
  }
}

function isPathInside(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function resolveWorkspaceStarterTarget(workspace: string, filePath: string) {
  if (path.isAbsolute(filePath)) throw new Error(`starter file path must be relative: ${filePath}`)
  const normalized = filePath.replace(/\\/g, "/")
  const target = path.resolve(workspace, normalized)
  const root = path.resolve(workspace)
  if (!isPathInside(root, target)) throw new Error(`starter file path escapes workspace: ${filePath}`)
  return target
}

async function pathExists(target: string) {
  return access(target).then(
    () => true,
    () => false,
  )
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

async function applyStarterPackageJsonScripts(input: {
  workspace: string
  scripts: Record<string, string>
  dryRun: boolean
  overwrite: boolean
}): Promise<PaperExperimentStarterApplyFileResult> {
  const target = path.resolve(input.workspace, "package.json")
  const exists = await pathExists(target)
  const scriptEntries = Object.entries(input.scripts)
  if (scriptEntries.length === 0) {
    return {
      path: "package.json",
      target_path: target,
      status: "skipped",
      message: "starter pack 没有建议写入的 package.json scripts。",
    }
  }

  let packageJson: Record<string, unknown> = {}
  if (exists) {
    try {
      packageJson = objectRecord(JSON.parse(await readFile(target, "utf8"))) ?? {}
    } catch (error) {
      return {
        path: "package.json",
        target_path: target,
        status: "conflict",
        message: `package.json 不是合法 JSON，已跳过 scripts 写入：${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  const scripts = objectRecord(packageJson.scripts) ?? {}
  const conflicts = scriptEntries.filter(([name, command]) => typeof scripts[name] === "string" && scripts[name] !== command)
  const missing = scriptEntries.filter(([name]) => scripts[name] === undefined)
  const same = scriptEntries.filter(([name, command]) => scripts[name] === command)

  if (conflicts.length > 0 && !input.overwrite) {
    return {
      path: "package.json",
      target_path: target,
      status: "conflict",
      message: `package.json 已有不同命令：${conflicts.map(([name]) => name).join(", ")}；默认不会覆盖。`,
    }
  }
  if (missing.length === 0 && conflicts.length === 0 && same.length === scriptEntries.length) {
    return {
      path: "package.json",
      target_path: target,
      status: "skipped",
      message: "package.json scripts 已包含 starter pack 建议命令。",
    }
  }

  if (input.dryRun) {
    return {
      path: "package.json",
      target_path: target,
      status: exists ? "would_overwrite" : "would_write",
      message:
        conflicts.length > 0
          ? `预检通过；启用 overwrite 后会更新 scripts：${conflicts.map(([name]) => name).join(", ")}。`
          : `预检通过；会新增 scripts：${missing.map(([name]) => name).join(", ")}。`,
    }
  }

  packageJson.scripts = {
    ...scripts,
    ...Object.fromEntries(scriptEntries),
  }
  await writeFile(target, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8")
  return {
    path: "package.json",
    target_path: target,
    status: exists ? "overwritten" : "written",
    message:
      conflicts.length > 0
        ? `已更新 package.json scripts：${scriptEntries.map(([name]) => name).join(", ")}。`
        : `已写入 package.json scripts：${missing.map(([name]) => name).join(", ")}。`,
  }
}

function finalGateBlockers(value: unknown) {
  return metadataStringArray(jsonRecord(value).blockers)
}

function stageStatusFromEvents(
  stage: PaperResearchStageDefinition,
  events: ResearchEvent[],
  finalGate: unknown,
): PaperRunStageSnapshot {
  const gate = finalGateStatus(finalGate)
  const gateBlockers = finalGateBlockers(finalGate)
  if (stage.id === "reproduction" && gate === "blocked" && gateBlockers.includes("reproduction_failure")) {
    return {
      ...stage,
      status: "blocked",
      summary: "Final gate blocker reproduction_failure requires successful container reproduction before final claims.",
    }
  }

  const completed = events.findLast(
    (event) =>
      (event.type === "paper.stage.completed" || event.type === "paperorchestrator.stage.completed") &&
      event.payload?.stage === stage.id,
  )
  if (completed) {
    return {
      ...stage,
      status: "succeeded",
      summary: metadataString(completed.payload?.summary),
    }
  }

  const blocked = events.findLast(
    (event) =>
      (event.type === "paper.stage.blocked" || event.type === "paperorchestrator.stage.blocked") &&
      event.payload?.stage === stage.id,
  )
  if (blocked) {
    return {
      ...stage,
      status: "blocked",
      summary: metadataString(blocked.payload?.message),
    }
  }

  const started = events.findLast(
    (event) =>
      (event.type === "paper.stage.started" || event.type === "paperorchestrator.stage.started") &&
      event.payload?.stage === stage.id,
  )
  if (started) return { ...stage, status: "running" }

  if (stage.id === "intake" && events.some((event) => event.type === "intake.brief.created")) {
    return { ...stage, status: "succeeded", summary: "Research intake recorded." }
  }

  return { ...stage, status: "pending" }
}

function terminalStages(stages: PaperRunStageSnapshot[]) {
  return stages.every((stage) => stage.status !== "pending" && stage.status !== "running")
}

function paperRunStatus(input: {
  researchStatus: Awaited<ReturnType<typeof getResearchRunStatus>>["run"]["status"]
  stages: PaperRunStageSnapshot[]
  finalGate: unknown
}): PaperRunSnapshot["status"] {
  if (input.researchStatus === "cancelled") return "cancelled"
  if (input.researchStatus === "failed") return "failed"
  const gate = finalGateStatus(input.finalGate)
  if (input.stages.some((stage) => stage.status === "blocked")) return "blocked"
  if (gate === "blocked") return "blocked"
  if (input.stages.every((stage) => stage.status === "succeeded" || stage.status === "skipped")) {
    return gate === "passed" ? "succeeded" : "blocked"
  }
  return input.researchStatus
}

function researchTerminalStatus(snapshot: Omit<PaperRunSnapshot, "controller_state">): "succeeded" | "failed" | undefined {
  if (!terminalStages(snapshot.stage_graph.stages)) return undefined
  const gate = finalGateStatus(snapshot.diagnostics.final_gate)
  if (snapshot.stage_graph.stages.some((stage) => stage.status === "blocked") && gate !== "blocked") return "failed"
  return "succeeded"
}

function defaultAgentTree(input: {
  runID: string
  tier: BudgetTier
  capabilities: ResearchCapability[]
    writer?: PaperModelRef
}): AgentTree {
  const policy = budgetTierPolicy(input.tier)
  const permissionDefaults: AgentPermissionEnvelope = {
    allowed_tool_names: input.capabilities.map((capability) => capability.name),
    allowed_paths: [],
    data_egress: "private_first",
    network_allowed: false,
  }
  return {
    schema_version: "AgentTree.v1",
    max_depth: policy.max_depth,
    max_parallel: policy.max_parallel,
    recursive_policy: recursiveAgentPolicyForBudget(input.tier),
    nodes: [
      {
        agent_id: `${input.runID}:root`,
        depth: 0,
        role: "root_run_agent",
        provider_id: input.writer?.provider_id ?? "unconfigured",
        model_id: input.writer?.model_id ?? "unconfigured",
        capabilities: input.capabilities.map((capability) => capability.name),
        budget: {
          tier: input.tier,
          usd_cap: policy.cost_cap_usd,
        },
        input_artifacts: [],
        output_artifacts: [],
        tool_traces: [],
        children: [],
        permissions: permissionDefaults,
        status: input.writer ? "running" : "blocked",
      },
    ],
  }
}

function modelRoleMap(config: ResearchIntakeRequest["model_roles"]) {
  if (!config) return {}
  const firstConfigured = Object.values(config).find((value): value is string => typeof value === "string" && value.includes("/"))
  if (!firstConfigured) return {}
  const router = createModelRoleRouter({
    default_model: firstConfigured,
    roles: config,
  })
  const roles: Partial<Record<PaperModelRole, PaperModelRef>> = {}
  for (const role of PAPER_MODEL_ROLES) {
    if (!config[role]) continue
    const resolved = router.resolve(role)
    roles[role] = {
      provider_id: resolved.provider_id,
      model_id: resolved.model_id,
    }
  }
  return roles
}

function metadataModelRoles(value: unknown): Partial<Record<PaperModelRole, PaperModelRef>> | undefined {
  const record = jsonRecord(value)
  const roles: Partial<Record<PaperModelRole, PaperModelRef>> = {}
  for (const role of PAPER_MODEL_ROLES) {
    const raw = jsonRecord(record[role])
    const provider = metadataString(raw.provider_id)
    const model = metadataString(raw.model_id)
    if (!provider || !model) continue
    roles[role] = {
      provider_id: provider,
      model_id: model,
    }
  }
  return roles
}

function metadataRoutingDecisions(value: unknown): ModelRoutingDecision[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is ModelRoutingDecision => {
    const record = jsonRecord(item)
    return record.schema_version === "ModelRoutingDecision.v1" && typeof record.role === "string"
  })
}

function modelRolesFromRouting(decisions: ModelRoutingDecision[]): Partial<Record<PaperModelRole, PaperModelRef>> {
  const roles: Partial<Record<PaperModelRole, PaperModelRef>> = {}
  for (const decision of decisions) {
    if (!decision.selected_model) continue
    roles[decision.role] = parsePaperModelId(decision.selected_model, decision.role)
  }
  return roles
}

function dataEgressCandidates(request: ResearchIntakeRequest) {
  return [
    ...(request.code_paths ?? []),
    ...(request.paper_files ?? []),
    ...(request.dataset_paths ?? []),
    ...(request.experiment_logs ?? []),
    request.workspace_path,
  ].filter((item): item is string => typeof item === "string" && item.length > 0)
}

function finalGateStatus(value: unknown) {
  const status = jsonRecord(value).status
  return status === "passed" || status === "blocked" ? status : "not_started"
}

function reproductionGateStatus(value: unknown, experimentRuns: ExperimentRun[]) {
  const gate = finalGateStatus(value)
  const blockers = finalGateBlockers(value)
  if (blockers.includes("reproduction_failure")) return "blocked"
  if (gate === "passed") return "passed"
  if (experimentRuns.some((run) => run.environment.mode === "container" && run.status === "succeeded")) return "passed"
  return "not_started"
}

function isFinalResearchExport(item: ResearchExport) {
  return item.export_id.startsWith("export:bundle-final-")
}

function exportState(input: {
  runID: string
  state: Awaited<ReturnType<typeof getResearchRunStatus>>["state"]
  exports: ResearchExport[]
  finalBundle?: ExportBundle
}): PaperExportBundle {
  const blockers = metadataStringArray(jsonRecord(input.state.final_gate).blockers)
  const gate = finalGateStatus(input.state.final_gate)
  if (gate !== "passed") {
    return {
      run_id: input.runID,
      status: "blocked",
      formats: [],
      artifact_ids: [],
      failed_checks: blockers.length > 0 ? blockers : ["final_gate_not_passed"],
      message: "Final export is blocked until authenticity, source, claim, and reproduction gates pass.",
    }
  }
  if (input.finalBundle) return paperExportBundleFromResearch(input.runID, input.finalBundle)
  const finalExports = input.exports.filter(isFinalResearchExport)
  if (finalExports.length === 0) {
    return {
      run_id: input.runID,
      status: "blocked",
      formats: [],
      artifact_ids: [],
      failed_checks: ["final_export_missing"],
      message: "Final gate passed, but no final export has been generated yet.",
    }
  }
  const formats = [...new Set(finalExports.map((item) => item.format))]
  const artifactIds = [...new Set(finalExports.flatMap((item) => item.artifact_ids))]
  const files = Array.from(
    new Map(
      finalExports.map((item) => [
        `${item.format}:${item.path}`,
        {
          format: item.format,
          path: item.path,
          status: "written" as const,
        },
      ]),
    ).values(),
  )
  return {
    run_id: input.runID,
    status: "final",
    formats,
    artifact_ids: artifactIds,
    files,
    failed_checks: [],
    message: "Final export is available.",
  }
}

function normalizeFinalGateState(value: unknown, updatedAt: string): ResearchFinalGateState {
  const record = jsonRecord(value)
  const status = record.status === "passed" ? "passed" : "blocked"
  const blockers = metadataStringArray(record.blockers)
  return {
    status,
    blockers: status === "passed" ? blockers : blockers.length > 0 ? blockers : ["final_gate_not_passed"],
    updated_at: metadataString(record.updated_at) ?? updatedAt,
  }
}

function fallbackDraftPaper(input: {
  runID: string
  title: string
  markdown?: string
  claimIDs?: string[]
  createdAt: string
}): DraftPaper {
  const markdown =
    input.markdown ?? "尚未生成草稿。\n\n当前 PaperRun 还没有真实 DraftPaper artifact；final export 会继续保持阻断。"
  return {
    schema_version: "DraftPaper.v1",
    draft_id: `draft:${input.runID}`,
    title: input.title,
    created_at: input.createdAt,
    version: 1,
    sections: [
      {
        section_id: "paper",
        title: input.markdown ? "Paper" : "草稿状态",
        level: 1,
        markdown,
        claim_ids: input.claimIDs ?? [],
        source_ranges: [],
      },
    ],
    markdown,
    claim_ids: input.claimIDs ?? [],
    applied_guidance_ids: [],
  }
}

async function loadLatestDraftPaper(input: {
  runDir: string
  run: Awaited<ReturnType<typeof loadResearchRun>>
  drafts: ResearchDraft[]
}) {
  const latest = input.drafts.at(-1)
  if (!latest) {
    return {
      draft: undefined,
      sourceArtifactIDs: [] as string[],
    }
  }
  const markdown = await readFile(path.join(input.runDir, latest.path), "utf8").catch(() => undefined)
  if (!markdown) {
    return {
      draft: undefined,
      sourceArtifactIDs: latest.artifact_ids,
    }
  }
  return {
    draft: fallbackDraftPaper({
      runID: input.run.run_id,
      title: latest.title,
      markdown,
      claimIDs: latest.claim_ids,
      createdAt: latest.created_at,
    }),
    sourceArtifactIDs: latest.artifact_ids,
  }
}

function repositoryUrlFromPackage(value: unknown) {
  if (typeof value === "string") return value.trim().replace(/^git\+/, "").replace(/^git:\/\//, "https://").replace(/\.git$/, "") || undefined
  if (typeof value === "object" && value !== null && "url" in value && typeof value.url === "string") {
    return value.url.trim().replace(/^git\+/, "").replace(/^git:\/\//, "https://").replace(/\.git$/, "") || undefined
  }
  return undefined
}

async function packageCodeMetadata(workspace: string, fallbackWorkspace?: string): Promise<CodeAvailabilityMetadata | undefined> {
  const raw = await readFile(path.join(workspace, "package.json"), "utf8").catch(() => undefined)
  let parsed: Record<string, unknown> = {}
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch {
      parsed = {}
    }
  }
  const packageVersion = typeof parsed.version === "string" ? parsed.version : undefined
  const metadata: CodeAvailabilityMetadata = {
    package_name: typeof parsed.name === "string" ? parsed.name : undefined,
    repository_url: repositoryUrlFromPackage(parsed.repository),
    version: await workspaceProductVersion(workspace, packageVersion, fallbackWorkspace),
    commit_hash: await gitShortCommit(workspace),
    worktree_dirty: await gitWorktreeDirty(workspace),
    license: typeof parsed.license === "string" ? parsed.license : undefined,
  }
  return metadata.package_name || metadata.repository_url || metadata.version || metadata.commit_hash || typeof metadata.worktree_dirty === "boolean" || metadata.license ? metadata : undefined
}

async function gitShortCommit(workspace: string) {
  const result = await runExperimentShellCommand("git rev-parse --short HEAD", workspace, 5_000)
  if (result.exitCode !== 0 || result.timedOut) return undefined
  return result.stdout.trim() || undefined
}

async function gitWorktreeDirty(workspace: string) {
  const result = await runExperimentShellCommand("git status --porcelain", workspace, 5_000)
  if (result.exitCode !== 0 || result.timedOut) return undefined
  return result.stdout.trim().length > 0
}

async function workspaceProductVersion(workspace: string, packageVersion?: string, fallbackWorkspace?: string) {
  const roots = candidateVersionRoots(workspace, fallbackWorkspace)
  for (const root of roots) {
    const readme = await readFile(path.join(root, "README.md"), "utf8").catch(() => undefined)
    const readmeVersion = readme?.match(/<!--\s*version:start\s*-->([^<]+)<!--\s*version:end\s*-->/)?.[1]?.trim()
    if (readmeVersion) return readmeVersion
  }
  for (const root of roots) {
    const changelog = await readFile(path.join(root, "CHANGELOG"), "utf8").catch(() => undefined)
    const changelogVersion = changelog?.match(/^:version\s+(.+)$/m)?.[1]?.trim()
    if (changelogVersion) return changelogVersion
  }
  return packageVersion
}

function candidateVersionRoots(workspace: string, fallbackWorkspace?: string) {
  const roots: string[] = []
  for (const start of [workspace, fallbackWorkspace].filter((item): item is string => Boolean(item))) {
    let current = path.resolve(start)
    for (let depth = 0; depth < 8; depth++) {
      roots.push(current)
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  return [...new Set(roots)]
}

async function refreshDraftPaperForFinalExport(input: {
  runDir: string
  run: Awaited<ReturnType<typeof loadResearchRun>>
  artifacts: ResearchArtifact[]
  existingSourceArtifactIDs: string[]
  options?: PaperRunRuntimeOptions
}) {
  const ledger = await readLatestArtifactBySchema<ClaimLedger>(input.runDir, input.artifacts, "ClaimLedger.v1")
  const resultReport = await readLatestArtifactBySchema<ResultReport>(input.runDir, input.artifacts, "ResultReport.v1")
  if (!ledger || !resultReport) return undefined
  const [
    dataPlan,
    literatureMap,
    experimentPlan,
    experimentProtocol,
    experimentGuidance,
    experimentStarterPack,
    experimentRunGroups,
    codeMetadata,
  ] = await Promise.all([
    readLatestArtifactBySchema<DataPlan>(input.runDir, input.artifacts, "DataPlan.v1"),
    readLatestArtifactBySchema<LiteratureMap>(input.runDir, input.artifacts, "LiteratureMap.v1"),
    readLatestArtifactBySchema<ExperimentPlan>(input.runDir, input.artifacts, "ExperimentPlan.v1"),
    readLatestArtifactBySchema<ExperimentProtocol>(input.runDir, input.artifacts, "ExperimentProtocol.v1"),
    readLatestArtifactBySchema<ExperimentProtocolGuidance>(input.runDir, input.artifacts, "ExperimentProtocolGuidance.v1"),
    readLatestArtifactBySchema<ExperimentProtocolStarterPack>(input.runDir, input.artifacts, "ExperimentProtocolStarterPack.v1"),
    readArtifactsBySchema<ExperimentRun[]>(input.runDir, input.artifacts, "ExperimentRun.v1[]"),
    packageCodeMetadata(input.run.workspace, input.options?.workspace),
  ])
  const finalClaimsAllowed = resultReport.final_claims_allowed === true
  const experimentRuns = latestExperimentRuns(experimentRunGroups.flat())
  const draft = composeDraftPaper({
    title: input.run.topic,
    ledger,
    data_plan: dataPlan,
    literature_map: literatureMap,
    experiment_plan: experimentPlan,
    experiment_protocol: experimentProtocol,
    experiment_guidance: finalClaimsAllowed ? undefined : experimentGuidance,
    experiment_starter_pack: finalClaimsAllowed ? undefined : experimentStarterPack,
    experiment_runs: {
      host_runs: experimentRuns.filter((run) => run.environment.mode === "host"),
      container_runs: experimentRuns.filter((run) => run.environment.mode === "container"),
    },
    result_report: resultReport,
    code_metadata: codeMetadata,
    now: input.options?.clock?.().toISOString(),
  })
  const intake = intakeFromRun(input.run)
  const markdown = formatDraftPaperForProfile(draft, {
    target_profile: intake.target_profile,
    ledger,
    data_plan: dataPlan,
    result_report: resultReport,
    code_artifact_ids: input.existingSourceArtifactIDs,
  })
  const refreshedDraft: DraftPaper = {
    ...draft,
    draft_id: `${draft.draft_id}:final-export-${randomUUID()}`,
    markdown,
    version: draft.version + 1,
  }
  const draftArtifact = await writeResearchArtifact(
    input.runDir,
    {
      artifact_id: `artifact-final-draft-${randomUUID()}`,
      kind: "draft",
      logical_path: "writing/draft.md",
      data: refreshedDraft.markdown,
      mime_type: "text/markdown",
      source_ids: Array.from(new Set(ledger.entries.flatMap((entry) => entry.source_ids))),
      metadata: { artifact_schema: "DraftPaper.v1", draft_id: refreshedDraft.draft_id, refreshed_for: "final_export" },
    },
    input.options,
  )
  const chunksArtifact = await writeResearchArtifact(
    input.runDir,
    {
      artifact_id: `artifact-final-draft-chunks-${randomUUID()}`,
      kind: "log",
      logical_path: "writing/stream-chunks.json",
      data: [...streamMarkdownDraft(refreshedDraft)],
      metadata: { artifact_schema: "MarkdownStreamChunks.v1", draft_id: refreshedDraft.draft_id, refreshed_for: "final_export" },
    },
    input.options,
  )
  await appendResearchFact(input.runDir, "draft", {
    schema_version: RESEARCH_SCHEMA_VERSION,
    draft_id: refreshedDraft.draft_id,
    run_id: input.run.run_id,
    title: refreshedDraft.title,
    format: "markdown",
    path: draftArtifact.path,
    claim_ids: refreshedDraft.claim_ids,
    artifact_ids: [draftArtifact.artifact_id, chunksArtifact.artifact_id],
    created_at: refreshedDraft.created_at,
  })
  await appendResearchEvent(
    input.runDir,
    {
      type: "writing.draft.refreshed.finalexport",
      actor: "system",
      payload: {
        draft_id: refreshedDraft.draft_id,
        draft_artifact_id: draftArtifact.artifact_id,
        result_report_status: resultReport.reproduction.status,
        final_claims_allowed: resultReport.final_claims_allowed,
      },
    },
    input.options,
  )
  const evidenceArtifactIDs = input.artifacts
    .filter((artifact) =>
      [
        "ClaimLedger.v1",
        "DataPlan.v1",
        "ExperimentPlan.v1",
        "ExperimentProtocol.v1",
        "ExperimentRun.v1[]",
        "ResultReport.v1",
        "ExperimentTerminalTrace.v1",
      ].includes(String(artifact.metadata?.artifact_schema ?? "")),
    )
    .map((artifact) => artifact.artifact_id)
  return {
    draft: refreshedDraft,
    sourceArtifactIDs: Array.from(
      new Set([
        ...input.existingSourceArtifactIDs,
        ...evidenceArtifactIDs,
        draftArtifact.artifact_id,
        chunksArtifact.artifact_id,
      ]),
    ),
  }
}

function paperExportBundleFromResearch(runID: string, bundle: ExportBundle): PaperExportBundle {
  const writtenFiles = bundle.files.filter((file) => file.status === "written")
  const failedFiles = bundle.files.filter((file) => file.status === "failed")
  const finalMessage =
    failedFiles.length === 0
      ? "Final export rendered with validated files."
      : `Final content gates passed, but ${failedFiles.map((file) => file.format).join(", ")} export failed. Check tool_diagnostics.`
  return {
    run_id: runID,
    status: bundle.status,
    formats: writtenFiles.map((file) => file.format),
    artifact_ids: bundle.manifest.source_artifact_ids,
    failed_checks: bundle.verification_summary.failed_checks,
    files: bundle.files.map((file) => ({
      format: file.format,
      path: file.path,
      status: file.status,
      mime_type: file.mime_type,
      bytes: file.bytes,
      sha256: file.sha256,
    })),
    manifest_path: bundle.manifest.path,
    tool_diagnostics: bundle.manifest.tool_diagnostics,
    message: bundle.status === "final" ? finalMessage : "Forced draft exported with failed checks explicitly marked.",
  }
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function previewMimeType(kind: PreviewArtifactRef["kind"]) {
  switch (kind) {
    case "markdown":
      return "text/markdown"
    case "latex":
      return "text/x-tex"
    case "pdf":
      return "application/pdf"
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }
}

function previewArtifactKind(format: string): PreviewArtifactRef["kind"] | undefined {
  if (format === "markdown" || format === "latex" || format === "pdf" || format === "docx") return format
  return undefined
}

function resolveRunFile(runDir: string, filePath: string) {
  return path.isAbsolute(filePath) ? filePath : path.join(runDir, filePath)
}

async function readArtifactJson<T>(
  runDir: string,
  artifact: ResearchArtifact | undefined,
): Promise<T | undefined> {
  if (!artifact) return undefined
  try {
    return JSON.parse(await readFile(resolveRunFile(runDir, artifact.path), "utf8")) as T
  } catch {
    return undefined
  }
}

async function readArtifactsBySchema<T>(
  runDir: string,
  artifacts: ResearchArtifact[],
  schema: string,
): Promise<T[]> {
  const matches = artifacts.filter((artifact) => artifact.metadata?.artifact_schema === schema)
  const values = await Promise.all(matches.map((artifact) => readArtifactJson<T>(runDir, artifact)))
  const defined: T[] = []
  for (const value of values) {
    if (value !== undefined) defined.push(value as T)
  }
  return defined
}

async function readLatestArtifactBySchema<T>(
  runDir: string,
  artifacts: ResearchArtifact[],
  schema: string,
): Promise<T | undefined> {
  return readArtifactJson<T>(
    runDir,
    artifacts.filter((artifact) => artifact.metadata?.artifact_schema === schema).at(-1),
  )
}

async function readLatestFinalExportBundle(runDir: string, artifacts: ResearchArtifact[]) {
  const bundles = await readArtifactsBySchema<ExportBundle>(runDir, artifacts, "ExportBundle.v1")
  return bundles.filter((bundle) => bundle.schema_version === "ExportBundle.v1" && bundle.status === "final").at(-1)
}

function latestExperimentRuns(runs: ExperimentRun[]) {
  const byRunKey = new Map<string, ExperimentRun>()
  for (const run of runs) {
    const key = `${run.environment.mode}:${run.role}:${run.experiment_id}`
    const existing = byRunKey.get(key)
    if (!existing || Date.parse(run.finished_at) >= Date.parse(existing.finished_at)) {
      byRunKey.set(key, run)
    }
  }
  return [...byRunKey.values()].sort((left, right) => {
    if (left.environment.mode !== right.environment.mode) return left.environment.mode === "host" ? -1 : 1
    const roleCompare = left.role.localeCompare(right.role)
    if (roleCompare !== 0) return roleCompare
    return left.experiment_id.localeCompare(right.experiment_id)
  })
}

function experimentCommandText(command: ExperimentCommand) {
  return command.argv.length === 1 ? command.argv[0]! : command.argv.join(" ")
}

function commandMatchesSpec(entry: ExperimentProtocol["entries"][number], spec: ExperimentSpec) {
  return (
    entry.role === spec.role &&
    (entry.label === spec.label ||
      entry.protocol_id === spec.experiment_id ||
      entry.protocol_id.endsWith(spec.experiment_id) ||
      entry.protocol_id.includes(spec.experiment_id.replace(/:/g, "-")))
  )
}

function commandForProtocolRun(
  spec: ExperimentSpec,
  environment: ExperimentEnvironment,
  protocol: ExperimentProtocol | undefined,
) {
  if (environment.mode === "container") {
    return protocol?.entries.find((entry) => entry.role === "container_reproduction")?.command ?? spec.command
  }
  return protocol?.entries.find((entry) => commandMatchesSpec(entry, spec))?.command ?? spec.command
}

function protocolScriptSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "script"
}

function experimentCommandFromPackageScript(scriptName: string, timeoutSeconds = 120): ExperimentCommand {
  return {
    argv: ["bun", "run", scriptName],
    timeout_seconds: timeoutSeconds,
  }
}

function packageScriptSourceRange(packageJson: string, scriptName: string) {
  const lines = packageJson.split(/\r?\n/)
  const index = lines.findIndex((line) => line.includes(`"${scriptName}"`) || line.includes(`'${scriptName}'`))
  if (index < 0) return undefined
  return {
    path: "package.json",
    start_line: index + 1,
    end_line: index + 1,
  }
}

function packageScriptProtocolEntry(
  scriptName: string,
  packageJson: string,
): ExperimentProtocol["entries"][number] | undefined {
  const normalized = scriptName.toLowerCase()
  const source_range = packageScriptSourceRange(packageJson, scriptName)
  if (/^(baseline|bench:baseline|benchmark:baseline)(:|$)/.test(normalized)) {
    return {
      protocol_id: `baseline:${protocolScriptSlug(scriptName)}`,
      role: "baseline",
      label: scriptName,
      command: experimentCommandFromPackageScript(scriptName),
      expected_metric: "test_pass_rate",
      rationale: "Baseline runner declared by package script.",
      source_range,
    }
  }
  if (/^(ablation|bench:ablation|benchmark:ablation)(:|$)/.test(normalized)) {
    return {
      protocol_id: `ablation:${protocolScriptSlug(scriptName)}`,
      role: "ablation",
      label: scriptName,
      command: experimentCommandFromPackageScript(scriptName),
      expected_metric: "test_pass_rate",
      rationale: "Ablation runner declared by package script.",
      source_range,
    }
  }
  if (/^(container|repro|reproduce)(:|$)/.test(normalized)) {
    return {
      protocol_id: `container:${protocolScriptSlug(scriptName)}`,
      role: "container_reproduction",
      label: scriptName,
      command: experimentCommandFromPackageScript(scriptName, 600),
      expected_metric: "test_pass_rate",
      rationale: "Container reproduction runner declared by package script.",
      source_range,
    }
  }
  if (/^(typecheck|test|check|lint|bench)(:|$)/.test(normalized)) {
    return {
      protocol_id: `proposed:${protocolScriptSlug(scriptName)}`,
      role: "proposed",
      label: scriptName,
      command: experimentCommandFromPackageScript(scriptName),
      expected_metric: normalized === "typecheck" ? "typecheck_pass" : "test_pass_rate",
      rationale: "Primary host exploration command selected from package scripts.",
      source_range,
    }
  }
  return undefined
}

function packageScriptSortKey(scriptName: string) {
  const normalized = scriptName.toLowerCase()
  if (normalized === "typecheck") return `0:${normalized}`
  if (normalized === "test") return `1:${normalized}`
  if (normalized === "check") return `2:${normalized}`
  if (normalized === "lint") return `3:${normalized}`
  if (normalized.startsWith("bench")) return `4:${normalized}`
  if (normalized.includes(":starter")) return `5:${normalized}`
  return `6:${normalized}`
}

async function experimentProtocolFromWorkspacePackageJson(workspace: string): Promise<ExperimentProtocol | undefined> {
  const packagePath = path.join(workspace, "package.json")
  let source: string
  try {
    source = await readFile(packagePath, "utf8")
  } catch {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    return undefined
  }
  if (!parsed || typeof parsed !== "object") return undefined
  const scripts = (parsed as { scripts?: unknown }).scripts
  if (!scripts || typeof scripts !== "object") return undefined
  const entries = Object.keys(scripts as Record<string, unknown>)
    .sort((left, right) => packageScriptSortKey(left).localeCompare(packageScriptSortKey(right)))
    .map((scriptName) => packageScriptProtocolEntry(scriptName, source))
    .filter((entry): entry is ExperimentProtocol["entries"][number] => Boolean(entry))
  const selectedProposed = entries.find((entry) => entry.role === "proposed")
  const filtered = [
    ...(selectedProposed ? [selectedProposed] : []),
    ...entries.filter((entry) => entry.role !== "proposed"),
  ]
  if (filtered.length === 0) return undefined
  const roles = new Set(filtered.map((entry) => entry.role))
  return {
    schema_version: "ExperimentProtocol.v1",
    discovered_from: "package_scripts",
    entries: filtered,
    gaps: [
      !roles.has("proposed") ? "missing_proposed_runner" : undefined,
      !roles.has("baseline") ? "missing_baseline_runner" : undefined,
      !roles.has("ablation") ? "missing_ablation_runner" : undefined,
      !roles.has("container_reproduction") ? "missing_container_reproduction_runner" : undefined,
    ].filter((item): item is string => Boolean(item)),
  }
}

function shouldUseWorkspaceProtocol(current: ExperimentProtocol | undefined, refreshed: ExperimentProtocol | undefined) {
  if (!refreshed) return false
  if (!current) return true
  const currentRoles = new Set(current.entries.map((entry) => entry.role))
  const refreshedRoles = new Set(refreshed.entries.map((entry) => entry.role))
  const gainedRole = [...refreshedRoles].some((role) => !currentRoles.has(role))
  return gainedRole || refreshed.gaps.length < current.gaps.length || refreshed.entries.length > current.entries.length
}

function planForProtocolRerun(input: {
  plan: ExperimentPlan
  protocol: ExperimentProtocol | undefined
  now?: string
}) {
  const protocol = input.protocol
  if (!protocol) return input.plan
  const proposed = protocol.entries.find((entry) => entry.role === "proposed")
  const baselines = protocol.entries.filter((entry) => entry.role === "baseline")
  const ablations = protocol.entries.filter((entry) => entry.role === "ablation")
  if (!proposed && baselines.length === 0 && ablations.length === 0) return input.plan
  const primaryMetric = input.plan.metrics.find((metric) => metric.primary)?.name ?? proposed?.expected_metric ?? input.plan.proposed.expected_metric
  return planExperiments({
    topic: input.plan.topic,
    method_name: input.plan.method_name,
    dataset_ids: input.plan.proposed.dataset_ids,
    objective: input.plan.objective,
    primary_metric: primaryMetric,
    proposed_command: proposed?.command ?? input.plan.proposed.command,
    baseline_specs: baselines.map((entry) => ({
      experiment_id: entry.protocol_id,
      label: entry.label,
      command: entry.command,
      rationale: entry.rationale,
    })),
    ablation_specs: ablations.map((entry) => ({
      experiment_id: entry.protocol_id,
      label: entry.label,
      command: entry.command,
      rationale: entry.rationale,
    })),
    include_default_baselines: false,
    now: input.now,
  })
}

function summarizeExperimentRun(run: ExperimentRun): PaperExperimentProtocolRunSummary {
  return {
    experiment_id: run.experiment_id,
    role: run.role,
    environment: run.environment.mode,
    status: run.status,
    command: experimentCommandText(run.command),
    exit_code: run.exit_code,
    wall_time_seconds: run.resource_usage.wall_time_seconds,
    metrics: run.metrics.map((metric) => ({ name: metric.name, value: metric.value, unit: metric.unit })),
  }
}

function timeoutForProtocolRun(input?: PaperExperimentProtocolRunRequest) {
  const requested = input?.timeout_seconds
  if (typeof requested !== "number" || !Number.isFinite(requested) || requested <= 0) return 120
  return Math.min(Math.max(Math.floor(requested), 1), 900)
}

const EXPERIMENT_TERMINAL_TRACE_EXCERPT_LIMIT = 64 * 1024

function safeExperimentTraceSegment(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "trace"
}

async function runExperimentShellCommand(command: string, cwd: string, timeoutMs: number) {
  return new Promise<{
    stdout: string
    stderr: string
    stdoutBytes: number
    stderrBytes: number
    outputTruncated: boolean
    exitCode: number
    timedOut: boolean
    wallTimeSeconds: number
    startedAt: string
    finishedAt: string
  }>((resolve) => {
    const started = Date.now()
    const startedAt = new Date(started).toISOString()
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let stdoutBytes = 0
    let stderrBytes = 0
    let stdoutTruncated = false
    let stderrTruncated = false
    let settled = false
    let killedForTimeout = false
    const append = (current: string, chunk: Buffer | string) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)
      const next = `${current}${text}`
      if (next.length <= EXPERIMENT_TERMINAL_TRACE_EXCERPT_LIMIT) return { value: next, truncated: false }
      return { value: next.slice(-EXPERIMENT_TERMINAL_TRACE_EXCERPT_LIMIT), truncated: true }
    }
    const timer = setTimeout(() => {
      if (settled) return
      killedForTimeout = true
      child.kill()
    }, timeoutMs)
    child.stdout?.on("data", (chunk) => {
      stdoutBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk), "utf8")
      const next = append(stdout, chunk)
      stdout = next.value
      stdoutTruncated = stdoutTruncated || next.truncated
    })
    child.stderr?.on("data", (chunk) => {
      stderrBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk), "utf8")
      const next = append(stderr, chunk)
      stderr = next.value
      stderrTruncated = stderrTruncated || next.truncated
    })
    child.on("close", (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const wallTimeSeconds = Math.max(0, (Date.now() - started) / 1000)
      const timedOut = killedForTimeout
      resolve({
        stdout,
        stderr,
        stdoutBytes,
        stderrBytes,
        outputTruncated: stdoutTruncated || stderrTruncated,
        exitCode: timedOut ? 124 : code ?? 1,
        timedOut,
        wallTimeSeconds,
        startedAt,
        finishedAt: new Date().toISOString(),
      })
    })
    child.on("error", (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const errorText = error instanceof Error ? error.message : String(error)
      const next = append(stderr, `\n${errorText}`)
      stderr = next.value.trim()
      stderrBytes += Buffer.byteLength(errorText, "utf8")
      stderrTruncated = stderrTruncated || next.truncated
      resolve({
        stdout,
        stderr,
        stdoutBytes,
        stderrBytes,
        outputTruncated: stdoutTruncated || stderrTruncated,
        exitCode: 127,
        timedOut: false,
        wallTimeSeconds: Math.max(0, (Date.now() - started) / 1000),
        startedAt,
        finishedAt: new Date().toISOString(),
      })
    })
  })
}

async function markdownArtifactForPreview(
  runDir: string,
  snapshot: PaperRunSnapshot,
): Promise<PreviewArtifactRef> {
  const latest = snapshot.drafts.at(-1)
  const content = latest
    ? await readFile(resolveRunFile(runDir, latest.path), "utf8").catch(() => undefined)
    : undefined
  return {
    kind: "markdown",
    path: latest?.path,
    mime_type: "text/markdown",
    content: content ?? "尚未生成草稿。\n\n实时预览会在 drafting stage 写入真实 DraftPaper artifact 后自动刷新。",
    updated_at: snapshot.updated_at,
  }
}

function previewAnnotations(snapshot: PaperRunSnapshot): PreviewAnnotation[] {
  const claimAnnotations = snapshot.claim_ledger.map((claim): PreviewAnnotation => ({
    id: `claim:${claim.claim_id}`,
    kind: "claim",
    severity: claim.status === "supported" ? "info" : "blocker",
    message: `${claim.claim_id}: ${claim.text}`,
    source: {
      label: claim.source_ids.length > 0 ? claim.source_ids.join(", ") : claim.claim_id,
    },
    tui_ref: `claim-ledger:${claim.claim_id}`,
  }))
  const failedChecks = snapshot.export_state.failed_checks.map((check): PreviewAnnotation => ({
    id: `gate:${check}`,
    kind: "reviewer",
    severity: "blocker",
    message: check,
    source: { label: "final_gate" },
    tui_ref: `gate:${check}`,
  }))
  const guidance = snapshot.diagnostics.experiment_guidance
  const starterPack = snapshot.diagnostics.experiment_starter_pack
  const guidanceAnnotations =
    guidance?.status === "needs_protocol"
      ? guidance.suggestions.map(
          (item): PreviewAnnotation => ({
            id: `experiment-guidance:${item.gap}`,
            kind: "experiment",
            severity: item.severity === "blocking" ? "blocker" : "warning",
            message: `${item.gap}: ${item.next_action}`,
            source: { label: item.recommended_script },
            tui_ref: `experiment-guidance:${item.gap}`,
          }),
        )
      : []
  const starterPackAnnotations =
    starterPack?.status === "ready"
      ? [
          {
            id: "experiment-starter-pack",
            kind: "experiment" as const,
            severity: "warning" as const,
            message: starterPack.summary,
            source: { label: "experiments/experiment-protocol-starter-pack.json" },
            tui_ref: "experiment-starter-pack",
          },
        ]
      : []
  return [...claimAnnotations, ...failedChecks, ...guidanceAnnotations, ...starterPackAnnotations]
}

type PreviewEnvironmentTool = {
  id: string
  label: string
  status: string
  version?: string
  path?: string
  impact?: string
}

const PREVIEW_ENVIRONMENT_STATUS_LABELS: Record<string, string> = {
  available: "可用",
  optional_missing: "可选缺失",
  missing: "缺失",
  blocked: "阻断",
  unknown: "未知",
}

const PREVIEW_VIRTUALIZATION_TOOL_IDS = new Set(["docker", "wsl", "hyperv", "virtualbox", "vmware", "conda"])

function previewEnvironmentToolState(tool: PreviewEnvironmentTool) {
  return {
    id: tool.id,
    label: tool.label,
    status: tool.status,
    status_label: PREVIEW_ENVIRONMENT_STATUS_LABELS[tool.status] ?? tool.status,
    version: tool.version,
    path: tool.path,
    impact: tool.impact,
  }
}

function previewEnvironmentGroup(
  id: "gpu" | "runtime" | "compiler" | "virtualization",
  label: string,
  tools: PreviewEnvironmentTool[],
) {
  const sorted = [...tools].sort((left, right) => `${left.id}/${left.label}`.localeCompare(`${right.id}/${right.label}`))
  const mapped = sorted.map(previewEnvironmentToolState)
  const count = (status: string) => mapped.filter((tool) => tool.status === status).length
  const blocked = count("blocked")
  const missing = count("missing")
  const optionalMissing = count("optional_missing")
  const available = count("available")
  const status =
    blocked > 0
      ? "blocked"
      : missing > 0
        ? "missing"
        : optionalMissing > 0
          ? "optional_missing"
          : available > 0
            ? "available"
            : "unknown"
  return {
    id,
    label,
    status,
    status_label: PREVIEW_ENVIRONMENT_STATUS_LABELS[status] ?? status,
    available,
    optional_missing: optionalMissing,
    blocked,
    missing,
    tools: mapped,
  }
}

function previewLocator(input: {
  uri?: string
  path?: string
  line_start?: number
  line_end?: number
  page?: number
  selector?: string
}) {
  const base = input.uri ?? input.path ?? input.selector ?? "local"
  const line =
    input.line_start === undefined
      ? ""
      : input.line_end === undefined || input.line_end === input.line_start
        ? `:${input.line_start}`
        : `:${input.line_start}-${input.line_end}`
  const page = input.page === undefined ? "" : `#page=${input.page}`
  return `${base}${line}${page}`
}

function createPreviewMonitor(snapshot: PaperRunSnapshot): PreviewMonitorSummary {
  const noveltyStatus =
    snapshot.novelty.experiment_gate?.status ??
    snapshot.novelty.checkpoints.at(-1)?.status ??
    "not_started"
  const gateRecord = jsonRecord(snapshot.diagnostics.final_gate)
  const guidance = snapshot.diagnostics.experiment_guidance
  const starterPack = snapshot.diagnostics.experiment_starter_pack
  const experimentRuns = [
    ...(snapshot.diagnostics.experiment_runs?.host_runs ?? []),
    ...(snapshot.diagnostics.experiment_runs?.container_runs ?? []),
  ]
  const experimentTerminalTraces = snapshot.diagnostics.experiment_terminal_traces ?? []
  const machine = snapshot.diagnostics.machine_profile
  const experimentEnvironment = snapshot.diagnostics.experiment_environment
  const costRecord = jsonRecord(snapshot.diagnostics.cost)
  const costBudget = jsonRecord(costRecord.budget)
  const costAlerts = Array.isArray(costRecord.alerts) ? costRecord.alerts.map(jsonRecord) : []
  const teamTasks = snapshot.agent_team.tasks ?? []
  const teamMembers = snapshot.agent_team.members ?? []
  const unreadMessages = (snapshot.agent_team.mailbox ?? []).filter((message) => message.read_by.length === 0).length
  const runtimeTools = machine.runtimes.filter((item) => !PREVIEW_VIRTUALIZATION_TOOL_IDS.has(item.id))
  const virtualizationTools = machine.runtimes.filter((item) => PREVIEW_VIRTUALIZATION_TOOL_IDS.has(item.id))
  const gpuTools: PreviewEnvironmentTool[] = [
    {
      id: machine.gpu.cuda.id,
      label: machine.gpu.cuda.label,
      status: machine.gpu.cuda.status,
      version: machine.gpu.cuda.version,
      path: machine.gpu.cuda.path,
      impact: machine.gpu.cuda.impact,
    },
    {
      id: machine.gpu.rocm.id,
      label: machine.gpu.rocm.label,
      status: machine.gpu.rocm.status,
      version: machine.gpu.rocm.version,
      path: machine.gpu.rocm.path,
      impact: machine.gpu.rocm.impact,
    },
  ]
  const toolPreview = (items: Array<{ id: string; label: string; status: string; version?: string; path?: string }>) =>
    items.map((item) => ({
      id: item.id,
      label: item.label,
      status: item.status,
      version: item.version,
      path: item.path,
    }))
  return {
    stage_graph: snapshot.stage_graph.stages.map((stage) => ({
      id: stage.id,
      label: stage.title,
      status: stage.status,
      summary: stage.summary,
    })),
    novelty: {
      status: noveltyStatus,
      checkpoints: snapshot.novelty.checkpoints.map((checkpoint) => ({
        id: checkpoint.checkpoint_id,
        stage: checkpoint.stage,
        status: checkpoint.status,
        conflicts: checkpoint.conflicts.length,
        summary: checkpoint.decision.summary,
      })),
      experiment_gate: snapshot.novelty.experiment_gate
        ? {
            status: snapshot.novelty.experiment_gate.status,
            reason: snapshot.novelty.experiment_gate.reason,
            allowed: snapshot.novelty.experiment_gate.allowed_to_run_expensive_experiments,
          }
        : undefined,
    },
    paper_spine: snapshot.paper_spine
      ? {
          readiness: snapshot.paper_spine.readiness,
          central_claim: snapshot.paper_spine.central_claim,
          motivation_chain: snapshot.paper_spine.motivation_chain,
          contribution_chain: snapshot.paper_spine.contribution_chain,
        }
      : undefined,
    global_figure: snapshot.global_figure
      ? {
          status: snapshot.global_figure.status,
          title: snapshot.global_figure.title,
          panels: snapshot.global_figure.panels.map((panel) => ({
            id: panel.panel_id,
            title: panel.title,
            purpose: panel.purpose,
            evidence_refs: panel.evidence_refs.length,
          })),
          checks: snapshot.global_figure.checks.map((check) => ({
            id: check.check_id,
            status: check.status,
            message: check.message,
          })),
        }
      : undefined,
    ledger: {
      sources: snapshot.source_ledger.map((source) => ({
        source_id: source.source_id,
        kind: source.kind,
        title: source.title,
        locator: previewLocator(source.locator),
        created_at: source.created_at,
      })),
      claims: snapshot.claim_ledger.map((claim) => ({
        claim_id: claim.claim_id,
        status: claim.status,
        confidence: claim.confidence,
        text: claim.text,
        source_ids: claim.source_ids,
        artifact_ids: claim.artifact_ids,
        created_at: claim.created_at,
      })),
    },
    cost_agent: {
      costs: {
        llm_usd: numberValue(costRecord.llm_usd),
        api_usd: numberValue(costRecord.api_usd),
        total_usd: numberValue(costRecord.total_usd),
        budget_total_usd: typeof costBudget.total_soft_usd === "number" ? costBudget.total_soft_usd : undefined,
        alerts: costAlerts.map((alert) => ({
          id: typeof alert.id === "string" ? alert.id : "alert",
          category: typeof alert.category === "string" ? alert.category : "total",
          threshold_usd: numberValue(alert.threshold_usd),
          observed_usd: numberValue(alert.observed_usd),
        })),
      },
      tokens: {
        input_tokens: snapshot.diagnostics.token_usage.input_tokens,
        output_tokens: snapshot.diagnostics.token_usage.output_tokens,
        total_tokens: snapshot.diagnostics.token_usage.total_tokens,
        estimated: snapshot.diagnostics.token_usage.estimated,
      },
      agent_tree: {
        total_agents: snapshot.agent_tree.nodes.length,
        active_agents: snapshot.agent_tree.nodes.filter((agent) => agent.status === "running" || agent.status === "planned").length,
        blocked_agents: snapshot.agent_tree.nodes.filter((agent) => agent.status === "blocked" || agent.status === "failed").length,
        max_depth: snapshot.agent_tree.nodes.reduce((max, agent) => Math.max(max, agent.depth), 0),
        max_parallel: snapshot.agent_tree.max_parallel,
        recent: snapshot.agent_tree.nodes.slice(-12).map((agent) => ({
          agent_id: agent.agent_id,
          role: agent.role,
          status: agent.status,
          model: `${agent.provider_id}/${agent.model_id}`,
          depth: agent.depth,
        })),
      },
      agent_team: {
        members: teamMembers.length,
        active_members: teamMembers.filter((member) => member.status === "active" || member.status === "planned").length,
        queued_tasks: teamTasks.filter((task) => task.status === "queued").length,
        active_tasks: teamTasks.filter((task) => task.status === "assigned" || task.status === "running").length,
        completed_tasks: teamTasks.filter((task) => task.status === "completed").length,
        blocked_tasks: teamTasks.filter((task) => task.status === "blocked").length,
        unread_messages: unreadMessages,
        recent_tasks: teamTasks.slice(-8).map((task) => ({
          task_id: task.task_id,
          title: task.title,
          status: task.status,
        })),
      },
    },
    model_routing: (snapshot.diagnostics.model_routing ?? []).slice(-24).map((decision) => ({
      decision_id: decision.decision_id,
      created_at: decision.created_at,
      role: decision.role,
      stage: decision.stage,
      source: decision.source,
      decision_model: decision.decision_model,
      selected_model: decision.selected_model,
      provider_id: decision.provider_id,
      model_id: decision.model_id,
      candidate_count: decision.candidate_count,
      allowed_model_count: decision.allowed_models.length,
      reason: decision.reason,
      diagnostics: decision.diagnostics,
    })),
    experiment_guidance:
      guidance?.status === "needs_protocol"
        ? {
            status: guidance.status,
            summary: guidance.summary,
            final_export_blocked: guidance.final_export_blocked,
            gaps: guidance.gaps,
            suggestions: guidance.suggestions.map((item) => ({
              gap: item.gap,
              severity: item.severity,
              recommended_script: item.recommended_script,
              next_action: item.next_action,
            })),
          }
        : undefined,
    experiment_starter_pack:
      starterPack?.status === "ready"
        ? {
            status: starterPack.status,
            summary: starterPack.summary,
            package_json_scripts: starterPack.package_json_scripts,
            files: starterPack.files.map((file) => ({
              path: file.path,
              purpose: file.purpose,
              artifact_id: file.artifact_id,
              artifact_path: file.artifact_path,
              mime_type: file.mime_type,
            })),
            next_steps: starterPack.next_steps,
            apply_endpoint: `/paper/runs/${encodeURIComponent(snapshot.run_id)}/experiment-starter/apply`,
            recommended_payload: {
              dry_run: false,
              overwrite: false,
              update_package_json: true,
            },
          }
        : undefined,
    experiment_runs: experimentRuns.map((run) => ({
      run_id: run.experiment_run_id,
      experiment_id: run.experiment_id,
      role: run.role,
      environment: run.environment.mode,
      status: run.status,
      command: run.command.argv.length === 1 ? run.command.argv[0] : run.command.argv.join(" "),
      exit_code: run.exit_code,
      wall_time_seconds: run.resource_usage.wall_time_seconds,
      metrics: run.metrics.map((metric) => ({
        name: metric.name,
        value: metric.value,
        unit: metric.unit,
      })),
      stdout_excerpt: run.stdout ? run.stdout.slice(0, 400) : undefined,
      stderr_excerpt: run.stderr ? run.stderr.slice(0, 400) : undefined,
    })),
    experiment_terminal_traces: experimentTerminalTraces.map((trace) => ({
      trace_id: trace.trace_id,
      artifact_id: trace.artifact_id,
      experiment_id: trace.experiment_id,
      role: trace.role,
      environment: trace.environment,
      command: trace.command,
      cwd: trace.cwd,
      status: trace.status,
      exit_code: trace.exit_code,
      wall_time_seconds: trace.wall_time_seconds,
      timed_out: trace.timed_out,
      stdout_bytes: trace.stdout_bytes,
      stderr_bytes: trace.stderr_bytes,
      output_truncated: trace.output_truncated,
      stdout_excerpt: trace.stdout_excerpt ? trace.stdout_excerpt.slice(0, 400) : undefined,
      stderr_excerpt: trace.stderr_excerpt ? trace.stderr_excerpt.slice(0, 400) : undefined,
    })),
    machine_environment: {
      status: experimentEnvironment.status,
      workspace: machine.workspace,
      default_run_root: machine.default_run_root,
      os: `${machine.os.platform} ${machine.os.release} ${machine.os.arch}`,
      cpu: `${machine.cpu.model} / ${machine.cpu.cores} cores`,
      memory: {
        total_bytes: machine.memory.total_bytes,
        free_bytes: machine.memory.free_bytes,
      },
      disk: machine.disk
        ? {
            path: machine.disk.path,
            total_bytes: machine.disk.total_bytes,
            free_bytes: machine.disk.free_bytes,
          }
        : undefined,
      gpu: {
        mode: machine.gpu.mode,
        devices: machine.gpu.devices.map((device) => ({
          vendor: device.vendor,
          name: device.name,
          memory_mb: device.memory_mb,
          driver: device.driver,
          status: device.status,
        })),
        cuda_status: machine.gpu.cuda.status,
        rocm_status: machine.gpu.rocm.status,
      },
      runtimes: toolPreview(machine.runtimes),
      compilers: toolPreview(machine.compilers),
      optional_missing: experimentEnvironment.optional_missing.length,
      blocked: experimentEnvironment.blocked.length,
      notes: experimentEnvironment.notes,
    },
    experiment_environment: {
      status: experimentEnvironment.status,
      status_label: PREVIEW_ENVIRONMENT_STATUS_LABELS[experimentEnvironment.status] ?? experimentEnvironment.status,
      workspace: machine.workspace,
      default_run_root: machine.default_run_root,
      os: `${machine.os.platform} ${machine.os.release} ${machine.os.arch}`,
      cpu: `${machine.cpu.model} / ${machine.cpu.cores} cores`,
      memory: {
        total_bytes: machine.memory.total_bytes,
        free_bytes: machine.memory.free_bytes,
      },
      disk: machine.disk
        ? {
            path: machine.disk.path,
            total_bytes: machine.disk.total_bytes,
            free_bytes: machine.disk.free_bytes,
          }
        : undefined,
      gpu_mode: machine.gpu.mode,
      notes: experimentEnvironment.notes,
      groups: [
        previewEnvironmentGroup("gpu", "GPU", gpuTools),
        previewEnvironmentGroup("runtime", "运行时", runtimeTools),
        previewEnvironmentGroup("compiler", "编译器", machine.compilers),
        previewEnvironmentGroup("virtualization", "容器 / 虚拟化", virtualizationTools),
      ],
    },
    gate: {
      status: typeof gateRecord.status === "string" ? gateRecord.status : "not_started",
      failed_checks: snapshot.export_state.failed_checks,
    },
    timeline: snapshot.events.slice(-24).map((event) => ({
      type: event.type,
      label: event.type.replace(/^paperorchestrator\./, ""),
      at: event.created_at,
      detail: typeof event.payload.stage === "string" ? event.payload.stage : undefined,
    })),
  }
}

async function createPaperRunLivePreviewSnapshot(
  runDir: string,
  snapshot: PaperRunSnapshot,
): Promise<PreviewSnapshot> {
  const markdown = await markdownArtifactForPreview(runDir, snapshot)
  const artifacts: PreviewSnapshot["artifacts"] = { markdown }
  for (const file of snapshot.export_state.files ?? []) {
    const kind = previewArtifactKind(file.format)
    if (!kind) continue
    artifacts[kind] = {
      kind,
      path: file.path,
      mime_type: file.mime_type ?? previewMimeType(kind),
      updated_at: snapshot.updated_at,
    }
  }
  const cost = jsonRecord(snapshot.diagnostics.cost)
  return {
    schema_version: "preview.v1",
    run_id: snapshot.run_id,
    title: snapshot.topic,
    readonly: true,
    updated_at: snapshot.updated_at,
    artifacts,
    annotations: previewAnnotations(snapshot),
    diagnostics: {
      tools: Object.fromEntries(
        snapshot.diagnostics.tool_traces.slice(-12).map((trace) => [
          trace.tool_name,
          {
            status: trace.status,
            message: trace.error,
          },
        ]),
      ),
      costs: {
        llm_usd: numberValue(cost.llm_usd),
        api_usd: numberValue(cost.api_usd),
        total_usd: numberValue(cost.total_usd),
      },
      agents: snapshot.agent_tree.nodes.slice(-12).map((agent) => ({
        name: agent.agent_id,
        status: agent.status,
        detail: `${agent.role} ${agent.provider_id}/${agent.model_id}`,
      })),
    },
    monitor: createPreviewMonitor(snapshot),
    render: {
      state: "ready",
      stage: "paperrun",
      message: "PaperRun live preview ready",
      updated_at: snapshot.updated_at,
    },
  }
}

function startOrReplaceLivePreview(runID: string, snapshot: PreviewSnapshot) {
  const existing = livePreviewServers.get(runID)
  existing?.handle.stop()
  const handle = startPreviewServer({ snapshot })
  livePreviewServers.set(runID, { handle, updated_at: snapshot.updated_at })
  return handle
}

export function stopPaperRunLivePreview(runID: string) {
  const existing = livePreviewServers.get(runID)
  if (!existing) return false
  existing.handle.stop()
  livePreviewServers.delete(runID)
  return true
}

export function stopAllPaperRunLivePreviews() {
  for (const runID of [...livePreviewServers.keys()]) stopPaperRunLivePreview(runID)
}

function intakeFromRun(run: Awaited<ReturnType<typeof loadResearchRun>>): ResearchBrief {
  const metadata = jsonRecord(run.metadata)
  const intake = jsonRecord(metadata.paper_intake)
  return normalizeResearchIntake({
    topic: run.topic,
    workspace_path: run.workspace,
    code_paths: metadataStringArray(intake.code_paths),
    paper_files: metadataStringArray(intake.paper_files),
    dataset_paths: metadataStringArray(intake.dataset_paths),
    experiment_logs: metadataStringArray(intake.experiment_logs),
    target_profile: metadataString(intake.target_profile) as ResearchIntakeRequest["target_profile"],
    target_journal: metadataString(intake.target_journal),
    target_journal_url: metadataString(intake.target_journal_url),
    language: metadataString(intake.language),
    model_roles: jsonRecord(intake.model_roles) as ResearchIntakeRequest["model_roles"],
  })
}

export async function findPaperRunDir(runID: string, options?: PaperRunRuntimeOptions) {
  const normalized = runOptions(options)
  const dirs = await discoverRunDirs(normalized)
  for (const runDir of dirs) {
    const run = await loadResearchRun(runDir).catch(() => undefined)
    if (run?.run_id === runID) return runDir
  }
  throw new PaperRunNotFoundError(runID)
}

export async function getPaperRunSnapshot(runID: string, options?: PaperRunRuntimeOptions): Promise<PaperRunSnapshot> {
  const runDir = await findPaperRunDir(runID, options)
  return getPaperRunSnapshotFromDir(runDir)
}

export interface PaperRunHistoryListOptions extends PaperRunRuntimeOptions {
  query?: string
  status?: PaperRunSnapshot["status"]
  workspace_filter?: string
  limit?: number
}

export async function listPaperRuns(options?: PaperRunHistoryListOptions): Promise<PaperRunHistoryEntry[]> {
  const normalized = runOptions(options)
  const dirs = await discoverRunDirs(normalized)
  const query = options?.query?.trim().toLowerCase()
  const workspaceFilter = options?.workspace_filter ? path.resolve(options.workspace_filter).toLowerCase() : undefined
  const entries = await Promise.all(
    dirs.map(async (runDir) => {
      const snapshot = await getPaperRunSnapshotFromDir(runDir).catch(() => undefined)
      if (!snapshot) return undefined
      const run = await loadResearchRun(runDir).catch(() => undefined)
      const runtime = jsonRecord(run?.metadata?.runtime)
      const storageScope = metadataStorageScope(runtime.storage_scope) ?? "home"
      return {
        schema_version: "PaperRunHistoryEntry.v1" as const,
        run_id: snapshot.run_id,
        topic: snapshot.topic,
        workspace: snapshot.workspace,
        status: snapshot.status,
        storage_scope: storageScope,
        run_dir: runDir,
        runtime_root: path.dirname(runDir),
        created_at: snapshot.created_at,
        updated_at: snapshot.updated_at,
      }
    }),
  )
  return entries
    .filter((entry): entry is PaperRunHistoryEntry => {
      if (!entry) return false
      if (options?.status && entry.status !== options.status) return false
      if (workspaceFilter && path.resolve(entry.workspace).toLowerCase() !== workspaceFilter) return false
      if (!query) return true
      return (
        entry.run_id.toLowerCase().includes(query) ||
        entry.topic.toLowerCase().includes(query) ||
        entry.workspace.toLowerCase().includes(query) ||
        entry.status.toLowerCase().includes(query)
      )
    })
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
    .slice(0, options?.limit ?? 100)
}

export async function resumePaperRun(
  request: PaperRunResumeRequest | string,
  options?: PaperRunRuntimeOptions,
): Promise<PaperRunSnapshot> {
  const runID = typeof request === "string" ? request : request.run_id
  const runDir = await findPaperRunDir(runID, options)
  await resumeResearchRun(runDir, options)
  return getPaperRunSnapshotFromDir(runDir)
}

export async function getPaperRunSnapshotFromDir(runDir: string): Promise<PaperRunSnapshot> {
  const [status, events, artifacts, sources, toolTraces, claims, drafts, reviews, exports] = await Promise.all([
    getResearchRunStatus(runDir),
    readJsonlFacts(runDir, "event"),
    readJsonlFacts(runDir, "artifact"),
    readJsonlFacts(runDir, "source"),
    readJsonlFacts(runDir, "tool_trace"),
    readJsonlFacts(runDir, "claim"),
    readJsonlFacts(runDir, "draft"),
    readJsonlFacts(runDir, "review"),
    readJsonlFacts(runDir, "export"),
  ])
  const metadata = jsonRecord(status.run.metadata)
  const runtimeMetadata = jsonRecord(metadata.runtime)
  const runtimeRoot = path.dirname(metadataString(runtimeMetadata.run_dir) ?? runDir)
  const inferredHome = runtimeRoot.endsWith(path.join(".paper_fucker", "runs"))
    ? path.dirname(path.dirname(runtimeRoot))
    : undefined
  const budgetTier = normalizeBudgetTier(metadataBudgetTier(metadata.paper_budget_tier))
  const qualityMode = normalizeQualityMode(metadataQualityMode(metadata.paper_quality_mode), budgetTier)
  const dataEgressPolicy = defaultDataEgressPolicy(
    jsonRecord(metadata.paper_data_egress_policy) as Partial<DataEgressPolicy>,
  )
  const intake = intakeFromRun(status.run)
  const roles = metadataModelRoles(metadata.paper_model_roles) ?? modelRoleMap(intake.model_roles)
  const modelRouting = metadataRoutingDecisions(metadata.paper_model_routing)
  const modelInventory = jsonRecord(metadata.paper_model_inventory)
  const capabilities = defaultResearchCapabilities()
  const gate = finalGateStatus(status.state.final_gate)
  const stages = PAPER_RESEARCH_STAGE_GRAPH.stages.map((stage) => stageStatusFromEvents(stage, events, status.state.final_gate))
  const pauseQuestions: PaperRunPauseQuestion[] =
    gate === "blocked"
      ? [
          {
            question_id: `${status.run.run_id}:final_gate`,
            reason: "authenticity_gate_blocked",
            message: "真实性 gate 阻断最终导出，需要补充证据或选择 forced draft。",
            required: true,
            created_at: status.run.updated_at,
          },
        ]
      : []
  for (const decision of modelRouting.filter((item) => item.source === "blocked")) {
    pauseQuestions.push({
      question_id: `${status.run.run_id}:model:${decision.role}`,
      reason: "model_routing_blocked",
      message: decision.reason,
      required: true,
      created_at: decision.created_at,
    })
  }

  const agentTree = defaultAgentTree({
    runID: status.run.run_id,
    tier: budgetTier,
    capabilities,
    writer: roles.writer,
  })
  const memoryBank = createPaperMemoryBank({ run_id: status.run.run_id })
  const codeGraph = createCodeUnderstandingGraph({ run_id: status.run.run_id, workspace: status.run.workspace })
  const intakeMetadata = jsonRecord(metadata.paper_intake)
  for (const path of metadataStringArray(intakeMetadata.code_paths)) {
    addCodeFile(codeGraph, { path })
  }
  const machine = await inspectPaperMachineProfile({ workspace: status.run.workspace, home: inferredHome })
  const [
    noveltyCheckpoints,
    experimentNoveltyGate,
    researchWiki,
    paperSpine,
    globalFigure,
    experimentGuidance,
    experimentStarterPack,
    experimentRunGroups,
    experimentTerminalTraces,
    latestFinalExportBundle,
  ] = await Promise.all([
    readArtifactsBySchema<NoveltyCheckpoint>(runDir, artifacts, "NoveltyCheckpoint.v1"),
    readLatestArtifactBySchema<ExperimentNoveltyGate>(runDir, artifacts, "ExperimentNoveltyGate.v1"),
    readLatestArtifactBySchema<ResearchWikiDigest>(runDir, artifacts, "ResearchWikiDigest.v1"),
    readLatestArtifactBySchema<PaperSpine>(runDir, artifacts, "PaperSpine.v1"),
    readLatestArtifactBySchema<GlobalFigureSpec>(runDir, artifacts, "GlobalFigureSpec.v1"),
    readLatestArtifactBySchema<ExperimentProtocolGuidance>(runDir, artifacts, "ExperimentProtocolGuidance.v1"),
    readLatestArtifactBySchema<ExperimentProtocolStarterPack>(runDir, artifacts, "ExperimentProtocolStarterPack.v1"),
    readArtifactsBySchema<ExperimentRun[]>(runDir, artifacts, "ExperimentRun.v1[]"),
    readArtifactsBySchema<PaperExperimentTerminalTraceArtifact>(runDir, artifacts, "ExperimentTerminalTrace.v1"),
    readLatestFinalExportBundle(runDir, artifacts),
  ])
  const experimentRuns = experimentRunGroups.flat()
  const snapshot = {
    schema_version: "PaperRun.v1",
    run_id: status.run.run_id,
    topic: status.run.topic,
    workspace: status.run.workspace,
    status: paperRunStatus({ researchStatus: status.run.status, stages, finalGate: status.state.final_gate }),
    created_at: status.run.created_at,
    updated_at: status.run.updated_at,
    intake,
    budget_tier: budgetTier,
    quality_mode: qualityMode,
    data_egress_policy: dataEgressPolicy,
    stage_graph: {
      schema_version: PAPER_RESEARCH_STAGE_GRAPH.schema_version,
      stages,
    },
    events: events.map((event) => ({
      event_id: event.event_id,
      run_id: event.run_id,
      type: event.type,
      created_at: event.created_at,
      actor: event.actor,
      payload: event.payload,
    })),
    source_ledger: sources,
    claim_ledger: claims,
    experiment_status: {
      planned: artifacts.some((artifact) => artifact.metadata?.artifact_schema === "ExperimentPlan.v1"),
      exploratory_runs: toolTraces.filter((trace) => trace.tool_name.includes("experiment")).length,
      reproduction_gate: reproductionGateStatus(status.state.final_gate, experimentRuns),
    },
    novelty: {
      checkpoints: noveltyCheckpoints,
      experiment_gate: experimentNoveltyGate,
    },
    research_wiki: researchWiki,
    paper_spine: paperSpine,
    global_figure: globalFigure,
    agent_tree: agentTree,
    agent_team: createPaperAgentTeam({
      run_id: status.run.run_id,
      tree: {
        run_id: status.run.run_id,
        root_agent_id: `${status.run.run_id}:root`,
        nodes: agentTree.nodes,
      },
      skills: ["nature-paper", "citation-check", "paper-export"],
      mcp_servers: capabilities.filter((capability) => capability.type === "mcp").map((capability) => capability.name),
      memory_scope: "local",
    }),
    memory_bank: memoryBank,
    code_understanding: codeGraph,
    diagnostics: {
      counts: status.counts,
      model_roles: roles,
      model_inventory:
        modelInventory.schema_version === "PaperModelInventory.v1"
          ? {
              schema_version: "PaperModelInventory.v1",
              decision_model: metadataString(modelInventory.decision_model),
              backup_decision_model: metadataString(modelInventory.backup_decision_model),
              allowlist: metadataStringArray(modelInventory.allowlist),
              role_overrides: jsonRecord(modelInventory.role_overrides) as PaperModelInventory["role_overrides"],
              provider_registrations: jsonRecord(modelInventory.provider_registrations) as PaperModelInventory["provider_registrations"],
              stage_model_policies: jsonRecord(modelInventory.stage_model_policies) as PaperModelInventory["stage_model_policies"],
              candidates: Array.isArray(modelInventory.candidates) ? (modelInventory.candidates as PaperModelInventory["candidates"]) : [],
              updated_at: metadataString(modelInventory.updated_at) ?? status.run.updated_at,
            }
          : undefined,
      model_routing: modelRouting,
      cost: status.state.cost,
      runtime_root: runtimeRoot,
      machine_profile: machine.profile,
      experiment_environment: machine.environment,
      token_usage: tokenUsageFromCost(status.state.cost),
      final_gate: status.state.final_gate,
      tool_traces: toolTraces,
      audit: paperObservabilityAuditFromEvents(events),
      memory: memoryBankSummary(memoryBank),
      code_understanding: codeUnderstandingSummary(codeGraph),
      crawler: crawlerDiagnostics({ sources }),
      huggingface: hfLoopDiagnostics({ sources }),
      experiment_guidance: experimentGuidance,
      experiment_starter_pack: experimentStarterPack,
      experiment_runs:
        experimentRuns.length > 0
          ? {
              host_runs: experimentRuns.filter((run) => run.environment.mode === "host"),
              container_runs: experimentRuns.filter((run) => run.environment.mode === "container"),
            }
          : undefined,
      experiment_terminal_traces: experimentTerminalTraces.length > 0 ? experimentTerminalTraces : undefined,
    },
    artifacts,
    drafts,
    reviews,
    exports,
    pause_questions: pauseQuestions,
    preview_state: {
      readonly: true,
      status: "ready",
      run_id: status.run.run_id,
    },
    export_state: exportState({ runID: status.run.run_id, state: status.state, exports, finalBundle: latestFinalExportBundle }),
    internal_sessions: metadataStringArray(metadata.internal_sessions),
  } satisfies Omit<PaperRunSnapshot, "controller_state">

  return {
    ...snapshot,
    controller_state: await loadPaperRunControllerState(runDir).catch(() => derivePaperRunControllerState(snapshot)),
  }
}

export async function createPaperRun(
  request: PaperRunCreateRequest,
  options?: PaperRunRuntimeOptions,
): Promise<PaperRun> {
  const normalized = runOptions(options)
  const brief = normalizeResearchIntake(request)
  const budgetTier = normalizeBudgetTier(request.budget_tier)
  const qualityMode = normalizeQualityMode(request.quality_mode, budgetTier)
  const storageScope = request.storage_scope ?? "home"
  const dataEgressPolicy = defaultDataEgressPolicy(request.data_egress_policy)
  const workspace = request.workspace_path ?? normalized.workspace
  const executionRequest: ResearchIntakeRequest = {
    ...request,
    workspace_path: workspace,
  }
  const modelInventory = await loadPaperModelInventory({ home: normalized.home })
  const runModelInventory: PaperModelInventory = modelInventory
  const modelRouting = PAPER_MODEL_ROLES.map((role) =>
    routePaperModel(runModelInventory, {
      role,
      budget_tier: budgetTier,
      forced_model: request.model_roles?.[role],
    }),
  )
  const routedRoles = modelRolesFromRouting(modelRouting)
  const handle = await createResearchRun(
    {
      topic: brief.topic,
      workspace,
      storage_scope: storageScope,
      metadata: {
        paper_run: true,
        paper_intake: {
          code_paths: request.code_paths ?? [],
          paper_files: request.paper_files ?? [],
          dataset_paths: request.dataset_paths ?? [],
          experiment_logs: request.experiment_logs ?? [],
          target_profile: request.target_profile,
          target_journal: request.target_journal,
          target_journal_url: request.target_journal_url,
          language: request.language,
          model_roles: request.model_roles ?? {},
        },
        paper_model_inventory: {
          schema_version: runModelInventory.schema_version,
          decision_model: runModelInventory.decision_model,
          allowlist: runModelInventory.allowlist,
          role_overrides: runModelInventory.role_overrides,
          candidates: runModelInventory.candidates,
          updated_at: runModelInventory.updated_at,
        },
        paper_model_roles: routedRoles,
        paper_model_routing: modelRouting,
        paper_budget_tier: budgetTier,
        paper_quality_mode: qualityMode,
        paper_storage_scope: storageScope,
        paper_data_egress_policy: dataEgressPolicy,
        internal_sessions: [],
      },
    },
    normalized,
  )
  await appendResearchEvent(
    handle.run_dir,
    {
      type: "paper.run.created",
      actor: "system",
      payload: {
        budget_tier: budgetTier,
        quality_mode: qualityMode,
        storage_scope: storageScope,
        data_egress_policy: dataEgressPolicy,
      },
    },
    normalized,
  )
  for (const decision of modelRouting) {
    await appendResearchEvent(
      handle.run_dir,
      {
        type: "model.routing.decision",
        actor: "system",
        payload: decision as unknown as Record<string, unknown>,
      },
      normalized,
    )
  }
  const blockedModelRouting = modelRouting.filter((decision) => decision.source === "blocked")
  if (blockedModelRouting.length > 0) {
    await appendResearchEvent(
      handle.run_dir,
      {
        type: "paper.stage.blocked",
        actor: "system",
        payload: {
          stage: "planning",
          message: "未配置可用模型，PaperRun 已暂停。请先在 /models 中添加 provider、勾选允许模型并选择主决策模型。",
          diagnostics: blockedModelRouting.map((decision) => ({
            role: decision.role,
            reason: decision.reason,
            diagnostics: decision.diagnostics,
          })),
        },
      },
      normalized,
    )
  } else {
    await startPaperResearchRun(
      {
        run_dir: handle.run_dir,
        request: executionRequest,
      },
      normalized,
    )
  }
  await recordDefaultPaperRunObservability(
    handle.run_dir,
    {
      model_roles: routedRoles,
      capabilities: defaultResearchCapabilities(),
      data_egress_policy: dataEgressPolicy,
      data_egress_candidates: dataEgressCandidates(executionRequest),
      budget_tier: budgetTier,
      quality_mode: qualityMode,
    },
    normalized,
  )
  const projected = await getPaperRunSnapshotFromDir(handle.run_dir)
  const terminalStatus = researchTerminalStatus(projected)
  if (terminalStatus) await updateResearchRunStatus(handle.run_dir, terminalStatus, normalized)
  const snapshot = await getPaperRunSnapshotFromDir(handle.run_dir)
  const controller = await initializePaperRunControllerState(handle.run_dir, snapshot, normalized)
  const finalSnapshot = {
    ...(await getPaperRunSnapshotFromDir(handle.run_dir)),
    controller_state: controller,
  }
  await publishPaperRunSnapshot(finalSnapshot, handle.run_dir)
  return {
    run_id: handle.run.run_id,
    run_dir: handle.run_dir,
    snapshot: finalSnapshot,
  }
}

export async function subscribePaperRunEvents(runID: string, options?: PaperRunRuntimeOptions) {
  const snapshot = await getPaperRunSnapshot(runID, options)
  return [
    ...initialPaperRunLiveEvents(snapshot).map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`),
    controllerSseEvent(snapshot.controller_state),
  ].join("")
}

export async function recordPaperRunGuidance(
  runID: string,
  input: { message: string },
  options?: PaperRunRuntimeOptions,
): Promise<PaperRunGuidanceResponse> {
  const runDir = await findPaperRunDir(runID, options)
  const event = await appendResearchEvent(
    runDir,
    {
      type: "paper.guidance.received",
      actor: "user",
      payload: {
        message: input.message,
      },
    },
    options,
  )
  await enqueuePaperRunGuidance(runDir, { message: input.message, event_id: event.event_id }, options)
  await publishPaperRunSnapshot(await getPaperRunSnapshotFromDir(runDir), runDir)
  return {
    accepted: true,
    run_id: runID,
    event_id: event.event_id,
    message: "指导已记录，并会作为后续 stage/agent 的约束。",
  }
}

export async function controlPaperRun(
  runID: string,
  input: PaperRunControlInput,
  options?: PaperRunRuntimeOptions,
) {
  const runDir = await findPaperRunDir(runID, options)
  const state = await applyPaperRunControl(runDir, input, options)
  if (input.action === "cancel") await updateResearchRunStatus(runDir, "cancelled", options)
  await publishPaperRunSnapshot(await getPaperRunSnapshotFromDir(runDir), runDir)
  return state
}

export async function previewPaperRun(runID: string, options?: PaperRunRuntimeOptions): Promise<PaperRunPreviewResponse> {
  const runDir = await findPaperRunDir(runID, options)
  const snapshot = await getPaperRunSnapshotFromDir(runDir)
  const previewSnapshot = await createPaperRunLivePreviewSnapshot(runDir, snapshot)
  const livePreview = startOrReplaceLivePreview(runID, previewSnapshot)
  await publishPaperRunSnapshot(snapshot, runDir)
  return {
    readonly: true,
    run_id: runID,
    status: snapshot.preview_state.status,
    url: livePreview.url,
    token: livePreview.token,
    snapshot: previewSnapshot,
    drafts: snapshot.drafts,
    exports: snapshot.exports,
    export_state: snapshot.export_state,
    annotations: snapshot.claim_ledger.map((claim) => ({
      claim_id: claim.claim_id,
      source_ids: claim.source_ids,
      artifact_ids: claim.artifact_ids,
    })),
    diagnostics: snapshot.diagnostics,
  }
}

export async function applyPaperRunExperimentStarterPack(
  runID: string,
  input: PaperExperimentStarterApplyRequest = {},
  options?: PaperRunRuntimeOptions,
): Promise<PaperExperimentStarterApplyResult> {
  const normalized = runOptions(options)
  const runDir = await findPaperRunDir(runID, normalized)
  const snapshot = await getPaperRunSnapshotFromDir(runDir)
  const starterPack = snapshot.diagnostics.experiment_starter_pack
  const workspace = path.resolve(input.workspace_path ?? snapshot.workspace ?? normalized.workspace ?? process.cwd())
  const dryRun = input.dry_run !== false
  const overwrite = input.overwrite === true
  const updatePackageJson = input.update_package_json === true

  if (!starterPack || starterPack.status !== "ready") {
    return {
      schema_version: "PaperExperimentStarterApplyResult.v1",
      run_id: runID,
      status: "blocked",
      dry_run: dryRun,
      overwrite,
      workspace_path: workspace,
      files: [],
      written_count: 0,
      conflict_count: 0,
      skipped_count: 0,
      message: "当前 PaperRun 没有可写入的实验 starter pack。",
      action: "先运行代码类 PaperRun，并根据实验协议诊断生成 starter pack。",
    }
  }

  const selected = new Set((input.file_paths ?? []).filter(Boolean))
  const selectedFiles = selected.size > 0 ? starterPack.files.filter((file) => selected.has(file.path)) : starterPack.files
  const files: PaperExperimentStarterApplyFileResult[] = []
  for (const file of selectedFiles) {
    const target = resolveWorkspaceStarterTarget(workspace, file.path)
    const exists = await pathExists(target)
    if (exists && !overwrite) {
      files.push({
        path: file.path,
        target_path: target,
        artifact_id: file.artifact_id,
        artifact_path: file.artifact_path,
        status: "conflict",
        message: "目标文件已存在；默认不会覆盖。",
      })
      continue
    }
    if (dryRun) {
      files.push({
        path: file.path,
        target_path: target,
        artifact_id: file.artifact_id,
        artifact_path: file.artifact_path,
        status: exists ? "would_overwrite" : "would_write",
        message: exists ? "预检通过；启用 overwrite 后会覆盖该文件。" : "预检通过；执行时会写入该文件。",
      })
      continue
    }
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, file.content, { encoding: "utf8", flag: overwrite ? "w" : "wx" })
    files.push({
      path: file.path,
      target_path: target,
      artifact_id: file.artifact_id,
      artifact_path: file.artifact_path,
      status: exists ? "overwritten" : "written",
      message: exists ? "已按 overwrite=true 覆盖写入。" : "已写入工作区。",
    })
  }
  for (const requested of selected) {
    if (starterPack.files.some((file) => file.path === requested)) continue
    files.push({
      path: requested,
      target_path: path.resolve(workspace, requested.replace(/\\/g, "/")),
      status: "skipped",
      message: "该路径不属于当前 starter pack，已跳过。",
    })
  }
  if (updatePackageJson) {
    files.push(
      await applyStarterPackageJsonScripts({
        workspace,
        scripts: starterPack.package_json_scripts,
        dryRun,
        overwrite,
      }),
    )
  }

  const writtenCount = files.filter((file) => file.status === "written" || file.status === "overwritten").length
  const conflictCount = files.filter((file) => file.status === "conflict").length
  const skippedCount = files.filter((file) => file.status === "skipped").length
  const result: PaperExperimentStarterApplyResult = {
    schema_version: "PaperExperimentStarterApplyResult.v1",
    run_id: runID,
    status: conflictCount > 0 ? "blocked" : "ready",
    dry_run: dryRun,
    overwrite,
    workspace_path: workspace,
    files,
    written_count: writtenCount,
    conflict_count: conflictCount,
    skipped_count: skippedCount,
    message: dryRun
      ? "这是 dry-run 预检，没有写入工作区。"
      : writtenCount > 0
        ? `已写入 ${writtenCount} 个实验 starter 项。`
        : "没有文件被写入。",
    action:
      conflictCount > 0
        ? "检查冲突文件，或在确认后使用 overwrite=true。"
        : dryRun
          ? "确认目标路径后，用 dry_run=false 执行写入。"
          : "补全真实 baseline、ablation 和容器复现实验后重新运行 PaperRun。",
  }

  if (!dryRun && writtenCount > 0) {
    const audit = await writeResearchArtifact(
      runDir,
      {
        kind: "log",
        logical_path: "experiments/starter/apply-audit.json",
        data: result,
        metadata: {
          artifact_schema: "ExperimentProtocolStarterApplyResult.v1",
          workspace_path: workspace,
          written_count: writtenCount,
          conflict_count: conflictCount,
        },
      },
      normalized,
    )
    await appendResearchEvent(
      runDir,
      {
        type: "experiment.starterpack.applied",
        actor: "system",
        payload: {
          audit_artifact_id: audit.artifact_id,
          workspace_path: workspace,
          written_count: writtenCount,
          conflict_count: conflictCount,
        },
      },
      normalized,
    )
    result.audit_artifact_id = audit.artifact_id
    await publishPaperRunSnapshot(await getPaperRunSnapshotFromDir(runDir), runDir)
  }
  return result
}

export async function runPaperRunExperimentProtocol(
  runID: string,
  input: PaperExperimentProtocolRunRequest = {},
  options?: PaperRunRuntimeOptions,
): Promise<PaperExperimentProtocolRunResult> {
  const normalized = runOptions(options)
  const runDir = await findPaperRunDir(runID, normalized)
  const snapshot = await getPaperRunSnapshotFromDir(runDir)
  const plan = await readLatestArtifactBySchema<ExperimentPlan>(runDir, snapshot.artifacts, "ExperimentPlan.v1")
  const protocol = await readLatestArtifactBySchema<ExperimentProtocol>(runDir, snapshot.artifacts, "ExperimentProtocol.v1")
  const workspace = path.resolve(input.workspace_path ?? snapshot.workspace ?? normalized.workspace ?? process.cwd())
  const dryRun = input.dry_run !== false
  const timeoutSeconds = timeoutForProtocolRun(input)

  if (!plan) {
    return {
      schema_version: "PaperExperimentProtocolRunResult.v1",
      run_id: runID,
      status: "blocked",
      dry_run: dryRun,
      workspace_path: workspace,
      planned_commands: [],
      host_runs: [],
      container_runs: [],
      terminal_traces: [],
      artifact_ids: [],
      message: "当前 PaperRun 没有 ExperimentPlan，无法执行实验协议。",
      action: "先创建包含代码路径的 PaperRun，或补充实验协议后重新运行。",
    }
  }

  const workspaceProtocol = await experimentProtocolFromWorkspacePackageJson(workspace)
  const effectiveProtocol = shouldUseWorkspaceProtocol(protocol, workspaceProtocol) ? workspaceProtocol : protocol
  const effectivePlan = planForProtocolRerun({
    plan,
    protocol: effectiveProtocol,
    now: normalized.clock?.().toISOString(),
  })
  if (effectiveProtocol && effectiveProtocol === workspaceProtocol) {
    await writeResearchArtifact(
      runDir,
      {
        kind: "log",
        logical_path: "experiments/experiment-protocol-refreshed.json",
        data: effectiveProtocol,
        metadata: {
          artifact_schema: "ExperimentProtocol.v1",
          refreshed_from_workspace: true,
          workspace_path: workspace,
        },
      },
      normalized,
    )
    await appendResearchEvent(
      runDir,
      {
        type: "experiment.protocol.refreshed",
        actor: "system",
        payload: {
          workspace_path: workspace,
          entries: effectiveProtocol.entries.length,
          gaps: effectiveProtocol.gaps,
        },
      },
      normalized,
    )
  }

  const plannedCommands = plannedExperimentSpecs(effectivePlan).flatMap((spec) => {
    const hostCommand = commandForProtocolRun(spec, { mode: "host", platform: process.platform }, effectiveProtocol)
    const containerCommand = commandForProtocolRun(spec, { mode: "container", platform: "container" }, effectiveProtocol)
    return [
      {
        experiment_id: spec.experiment_id,
        role: spec.role,
        environment: "host" as const,
        command: experimentCommandText(hostCommand),
      },
      {
        experiment_id: spec.experiment_id,
        role: "container_reproduction" as const,
        environment: "container" as const,
        command: experimentCommandText(containerCommand),
      },
    ]
  })

  if (dryRun) {
    return {
      schema_version: "PaperExperimentProtocolRunResult.v1",
      run_id: runID,
      status: "ready",
      dry_run: true,
      workspace_path: workspace,
      planned_commands: plannedCommands,
      host_runs: [],
      container_runs: [],
      terminal_traces: [],
      artifact_ids: [],
      message: "这是实验协议 dry-run，没有执行命令。",
      action: "确认命令和工作目录后，用 dry_run=false 执行。",
    }
  }

  const terminalTraces: PaperExperimentTerminalTraceSummary[] = []
  let terminalTraceIndex = 0
  const runner: ExperimentRunner = async (spec, environment) => {
    const command = commandForProtocolRun(spec, environment, effectiveProtocol)
    const shellCommand = experimentCommandText(command)
    const traceID = `terminal-trace-${++terminalTraceIndex}`
    const timeoutMs = (command.timeout_seconds ?? timeoutSeconds) * 1000
    await appendResearchEvent(
      runDir,
      {
        type: "experiment.command.started",
        actor: "system",
        payload: {
          trace_id: traceID,
          experiment_id: spec.experiment_id,
          role: spec.role,
          environment: environment.mode,
          command: shellCommand,
          cwd: workspace,
          timeout_seconds: Math.round(timeoutMs / 1000),
        },
      },
      normalized,
    )
    const result = await runExperimentShellCommand(shellCommand, workspace, timeoutMs)
    const status = result.exitCode === 0 ? "succeeded" : result.timedOut ? "resource_exceeded" : "failed"
    const traceData = {
      schema_version: "ExperimentTerminalTrace.v1",
      trace_id: traceID,
      run_id: runID,
      experiment_id: spec.experiment_id,
      role: spec.role,
      environment: environment.mode,
      platform: environment.platform,
      command: shellCommand,
      cwd: workspace,
      timeout_seconds: Math.round(timeoutMs / 1000),
      status,
      exit_code: result.exitCode,
      timed_out: result.timedOut,
      wall_time_seconds: result.wallTimeSeconds,
      stdout_bytes: result.stdoutBytes,
      stderr_bytes: result.stderrBytes,
      stdout_excerpt: result.stdout,
      stderr_excerpt: result.stderr,
      output_truncated: result.outputTruncated,
      started_at: result.startedAt,
      finished_at: result.finishedAt,
    }
    const traceArtifact = await writeResearchArtifact(
      runDir,
      {
        kind: "log",
        logical_path: `experiments/terminal/${safeExperimentTraceSegment(environment.mode)}-${safeExperimentTraceSegment(
          spec.experiment_id,
        )}-${safeExperimentTraceSegment(traceID)}.json`,
        data: traceData,
        metadata: {
          artifact_schema: "ExperimentTerminalTrace.v1",
          experiment_id: spec.experiment_id,
          environment: environment.mode,
          command: shellCommand,
        },
      },
      normalized,
    )
    terminalTraces.push({
      trace_id: traceID,
      artifact_id: traceArtifact.artifact_id,
      experiment_id: spec.experiment_id,
      role: spec.role,
      environment: environment.mode,
      command: shellCommand,
      cwd: workspace,
      status,
      exit_code: result.exitCode,
      wall_time_seconds: result.wallTimeSeconds,
      timed_out: result.timedOut,
      stdout_bytes: result.stdoutBytes,
      stderr_bytes: result.stderrBytes,
      output_truncated: result.outputTruncated,
    })
    await appendResearchEvent(
      runDir,
      {
        type: "experiment.command.completed",
        actor: "system",
        payload: {
          trace_id: traceID,
          trace_artifact_id: traceArtifact.artifact_id,
          experiment_id: spec.experiment_id,
          role: spec.role,
          environment: environment.mode,
          command: shellCommand,
          status,
          exit_code: result.exitCode,
          timed_out: result.timedOut,
          wall_time_seconds: result.wallTimeSeconds,
          stdout_bytes: result.stdoutBytes,
          stderr_bytes: result.stderrBytes,
          output_truncated: result.outputTruncated,
        },
      },
      normalized,
    )
    return {
      status,
      command,
      metrics: [
        {
          name: spec.expected_metric,
          value: result.exitCode === 0 ? 1 : 0,
          direction: "higher_better",
          unit: "ratio",
        },
      ],
      stdout: result.stdout,
      stderr: result.timedOut ? `Command timed out after ${result.wallTimeSeconds.toFixed(1)}s.\n${result.stderr}`.trim() : result.stderr,
      exit_code: result.exitCode,
      resource_usage: { wall_time_seconds: result.wallTimeSeconds },
    }
  }
  const loop = await recordExperimentLoop(
    runDir,
    {
      plan: effectivePlan,
      host_runner: runner,
      container_runner: runner,
      run_options: { now: normalized.clock?.().toISOString() },
    },
    normalized,
  )
  const latestStatus = await getResearchRunStatus(runDir)
  const previousBlockers = metadataStringArray(jsonRecord(latestStatus.state.final_gate).blockers)
  const nextBlockers = loop.report.final_claims_allowed
    ? previousBlockers.filter((blocker) => blocker !== "reproduction_failure")
    : [...new Set([...previousBlockers, "reproduction_failure"])]
  const updatedGate = await setResearchFinalGate(
    runDir,
    {
      status: nextBlockers.length === 0 ? "passed" : "blocked",
      blockers: nextBlockers,
    },
    normalized,
  )
  if (updatedGate.status === "passed") await updateResearchRunStatus(runDir, "succeeded", normalized)
  await appendResearchEvent(
    runDir,
    {
      type: "experiment.protocol.rerun.completed",
      actor: "system",
      payload: {
        workspace_path: workspace,
        host_runs: loop.host_runs.length,
        container_runs: loop.container_runs.length,
        recommendation: loop.report.recommendation,
        final_claims_allowed: loop.report.final_claims_allowed,
        final_gate_status: updatedGate.status,
        final_gate_blockers: updatedGate.blockers,
      },
    },
    normalized,
  )
  const updated = await getPaperRunSnapshotFromDir(runDir)
  await publishPaperRunSnapshot(updated, runDir)
  return {
    schema_version: "PaperExperimentProtocolRunResult.v1",
    run_id: runID,
    status: loop.report.final_claims_allowed ? "succeeded" : "blocked",
    dry_run: false,
    workspace_path: workspace,
    planned_commands: plannedCommands,
    host_runs: loop.host_runs.map(summarizeExperimentRun),
    container_runs: loop.container_runs.map(summarizeExperimentRun),
    terminal_traces: terminalTraces,
    report: loop.report,
    artifact_ids: [
      loop.artifacts.plan.artifact_id,
      loop.artifacts.host_runs.artifact_id,
      loop.artifacts.container_runs.artifact_id,
      loop.artifacts.result_report.artifact_id,
      ...terminalTraces.flatMap((trace) => (trace.artifact_id ? [trace.artifact_id] : [])),
    ],
    message: loop.report.final_claims_allowed
      ? "实验协议已执行，host/container 结果允许 final claim。"
      : "实验协议已执行，但仍有阻断项，final claim 不能放行。",
    action: loop.report.final_claims_allowed ? "可以刷新 Preview 或重新导出 PaperRun。" : "查看 ResultReport blocker 并修复失败命令。",
  }
}

export async function exportPaperRun(
  runID: string,
  input: { forced?: boolean },
  options?: PaperRunRuntimeOptions,
): Promise<PaperExportBundle> {
  const runDir = await findPaperRunDir(runID, options)
  const status = await getResearchRunStatus(runDir)
  const finalGate = normalizeFinalGateState(status.state.final_gate, status.run.updated_at)
  if (finalGate.status !== "passed" && !input.forced) {
    const snapshot = await getPaperRunSnapshotFromDir(runDir)
    await publishPaperRunSnapshot(snapshot, runDir)
    return snapshot.export_state
  }

  const drafts = await readJsonlFacts(runDir, "draft")
  let latest = await loadLatestDraftPaper({ runDir, run: status.run, drafts })
  if (finalGate.status === "passed" && !input.forced) {
    const artifacts = await readJsonlFacts(runDir, "artifact")
    latest =
      (await refreshDraftPaperForFinalExport({
        runDir,
        run: status.run,
        artifacts,
        existingSourceArtifactIDs: latest.sourceArtifactIDs,
        options,
      })) ?? latest
  }
  if (!latest.draft) {
    const snapshot = await getPaperRunSnapshotFromDir(runDir)
    await publishPaperRunSnapshot(snapshot, runDir)
    return {
      run_id: runID,
      status: "blocked",
      formats: [],
      artifact_ids: [],
      failed_checks: ["draft_missing"],
      message: "没有真实草稿 artifact，不能生成 final export 或 forced draft。",
    }
  }
  const exported = await recordExportBundle(
    runDir,
    {
      mode: input.forced ? "forced_draft" : "final",
      draft: latest.draft,
      final_gate: finalGate,
      source_artifact_ids: latest.sourceArtifactIDs,
    },
    options,
  )
  const bundle = paperExportBundleFromResearch(runID, exported.bundle)
  await publishPaperRunSnapshot(await getPaperRunSnapshotFromDir(runDir), runDir)
  return bundle
}

export function paperCapabilities() {
  return {
    capabilities: defaultResearchCapabilities(),
    packs: builtinPaperCapabilityPacks(),
  }
}

export async function paperDoctor(options?: PaperRunRuntimeOptions) {
  const capabilities = defaultResearchCapabilities()
  const inventory = await loadPaperModelInventory({ home: options?.home })
  const managedCapabilities = await inspectPaperManagedCapabilities({ home: options?.home, workspace: options?.workspace })
  const machine = await inspectPaperMachineProfile({ home: options?.home, workspace: options?.workspace })
  const managedSkillChecks = managedCapabilities.map((skill) => ({
    name: skill.capability_name,
    status: skill.status === "available" ? "ok" : skill.status,
    impact: skill.impact,
    install_hint: skill.install_hint,
  }))
  const checks = [
    { name: "paper_core", status: "ok" },
    { name: "research_runtime", status: "ok" },
    { name: "private_first_data_egress", status: "ok" },
    { name: "model_workbench", status: inventory.allowlist.length > 0 ? "ok" : "missing" },
    { name: "machine_profile", status: machine.environment.status === "blocked" ? "blocked" : "ok" },
    ...managedSkillChecks,
  ]
  const report: PaperDoctorReport = {
    schema_version: "PaperDoctorReport.v1",
    configured: checks.filter((check) => check.status === "ok").map((check) => check.name),
    missing: checks.filter((check) => check.status === "missing").map((check) => check.name),
    optional_missing: checks.filter((check) => check.status === "optional_missing").map((check) => check.name),
    blocked: [
      ...checks.filter((check) => check.status === "blocked").map((check) => check.name),
      ...(inventory.allowlist.length > 0 ? [] : ["model_workbench"]),
    ],
    next_steps: [
      ...(inventory.allowlist.length > 0
        ? []
        : ["进入 /models 添加 provider、勾选允许模型并选择主决策模型。"]),
      ...managedCapabilities
        .filter((skill) => skill.status !== "available")
        .map((skill) => skill.install_hint),
      "需要机器可读结果时使用 --json；默认 doctor 输出中文摘要。",
    ],
  }
  return {
    status: "ok",
    default_language: "zh-CN",
    storage: "home-first",
    report,
    machine_profile: machine.profile,
    experiment_environment: machine.environment,
    model_workbench: {
      decision_model: inventory.decision_model,
      allowed_models: inventory.allowlist.length,
      candidates: inventory.candidates.length,
      endpoint: "/paper/model-inventory",
    },
    skills: Object.fromEntries(managedCapabilities.map((skill) => [skill.id.replaceAll("-", "_"), skill])) as Record<
      string,
      PaperManagedCapability
    >,
    capabilities: {
      total: capabilities.length,
      mcp: capabilities.filter((capability) => capability.type === "mcp").map((capability) => capability.name),
      skills: capabilities.filter((capability) => capability.type === "skill").map((capability) => capability.name),
      packs: builtinPaperCapabilityPacks().map((pack) => pack.id),
    },
    checks,
  }
}

export function discoverPaperProviders(
  providers: Record<string, { id: string; name: string; models: Record<string, unknown> }> = {},
) {
  const entries = Object.entries(providers)
  const normalized = entries.map(([id, provider]) => ({
    id,
    name: provider.name,
    models: Object.keys(provider.models ?? {}),
  }))
  return {
    default_model: undefined,
    sample_templates: [
      {
        id: "deepseek",
        name: "DeepSeek",
        models: ["deepseek-v4-pro"],
        auto_enabled: false,
      },
    ],
    providers: normalized,
  }
}

export function paperModelRoles(config: ResearchIntakeRequest["model_roles"] = {}) {
  const roles = modelRoleMap(config)
  return {
    strategy: "paper_provider_agnostic",
    default_model: undefined,
    roles,
  }
}

export async function paperModelWorkbench(options?: PaperRunRuntimeOptions) {
  const inventory = await loadPaperModelInventory({ home: options?.home })
  return {
    inventory,
    roles: modelRolesFromInventory(inventory),
    routing: PAPER_MODEL_ROLES.map((role) => routePaperModel(inventory, { role })),
  }
}
