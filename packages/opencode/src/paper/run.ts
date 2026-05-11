import path from "path"
import { readFile } from "fs/promises"
import { startPreviewServer, type PreviewServerHandle } from "../../../preview/src/server"
import type { PreviewAnnotation, PreviewArtifactRef, PreviewSnapshot } from "../../../preview/src/protocol"
import {
  appendResearchEvent,
  createResearchRun,
  discoverRunDirs,
  getResearchRunStatus,
  loadResearchRun,
  readJsonlFacts,
  updateResearchRunStatus,
  type ResearchFinalGateState,
  type ResearchRuntimeOptions,
} from "./research/runtime"
import type {
  ResearchArtifact,
  ResearchClaim,
  ResearchDraft,
  ResearchEvent,
  ResearchExport,
  ResearchReview,
  ResearchSource,
  ResearchToolTrace,
} from "./research/contracts"
import { defaultResearchCapabilities, type ResearchCapability } from "./capabilities"
import { builtinPaperCapabilityPacks } from "./capability-pack"
import { normalizeResearchIntake, type ResearchBrief, type ResearchIntakeRequest } from "./intake"
import {
  createModelRoleRouter,
  DEFAULT_MODEL_ROLE_CONFIG,
  PAPER_MODEL_ROLES,
  type OpenCodeModelRef,
  type PaperModelRole,
} from "./model-router"
import {
  PAPER_RESEARCH_STAGE_GRAPH,
  startPaperResearchRun,
  type PaperResearchStageDefinition,
  type PaperResearchStageId,
  type PaperResearchStageStatus,
} from "./orchestrator"
import { budgetTierPolicy } from "./budget"
import { recordExportBundle, type ExportBundle } from "./research/export"
import type { DraftPaper } from "./research/writing"
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
  data_egress_policy?: Partial<DataEgressPolicy>
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
    model_roles: Record<PaperModelRole, OpenCodeModelRef>
    cost: unknown
    final_gate: unknown
    tool_traces: ResearchToolTrace[]
    audit: PaperObservabilityAuditSummary
    memory?: ReturnType<typeof memoryBankSummary>
    code_understanding?: ReturnType<typeof codeUnderstandingSummary>
    crawler?: CrawlerDiagnosticsSummary
    huggingface?: HFLoopDiagnostics
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

function runOptions(input?: PaperRunRuntimeOptions): PaperRunRuntimeOptions {
  return {
    ...input,
    workspace: input?.workspace ? path.resolve(input.workspace) : undefined,
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
  writer: OpenCodeModelRef
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
        provider_id: input.writer.provider_id,
        model_id: input.writer.model_id,
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
        status: "running",
      },
    ],
  }
}

