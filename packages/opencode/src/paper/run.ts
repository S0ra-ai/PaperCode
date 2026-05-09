import path from "path"
import {
  appendResearchEvent,
  createResearchRun,
  discoverRunDirs,
  getResearchRunStatus,
  loadResearchRun,
  readJsonlFacts,
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
import { normalizeResearchIntake, recordResearchIntake, type ResearchBrief, type ResearchIntakeRequest } from "./intake"
import {
  createModelRoleRouter,
  DEFAULT_MODEL_ROLE_CONFIG,
  PAPER_MODEL_ROLES,
  type OpenCodeModelRef,
  type PaperModelRole,
} from "./model-router"
import {
  PAPER_RESEARCH_STAGE_GRAPH,
  type PaperResearchStageDefinition,
  type PaperResearchStageId,
  type PaperResearchStageStatus,
} from "./orchestrator"

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
  status: "planned" | "running" | "succeeded" | "blocked" | "failed"
}

export interface AgentTree {
  schema_version: "AgentTree.v1"
  max_depth: number
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
  type: string
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
  message: string
}

export interface PaperRunSnapshot {
  schema_version: "PaperRun.v1"
  run_id: string
  topic: string
  workspace: string
  status: "initialized" | "running" | "succeeded" | "failed" | "cancelled"
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
  internal_sessions: string[]
}

export interface PaperRun {
  run_id: string
  run_dir: string
  snapshot: PaperRunSnapshot
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

const BUDGET_CAPS_USD: Record<BudgetTier, number> = {
  quick: 1,
  standard: 5,
  deep: 20,
  submission: 50,
  custom: 0,
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

function budgetDepth(tier: BudgetTier) {
  if (tier === "quick") return 1
  if (tier === "standard") return 2
  if (tier === "deep") return 3
  return 4
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

function stageStatusFromEvents(stage: PaperResearchStageDefinition, events: ResearchEvent[]): PaperRunStageSnapshot {
  const completed = events.findLast(
    (event) => event.type === "paper.stage.completed" && event.payload?.stage === stage.id,
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

function defaultAgentTree(input: {
  runID: string
  tier: BudgetTier
  capabilities: ResearchCapability[]
  writer: OpenCodeModelRef
}): AgentTree {
  return {
    schema_version: "AgentTree.v1",
    max_depth: budgetDepth(input.tier),
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
          usd_cap: BUDGET_CAPS_USD[input.tier],
        },
        input_artifacts: [],
        output_artifacts: [],
        tool_traces: [],
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
    failed_checks: [],
    message: "Final export is available.",
  }
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

  return {
    schema_version: "PaperRun.v1",
    run_id: status.run.run_id,
    topic: status.run.topic,
    workspace: status.run.workspace,
    status: status.run.status,
    created_at: status.run.created_at,
    updated_at: status.run.updated_at,
    intake,
    budget_tier: budgetTier,
    quality_mode: qualityMode,
    data_egress_policy: dataEgressPolicy,
    stage_graph: {
      schema_version: PAPER_RESEARCH_STAGE_GRAPH.schema_version,
      stages: PAPER_RESEARCH_STAGE_GRAPH.stages.map((stage) => stageStatusFromEvents(stage, events)),
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
    agent_tree: defaultAgentTree({
      runID: status.run.run_id,
      tier: budgetTier,
      capabilities,
      writer: roles.writer,
    }),
    diagnostics: {
      counts: status.counts,
      model_roles: roles,
      cost: status.state.cost,
      final_gate: status.state.final_gate,
      tool_traces: toolTraces,
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
  const handle = await createResearchRun(
    {
      topic: brief.topic,
      workspace: request.workspace_path ?? normalized.workspace,
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
  await recordResearchIntake(handle.run_dir, request, normalized)
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
  return {
    run_id: handle.run.run_id,
    run_dir: handle.run_dir,
    snapshot: await getPaperRunSnapshotFromDir(handle.run_dir),
  }
}

export async function subscribePaperRunEvents(runID: string, options?: PaperRunRuntimeOptions) {
  const snapshot = await getPaperRunSnapshot(runID, options)
  return `event: paper.run.snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`
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
  return {
    accepted: true,
    run_id: runID,
    event_id: event.event_id,
    message: "指导已记录，并会作为后续 stage/agent 的约束。",
  }
}

export async function previewPaperRun(runID: string, options?: PaperRunRuntimeOptions) {
  const snapshot = await getPaperRunSnapshot(runID, options)
  return {
    readonly: true,
    run_id: runID,
    status: snapshot.preview_state.status,
    drafts: snapshot.drafts,
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
  const snapshot = await getPaperRunSnapshot(runID, options)
  if (snapshot.export_state.status === "final") return snapshot.export_state
  if (input.forced) {
    return {
      run_id: runID,
      status: "forced_draft",
      formats: ["markdown", "latex", "pdf", "docx"],
      artifact_ids: snapshot.drafts.flatMap((draft) => draft.artifact_ids),
      failed_checks: snapshot.export_state.failed_checks,
      message: "Forced draft exported with failed checks explicitly marked.",
    }
  }
  return snapshot.export_state
}

export function paperCapabilities() {
  return {
    capabilities: defaultResearchCapabilities(),
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