function modelRoleMap(config: ResearchIntakeRequest["model_roles"]) {
  const router = createModelRoleRouter({
    default_model: DEFAULT_MODEL_ROLE_CONFIG.default_model,
    roles: config,
  })
  const roles = {} as Record<PaperModelRole, OpenCodeModelRef>
  for (const role of PAPER_MODEL_ROLES) {
    const resolved = router.resolve(role)
    roles[role] = {
      provider_id: resolved.provider_id,
      model_id: resolved.model_id,
    }
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

function exportState(input: {
  runID: string
  state: Awaited<ReturnType<typeof getResearchRunStatus>>["state"]
  exports: ResearchExport[]
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
  return {
    run_id: input.runID,
    status: "final",
    formats: input.exports.map((item) => item.format),
    artifact_ids: input.exports.flatMap((item) => item.artifact_ids),
    files: input.exports.map((item) => ({
      format: item.format,
      path: item.path,
      status: "written" as const,
    })),
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
  const markdown = input.markdown ?? `# ${input.title}\n\nNo recorded Markdown draft was available for this PaperRun.`
  return {
    schema_version: "DraftPaper.v1",
    draft_id: `draft:${input.runID}`,
    title: input.title,
    created_at: input.createdAt,
    version: 1,
    sections: [
      {
        section_id: "paper",
        title: "Paper",
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
      draft: fallbackDraftPaper({
        runID: input.run.run_id,
        title: input.run.topic,
        createdAt: input.run.updated_at,
      }),
      sourceArtifactIDs: [] as string[],
    }
  }
  const markdown = await readFile(path.join(input.runDir, latest.path), "utf8").catch(() => undefined)
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

function paperExportBundleFromResearch(runID: string, bundle: ExportBundle): PaperExportBundle {
  const writtenFiles = bundle.files.filter((file) => file.status === "written")
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
    message:
      bundle.status === "final"
        ? "Final export rendered with concrete files."
        : "Forced draft exported with failed checks explicitly marked.",
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
    content: content ?? `# ${snapshot.topic}\n\nPaper Fucker Preview is waiting for a recorded draft artifact.`,
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
  return [...claimAnnotations, ...failedChecks]
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
  const budgetTier = normalizeBudgetTier(metadataBudgetTier(metadata.paper_budget_tier))
  const qualityMode = normalizeQualityMode(metadataQualityMode(metadata.paper_quality_mode), budgetTier)
  const dataEgressPolicy = defaultDataEgressPolicy(
    jsonRecord(metadata.paper_data_egress_policy) as Partial<DataEgressPolicy>,
  )
  const intake = intakeFromRun(status.run)
  const roles = modelRoleMap(intake.model_roles)
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
      reproduction_gate: gate === "passed" ? "passed" : gate === "blocked" ? "blocked" : "not_started",
    },
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
      cost: status.state.cost,
      final_gate: status.state.final_gate,
      tool_traces: toolTraces,
      audit: paperObservabilityAuditFromEvents(events),
      memory: memoryBankSummary(memoryBank),
      code_understanding: codeUnderstandingSummary(codeGraph),
      crawler: crawlerDiagnostics({ sources }),
      huggingface: hfLoopDiagnostics({ sources }),
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
    export_state: exportState({ runID: status.run.run_id, state: status.state, exports }),
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
  const dataEgressPolicy = defaultDataEgressPolicy(request.data_egress_policy)
  const workspace = request.workspace_path ?? normalized.workspace
  const executionRequest: ResearchIntakeRequest = {
    ...request,
    workspace_path: workspace,
  }
  const handle = await createResearchRun(
    {
      topic: brief.topic,
      workspace,
      metadata: {
        paper_run: true,
        paper_intake: {
          code_paths: request.code_paths ?? [],
          paper_files: request.paper_files ?? [],
          dataset_paths: request.dataset_paths ?? [],
          experiment_logs: request.experiment_logs ?? [],
          target_profile: request.target_profile,
          language: request.language,
          model_roles: request.model_roles ?? {},
        },
        paper_budget_tier: budgetTier,
        paper_quality_mode: qualityMode,
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
        data_egress_policy: dataEgressPolicy,
      },
    },
    normalized,
  )
  await startPaperResearchRun(
    {
      run_dir: handle.run_dir,
      request: executionRequest,
    },
    normalized,
  )
  await recordDefaultPaperRunObservability(
    handle.run_dir,
    {
      model_roles: modelRoleMap(request.model_roles),
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
  return {
    run_id: handle.run.run_id,
    run_dir: handle.run_dir,
    snapshot: {
      ...(await getPaperRunSnapshotFromDir(handle.run_dir)),
      controller_state: controller,
    },
  }
}

export async function subscribePaperRunEvents(runID: string, options?: PaperRunRuntimeOptions) {
  const snapshot = await getPaperRunSnapshot(runID, options)
  return `event: paper.run.snapshot\ndata: ${JSON.stringify(snapshot)}\n\n${controllerSseEvent(snapshot.controller_state)}`
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
  return state
}

export async function previewPaperRun(runID: string, options?: PaperRunRuntimeOptions): Promise<PaperRunPreviewResponse> {
  const runDir = await findPaperRunDir(runID, options)
  const snapshot = await getPaperRunSnapshotFromDir(runDir)
  const previewSnapshot = await createPaperRunLivePreviewSnapshot(runDir, snapshot)
  const livePreview = startOrReplaceLivePreview(runID, previewSnapshot)
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
    return snapshot.export_state
  }

  const drafts = await readJsonlFacts(runDir, "draft")
  const latest = await loadLatestDraftPaper({ runDir, run: status.run, drafts })
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
  return paperExportBundleFromResearch(runID, exported.bundle)
}

export function paperCapabilities() {
  return {
    capabilities: defaultResearchCapabilities(),
    packs: builtinPaperCapabilityPacks(),
  }
}

export function paperDoctor() {
  const capabilities = defaultResearchCapabilities()
  return {
    status: "ok",
    default_language: "zh-CN",
    storage: "workspace-first",
    capabilities: {
      total: capabilities.length,
      mcp: capabilities.filter((capability) => capability.type === "mcp").map((capability) => capability.name),
      skills: capabilities.filter((capability) => capability.type === "skill").map((capability) => capability.name),
      packs: builtinPaperCapabilityPacks().map((pack) => pack.id),
    },
    checks: [
      { name: "paper_core", status: "ok" },
      { name: "research_runtime", status: "ok" },
      { name: "private_first_data_egress", status: "ok" },
    ],
  }
}

export function discoverPaperProviders(
  providers: Record<string, { id: string; name: string; models: Record<string, unknown> }> = {},
) {
  const entries = Object.entries(providers)
  const normalized =
    entries.length > 0
      ? entries.map(([id, provider]) => ({
          id,
          name: provider.name,
          models: Object.keys(provider.models ?? {}),
        }))
      : [
          {
            id: "deepseek",
            name: "DeepSeek",
            models: ["deepseek-v4-pro"],
          },
        ]
  return {
    default_model: DEFAULT_MODEL_ROLE_CONFIG.default_model,
    providers: normalized,
  }
}

export function paperModelRoles(config: ResearchIntakeRequest["model_roles"] = {}) {
  const roles = modelRoleMap(config)
  return {
    strategy: "opencode_provider_agnostic",
    default_model: DEFAULT_MODEL_ROLE_CONFIG.default_model,
    roles,
  }
}
