import {
  appendResearchEvent,
  loadResearchRun,
  readJsonlFacts,
  writeResearchArtifact,
  type ResearchRuntimeOptions,
} from "./research/runtime"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import type { ResearchArtifact } from "./research/contracts"
import { createResearchCapabilityRegistry, defaultResearchCapabilities, type ResearchCapabilityRegistry } from "./capabilities"
import { normalizeResearchIntake, recordResearchIntake, type ResearchIntakeRequest } from "./intake"
import { analyzeCodebaseForPaper, recordCodeToPaperArtifacts, type CodeToPaperAnalysis } from "./code-to-paper"
import { runPaperAuthoringLoop } from "./authoring"
import { budgetTierPolicy, type BudgetTier } from "./budget"
import { executeContainerExperiment, executeHostExperiment, loadExperimentProtocol, parseExperimentMetrics, selectContainerCommand } from "./research/experiments/execution"
import {
  createGeneratedJournalProfileDraft,
  createPaperProfileRegistry,
  defaultPaperProfiles,
  resolvePaperProfileSelection,
  type PaperProfileId,
} from "./profiles"
import { indexResearchMaterials, recordMaterialIndex } from "./material-index"
import { discoverAndRecordLiteratureData } from "./research/sources"
import { planExperiments } from "./research/experiments/planning"
import { recordExperimentLoop } from "./research/experiments/recording"
import { applySectionOverrides, composeClaimLedger, composeDraftPaper } from "./research/writing"
import type { DataPlan, DatasetCandidate, LiteratureMap, SourceCandidate, SourceRecord } from "./research/sources"
import type {
  ExperimentCommand,
  ExperimentMetric,
  ExperimentMetricDirection,
  ExperimentProtocol,
  ExperimentProtocolGuidance,
  ExperimentProtocolStarterPack,
  ResultReport,
  ExperimentPlan,
  ExperimentRunner,
} from "./research/experiments"
import type { ClaimLedger, CodeAvailabilityMetadata } from "./research/writing"
import { createExperimentNoveltyGate, createNoveltyCheckpoint, type NoveltyCheckpoint } from "./novelty"
import { createResearchWikiDigest } from "./research-wiki"
import { createPaperSpine, type PaperSpineClaim } from "./paper-spine"
import { createGlobalFigureSpec } from "./global-figure"

export const PAPER_RESEARCH_STAGE_IDS = [
  "intake",
  "planning",
  "literature",
  "code_analysis",
  "data",
  "experiment_design",
  "experiment_execution",
  "reproduction",
  "claim_ledger",
  "drafting",
  "profile_formatting",
  "verification",
  "revision",
  "export",
] as const

export type PaperResearchStageId = (typeof PAPER_RESEARCH_STAGE_IDS)[number]

export type PaperResearchStageStatus = "pending" | "running" | "succeeded" | "blocked" | "skipped"

export type PaperResearchBlockReason =
  | "handler_missing"
  | "capability_missing"
  | "license_or_source_conflict"
  | "authenticity_gate_blocked"
  | "reproduction_failure"
  | "cost_over_budget"
  | "safety_or_permission"

export interface PaperResearchStageDefinition {
  id: PaperResearchStageId
  title: string
  depends_on: PaperResearchStageId[]
  artifact_schema: string
}

export interface PaperResearchStageSnapshot {
  id: PaperResearchStageId
  status: PaperResearchStageStatus
  started_at?: string
  completed_at?: string
  summary?: string
  block_reason?: PaperResearchBlockReason
}

export interface PaperResearchRunGraph {
  schema_version: "ResearchRunGraph.v1"
  stages: PaperResearchStageDefinition[]
}

export interface PaperResearchRunSnapshot {
  schema_version: "ResearchRunController.v1"
  run_id: string
  graph: PaperResearchRunGraph
  stages: PaperResearchStageSnapshot[]
  paused: boolean
  pause?: {
    stage: PaperResearchStageId
    reason: PaperResearchBlockReason
    message: string
    diagnostic_artifact_id?: string
  }
  updated_at: string
}

export interface PaperStageHandlerResult {
  status?: "succeeded" | "skipped"
  summary?: string
  artifact?: {
    logical_path: string
    data: unknown
    schema?: string
  }
  block?: {
    reason: PaperResearchBlockReason
    message: string
    missing_capabilities?: string[]
  }
}

export type PaperStageHandler = (input: {
  run_dir: string
  run_id: string
  stage: PaperResearchStageId
  request: ResearchIntakeRequest
  capabilities: ResearchCapabilityRegistry
  options?: ResearchRuntimeOptions
}) => Promise<PaperStageHandlerResult> | PaperStageHandlerResult

export interface StartPaperResearchRunInput {
  run_dir: string
  request: ResearchIntakeRequest
  handlers?: Partial<Record<PaperResearchStageId, PaperStageHandler>>
  capabilities?: ResearchCapabilityRegistry
  max_stages?: number
}

export const PAPER_RESEARCH_STAGE_GRAPH: PaperResearchRunGraph = {
  schema_version: "ResearchRunGraph.v1",
  stages: [
    { id: "intake", title: "Normalize research intake", depends_on: [], artifact_schema: "ResearchBrief.v1" },
    { id: "planning", title: "Build paper run plan", depends_on: ["intake"], artifact_schema: "ResearchRunGraph.v1" },
    { id: "literature", title: "Discover literature", depends_on: ["planning"], artifact_schema: "LiteratureMap.v1" },
    { id: "code_analysis", title: "Analyze codebase", depends_on: ["planning"], artifact_schema: "CodebaseMap.v1" },
    { id: "data", title: "Discover data", depends_on: ["literature"], artifact_schema: "DataPlan.v1" },
    {
      id: "experiment_design",
      title: "Design experiments",
      depends_on: ["code_analysis", "data"],
      artifact_schema: "ExperimentPlan.v1",
    },
    {
      id: "experiment_execution",
      title: "Run exploratory experiments",
      depends_on: ["experiment_design"],
      artifact_schema: "ExperimentRun.v1",
    },
    {
      id: "reproduction",
      title: "Run reproduction gate",
      depends_on: ["experiment_execution"],
      artifact_schema: "ResultReport.v1",
    },
    {
      id: "claim_ledger",
      title: "Build ClaimLedger",
      depends_on: ["literature", "reproduction"],
      artifact_schema: "ClaimLedger.v1",
    },
    { id: "drafting", title: "Draft paper", depends_on: ["claim_ledger"], artifact_schema: "DraftPaper.v1" },
    {
      id: "profile_formatting",
      title: "Apply paper profile",
      depends_on: ["drafting"],
      artifact_schema: "PaperProfileCheck.v1",
    },
    {
      id: "verification",
      title: "Run authenticity gate",
      depends_on: ["profile_formatting"],
      artifact_schema: "BlockingReport.v1",
    },
    { id: "revision", title: "Revise paper", depends_on: ["verification"], artifact_schema: "DraftPaper.v1" },
    { id: "export", title: "Export paper bundle", depends_on: ["revision"], artifact_schema: "ExportBundle.v1" },
  ],
}

function nowIso(options?: ResearchRuntimeOptions) {
  return (options?.clock?.() ?? new Date()).toISOString()
}

function initialStages() {
  return PAPER_RESEARCH_STAGE_GRAPH.stages.map((stage) => ({ id: stage.id, status: "pending" as const }))
}

function nextRunnableStage(stages: PaperResearchStageSnapshot[]) {
  const byId = new Map(stages.map((stage) => [stage.id, stage]))
  return PAPER_RESEARCH_STAGE_GRAPH.stages.find((stage) => {
    const snapshot = byId.get(stage.id)
    if (!snapshot || snapshot.status !== "pending") return false
    return stage.depends_on.every((dependency) => byId.get(dependency)?.status === "succeeded")
  })
}

function updateStage(
  stages: PaperResearchStageSnapshot[],
  stage: PaperResearchStageId,
  update: Partial<PaperResearchStageSnapshot>,
) {
  return stages.map((item) => (item.id === stage ? { ...item, ...update } : item))
}

function missingCapabilities(
  registry: ResearchCapabilityRegistry,
  required: string[],
): string[] {
  return required.filter((name) => {
    try {
      registry.get(name)
      return false
    } catch {
      return true
    }
  })
}

function requireCapabilities(
  stage: PaperResearchStageId,
  registry: ResearchCapabilityRegistry,
  required: string[],
): PaperStageHandlerResult | undefined {
  const missing = missingCapabilities(registry, required)
  if (missing.length === 0) return undefined
  return {
    block: {
      reason: "capability_missing",
      message: `Stage ${stage} requires missing capabilities: ${missing.join(", ")}`,
      missing_capabilities: missing,
    },
  }
}

function defaultHandlerFor(stage: PaperResearchStageId): PaperStageHandler {
  const concrete = DEFAULT_STAGE_HANDLERS[stage]
  if (concrete) return concrete

  return ({ request, capabilities }) => {
    const brief = normalizeResearchIntake(request)
    const required = REQUIRED_CAPABILITIES_BY_STAGE[stage] ?? []
    const capabilityBlock = requireCapabilities(stage, capabilities, required)
    if (capabilityBlock) return capabilityBlock

    return {
      block: {
        reason: "handler_missing",
        message: `Stage ${stage} has required capabilities but no concrete papercode handler is implemented yet for ${brief.workflow}.`,
      },
    }
  }
}

const REQUIRED_CAPABILITIES_BY_STAGE: Partial<Record<PaperResearchStageId, string[]>> = {
  planning: ["opencode.task"],
  literature: ["exa"],
  code_analysis: ["opencode.read", "opencode.grep", "opencode.glob", "opencode.task"],
  data: ["exa", "python.dataset-metadata-probe"],
  experiment_design: ["skill.jupyter-notebook"],
  experiment_execution: ["opencode.shell", "python.experiment-log-parse"],
  reproduction: ["opencode.shell"],
  claim_ledger: ["paper.claim-ledger"],
  drafting: ["paper.claim-ledger"],
  profile_formatting: ["skill.nature-paper"],
  verification: ["paper.claim-ledger"],
  revision: ["opencode.task"],
  export: ["paper.export-bundle"],
}

function workspacePath(request: ResearchIntakeRequest) {
  return request.workspace_path ?? process.cwd()
}

function targetProfile(request: ResearchIntakeRequest): PaperProfileId {
  return resolvePaperProfileSelection({
    target_profile: request.target_profile,
    target_journal: request.target_journal,
    target_journal_url: request.target_journal_url,
  }).profile_id
}

type DefaultExecutionCache = {
  source?: DefaultSourceDiscoveryResult
  code?: DefaultCodeAnalysisResult
  experiment?: DefaultExperimentLoopResult
  claims?: Awaited<ReturnType<typeof defaultClaimLedger>>
  result?: Awaited<ReturnType<typeof defaultResultReport>>
  authoring?: Awaited<ReturnType<typeof runPaperAuthoringLoop>>
}

type DefaultSourceDiscoveryResult = Awaited<ReturnType<typeof discoverAndRecordLiteratureData>>
type DefaultCodeAnalysisResult = { analysis: CodeToPaperAnalysis; artifacts: ResearchArtifact[] }
type DefaultExperimentLoopResult = {
  sources: DefaultSourceDiscoveryResult
  plan: ExperimentPlan
  protocol?: ExperimentProtocol
  guidance?: ExperimentProtocolGuidance
  guidance_artifact_id?: string
  starter_pack?: ExperimentProtocolStarterPack
  starter_pack_artifact_id?: string
  starter_pack_file_artifact_ids?: string[]
  loop: Awaited<ReturnType<typeof recordExperimentLoop>>
}

type ExperimentEvidenceManifest = {
  schema_version: "ExperimentEvidenceManifest.v1"
  created_at?: string
  primary_metric?: string
  metric_direction?: ExperimentMetricDirection
  metric_values?: Record<string, number>
  experiments?: Array<{
    experiment_id: string
    role: "baseline" | "ablation"
    label: string
    rationale: string
  }>
  stdout?: string
  container_image?: string
  container_digest?: string
  provenance?: string
  datasets?: DatasetCandidate[]
}

type SourceEvidenceManifest = {
  schema_version: "SourceEvidenceManifest.v1"
  created_at?: string
  provenance?: string
  sources: SourceCandidate[]
}

const defaultExecutionCache = new Map<string, DefaultExecutionCache>()

function defaultCache(runDir: string) {
  const existing = defaultExecutionCache.get(runDir)
  if (existing) return existing
  const created: DefaultExecutionCache = {}
  defaultExecutionCache.set(runDir, created)
  return created
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "topic"
  )
}

async function writeStageLog(
  runDir: string,
  input: {
    logical_path: string
    data: unknown
    schema: string
  },
  options?: ResearchRuntimeOptions,
) {
  return writeResearchArtifact(
    runDir,
    {
      kind: "log",
      logical_path: input.logical_path,
      data: input.data,
      metadata: { artifact_schema: input.schema },
    },
    options,
  )
}

async function datasetCandidatesFromPaths(request: ResearchIntakeRequest, now: string): Promise<DatasetCandidate[]> {
  const workspace = request.workspace_path
  if (!workspace || !request.dataset_paths?.length) return []
  const candidates: DatasetCandidate[] = []
  for (const datasetPath of request.dataset_paths) {
    const absolute = path.resolve(workspace, datasetPath)
    const info = await stat(absolute).catch(() => undefined)
    if (!info) continue
    const metadataDiagnostics = await datasetMetadataDiagnostics(absolute)
    const id = `dataset:local:${slug(datasetPath)}`
    candidates.push({
      dataset_id: id,
      title: path.basename(datasetPath) || datasetPath,
      url: `file://${absolute.replace(/\\/g, "/")}`,
      provider: "papercode-local-workspace",
      license: { status: "clear", expression: "workspace-authorized local dataset" },
      version: { value: info.mtimeMs.toString(), retrieved_at: now },
      verification: {
        status: "verified",
        method: "local-dataset-path-exists",
        checked_at: now,
        diagnostics: metadataDiagnostics,
      },
      topics: [normalizeResearchIntake(request).topic],
      access: "open",
      task_fit: 0.7,
      source_id: id,
    })
  }
  return candidates
}

async function datasetMetadataDiagnostics(absolutePath: string): Promise<string[]> {
  if (!absolutePath.toLowerCase().endsWith(".json")) return []
  const text = await readFile(absolutePath, "utf8").catch(() => "")
  if (!text || text.length > 2_000_000) return []
  try {
    const parsed = JSON.parse(text) as {
      schema_version?: unknown
      provenance?: unknown
      label_policy?: unknown
      candidates?: unknown
    }
    return [
      typeof parsed.schema_version === "string" ? `schema_version:${parsed.schema_version}` : undefined,
      typeof parsed.provenance === "string" ? `provenance:${parsed.provenance}` : undefined,
      typeof parsed.label_policy === "string" ? `label_policy:${parsed.label_policy}` : undefined,
      Array.isArray(parsed.candidates) ? `candidate_count:${parsed.candidates.length}` : undefined,
    ].filter((item): item is string => Boolean(item))
  } catch {
    return []
  }
}

async function defaultSourceDiscovery(runDir: string, request: ResearchIntakeRequest, options?: ResearchRuntimeOptions) {
  const cache = defaultCache(runDir)
  if (cache.source) return cache.source
  const brief = normalizeResearchIntake(request)
  const now = nowIso(options)
  const sourceEvidence = await loadSourceEvidenceManifest(runDir, request, options)
  const experimentEvidence = await loadExperimentEvidenceManifest(runDir, request, options)
  cache.source = await discoverAndRecordLiteratureData(
    runDir,
    {
      topic: brief.topic,
      full_access: false,
      literature_candidates: sourceEvidence?.sources ?? [],
      dataset_candidates: [
        ...(experimentEvidence?.datasets ?? []),
        ...(await datasetCandidatesFromPaths(request, now)),
      ],
      min_verified_sources: 1,
      now,
    },
    options,
  )
  return cache.source
}

async function recordNoveltyCheckpoint(
  runDir: string,
  input: {
    run_id: string
    request: ResearchIntakeRequest
    stage: Parameters<typeof createNoveltyCheckpoint>[0]["stage"]
    sources?: SourceRecord[]
  },
  options?: ResearchRuntimeOptions,
) {
  const checkpoint = createNoveltyCheckpoint({
    request: input.request,
    stage: input.stage,
    sources: input.sources ?? [],
    now: nowIso(options),
  })
  const artifact = await writeStageLog(
    runDir,
    {
      logical_path: `novelty/${input.stage}-checkpoint.json`,
      schema: "NoveltyCheckpoint.v1",
      data: checkpoint,
    },
    options,
  )
  await appendResearchEvent(
    runDir,
    {
      type: "novelty.checkpoint.completed",
      actor: "agent",
      payload: {
        stage: input.stage,
        checkpoint_id: checkpoint.checkpoint_id,
        status: checkpoint.status,
        conflicts: checkpoint.conflicts.length,
        artifact_id: artifact.artifact_id,
      },
    },
    options,
  )
  return { checkpoint, artifact }
}

async function recordExperimentNoveltyGate(
  runDir: string,
  checkpoint: NoveltyCheckpoint,
  options?: ResearchRuntimeOptions,
) {
  const gate = createExperimentNoveltyGate({ checkpoint, now: nowIso(options) })
  const artifact = await writeStageLog(
    runDir,
    {
      logical_path: "novelty/experiment-gate.json",
      schema: "ExperimentNoveltyGate.v1",
      data: gate,
    },
    options,
  )
  await appendResearchEvent(
    runDir,
    {
      type: "novelty.experimentgate.updated",
      actor: "agent",
      payload: {
        gate_id: gate.gate_id,
        status: gate.status,
        allowed_to_run_expensive_experiments: gate.allowed_to_run_expensive_experiments,
        artifact_id: artifact.artifact_id,
      },
    },
    options,
  )
  return { gate, artifact }
}

async function recordResearchWiki(
  runDir: string,
  input: {
    run_id: string
    request: ResearchIntakeRequest
    novelty: NoveltyCheckpoint
    artifact_ids?: string[]
  },
  options?: ResearchRuntimeOptions,
) {
  const wiki = createResearchWikiDigest({
    run_id: input.run_id,
    request: input.request,
    novelty: input.novelty,
    artifact_ids: input.artifact_ids,
    now: nowIso(options),
  })
  const artifact = await writeStageLog(
    runDir,
    {
      logical_path: "memory/research-wiki-digest.json",
      schema: "ResearchWikiDigest.v1",
      data: wiki,
    },
    options,
  )
  await appendResearchEvent(
    runDir,
    {
      type: "researchwiki.digest.updated",
      actor: "agent",
      payload: {
        idea_id: wiki.archive.idea_id,
        novelty_status: wiki.archive.novelty_status,
        artifact_id: artifact.artifact_id,
      },
    },
    options,
  )
  return { wiki, artifact }
}

function paperSpineClaims(ledger: ClaimLedger): PaperSpineClaim[] {
  return ledger.entries.map((entry) => ({
    claim_id: entry.claim_id,
    text: entry.text,
    status: entry.status === "supported" ? "supported" : "needs_review",
    source_ids: entry.source_ids,
    artifact_ids: entry.artifact_ids,
  }))
}

async function recordPaperSpineAndFigure(
  runDir: string,
  input: {
    run_id: string
    request: ResearchIntakeRequest
    novelty: NoveltyCheckpoint
    claims: ClaimLedger
    sources: SourceRecord[]
  },
  options?: ResearchRuntimeOptions,
) {
  const spine = createPaperSpine({
    run_id: input.run_id,
    title: normalizeResearchIntake(input.request).topic,
    novelty: input.novelty,
    claims: paperSpineClaims(input.claims),
    sources: input.sources,
    now: nowIso(options),
  })
  const spineArtifact = await writeStageLog(
    runDir,
    {
      logical_path: "writing/paper-spine.json",
      schema: "PaperSpine.v1",
      data: spine,
    },
    options,
  )
  const figure = createGlobalFigureSpec({
    run_id: input.run_id,
    title: normalizeResearchIntake(input.request).topic,
    target_profile: targetProfile(input.request),
    spine,
    now: nowIso(options),
  })
  const figureArtifact = await writeStageLog(
    runDir,
    {
      logical_path: "figures/global-figure-spec.json",
      schema: "GlobalFigureSpec.v1",
      data: figure,
    },
    options,
  )
  await appendResearchEvent(
    runDir,
    {
      type: "paperspine.updated",
      actor: "agent",
      payload: {
        spine_id: spine.spine_id,
        readiness: spine.readiness,
        artifact_id: spineArtifact.artifact_id,
      },
    },
    options,
  )
  await appendResearchEvent(
    runDir,
    {
      type: "figure.globalspec.updated",
      actor: "agent",
      payload: {
        figure_id: figure.figure_id,
        status: figure.status,
        panels: figure.panels.length,
        artifact_id: figureArtifact.artifact_id,
      },
    },
    options,
  )
  return { spine, figure, artifacts: { spine: spineArtifact, figure: figureArtifact } }
}

async function defaultCodeAnalysis(
  runDir: string,
  request: ResearchIntakeRequest,
  options?: ResearchRuntimeOptions,
): Promise<DefaultCodeAnalysisResult> {
  const cache = defaultCache(runDir)
  if (cache.code) return cache.code
  const analysis = await analyzeCodebaseForPaper({
    workspace_path: workspacePath(request),
    code_paths: request.code_paths ?? [],
  })
  const artifacts = await recordCodeToPaperArtifacts(runDir, analysis, options)
  cache.code = { analysis, artifacts }
  return cache.code
}

function methodName(request: ResearchIntakeRequest) {
  if ((request.code_paths ?? []).length > 0) return "Code-grounded papercode workflow"
  return "Evidence-led papercode workflow"
}

function primaryExperimentMetric(request: ResearchIntakeRequest, evidence?: ExperimentEvidenceManifest, localMetric?: string) {
  if (evidence?.primary_metric) return evidence.primary_metric
  if (localMetric) return localMetric
  if ((request.code_paths ?? []).length > 0) return "test_pass_rate"
  return "accuracy"
}

function defaultExperimentRunner(reason: string): ExperimentRunner {
  return (spec, environment) => ({
    status: "environment_failed",
    metrics: [],
    stdout: "",
    stderr: `PaperRun default engine did not execute ${spec.experiment_id} in ${environment.mode}: ${reason}`,
    exit_code: 127,
    resource_usage: { wall_time_seconds: 0 },
  })
}

function automaticCodeExperimentRunner(input: {
  request: ResearchIntakeRequest
  code: DefaultCodeAnalysisResult
  protocol?: ExperimentProtocol
}): ExperimentRunner | undefined {
  const localRunner = localCodeExperimentRunner(input)
  if (!localRunner) return undefined
  return async (spec, environment) => {
    const localResult = await localRunner(spec, environment)
    return localResult
  }
}

function parseScriptCommand(command: string) {
  const trimmed = command.trim()
  if (!trimmed) return undefined
  return trimmed
}

function selectLocalTestScript(code: DefaultCodeAnalysisResult) {
  const entries = code.analysis.experiment_surface.runnable_entries
  const preferred = ["test:paper", "test:unit", "typecheck", "check", "lint", "test"]
  return (
    preferred
      .map((name) => entries.find((entry) => entry.name === name))
      .find(Boolean) ??
    entries.find((entry) => /(^|:)(test|typecheck|check|lint)(:|$)/i.test(entry.name)) ??
    undefined
  )
}

function metricNameForLocalScript(scriptName: string) {
  const normalized = scriptName.toLowerCase()
  if (normalized.includes("ranking")) return "ranking_ndcg_at_3"
  if (/^(container|repro|reproduce)(:|$)/.test(normalized)) return "container_reproduction_pass"
  if (normalized === "typecheck") return "typecheck_pass"
  if (normalized === "lint") return "lint_pass"
  if (normalized === "check") return "check_pass"
  if (normalized.startsWith("bench")) return "benchmark_pass"
  return "test_pass_rate"
}

function experimentCommandFromShell(command: string, timeoutSeconds = 120): ExperimentCommand {
  return {
    argv: [command],
    timeout_seconds: timeoutSeconds,
  }
}

function experimentCommandToShell(command: ExperimentCommand) {
  if (command.argv.length === 1) return command.argv[0]
  return command.argv.join(" ")
}

function experimentProtocolFromCode(code: DefaultCodeAnalysisResult): ExperimentProtocol {
  const entries = code.analysis.experiment_surface.runnable_entries
  const protocolEntries = entries.flatMap((entry): ExperimentProtocol["entries"] => {
    const normalized = entry.name.toLowerCase()
    const metric = metricNameForLocalScript(entry.name)
    if (/^(baseline|bench:baseline|benchmark:baseline)(:|$)/.test(normalized)) {
      return [
        {
          protocol_id: `baseline:${normalized.replace(/[^a-z0-9]+/g, "-")}`,
          role: "baseline",
          label: entry.name,
          command: experimentCommandFromShell(entry.command),
          expected_metric: metric,
          rationale: "Baseline runner declared by package script.",
          source_range: entry.source_range,
        },
      ]
    }
    if (/^(ablation|bench:ablation|benchmark:ablation)(:|$)/.test(normalized)) {
      return [
        {
          protocol_id: `ablation:${normalized.replace(/[^a-z0-9]+/g, "-")}`,
          role: "ablation",
          label: entry.name,
          command: experimentCommandFromShell(entry.command),
          expected_metric: metric,
          rationale: "Ablation runner declared by package script.",
          source_range: entry.source_range,
        },
      ]
    }
    if (/^(container|repro|reproduce)(:|$)/.test(normalized)) {
      return [
        {
          protocol_id: `container:${normalized.replace(/[^a-z0-9]+/g, "-")}`,
          role: "container_reproduction",
          label: entry.name,
          command: experimentCommandFromShell(entry.command, 600),
          expected_metric: metric,
          rationale: "Container reproduction runner declared by package script.",
          source_range: entry.source_range,
        },
      ]
    }
    return []
  })
  const selected = selectLocalTestScript(code)
  if (selected) {
    protocolEntries.unshift({
      protocol_id: `proposed:${selected.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      role: "proposed",
      label: selected.name,
      command: experimentCommandFromShell(selected.command),
      expected_metric: metricNameForLocalScript(selected.name),
      rationale: "Primary host exploration command selected from authorized package scripts.",
      source_range: selected.source_range,
    })
  }
  const roles = new Set(protocolEntries.map((entry) => entry.role))
  const gaps = [
    !roles.has("proposed") ? "missing_proposed_runner" : undefined,
    !roles.has("baseline") ? "missing_baseline_runner" : undefined,
    !roles.has("ablation") ? "missing_ablation_runner" : undefined,
    !roles.has("container_reproduction") ? "missing_container_reproduction_runner" : undefined,
  ].filter((item): item is string => Boolean(item))
  return {
    schema_version: "ExperimentProtocol.v1",
    discovered_from: "package_scripts",
    entries: protocolEntries,
    gaps,
  }
}

function experimentProtocolGuidance(input: {
  protocol?: ExperimentProtocol
  report: ResultReport
  now: string
}): ExperimentProtocolGuidance {
  const gaps = new Set(input.protocol?.gaps ?? [])
  if (input.report.blockers.includes("experiment_protocol_incomplete")) {
    if (!input.report.best_baseline) gaps.add("missing_baseline_runner")
    if (input.protocol?.gaps.includes("missing_ablation_runner")) gaps.add("missing_ablation_runner")
    if (input.report.reproduction.status !== "passed") gaps.add("missing_container_reproduction_runner")
  }
  if (input.report.blockers.includes("container_reproduction_failed")) gaps.add("missing_container_reproduction_runner")
  const suggestions = [...gaps].flatMap((gap): ExperimentProtocolGuidance["suggestions"] => {
    if (gap === "missing_baseline_runner") {
      return [
        {
          gap,
          severity: "blocking",
          recommended_script: "baseline:<name>",
          package_json_example: { "baseline:bm25": "bun run scripts/eval-baseline.ts --method bm25" },
          rationale: "计算机类论文需要至少一个可运行 baseline，才能支撑优于现有方法的 claim。",
          next_action: "在 package.json 中增加 baseline 脚本，并确保它输出主指标。",
        },
      ]
    }
    if (gap === "missing_ablation_runner") {
      return [
        {
          gap,
          severity: "warning",
          recommended_script: "ablation:<name>",
          package_json_example: { "ablation:no-claim-ledger": "bun run scripts/eval.ts --ablation no-claim-ledger" },
          rationale: "消融实验用于缩小贡献表述范围，缺失时只能生成较保守的工程报告。",
          next_action: "补充至少一个 ablation 脚本，验证核心模块对结果的贡献。",
        },
      ]
    }
    if (gap === "missing_container_reproduction_runner") {
      return [
        {
          gap,
          severity: "blocking",
          recommended_script: "repro:container",
          package_json_example: { "repro:container": "docker build -t papercode-repro . && docker run --rm papercode-repro" },
          rationale: "final export 需要隔离环境复现通过，host-only 结果只能作为 exploratory。",
          next_action: "构建真实评价镜像，在 experiments/protocol.json 登记绑定实验 ID 的结构化 docker/podman run 命令，并使用启用容器复现的预算档位执行。导入指标不能证明隔离复现。",
        },
      ]
    }
    if (gap === "missing_proposed_runner") {
      return [
        {
          gap,
          severity: "blocking",
          recommended_script: "typecheck | test | bench:<name>",
          package_json_example: { typecheck: "tsc --noEmit", test: "bun test" },
          rationale: "没有 proposed runner 时，系统无法验证用户方法本身。",
          next_action: "补充 proposed 方法的最小可执行验证脚本。",
        },
      ]
    }
    return []
  })
  const finalBlocked = input.report.final_claims_allowed === false
  return {
    schema_version: "ExperimentProtocolGuidance.v1",
    created_at: input.now,
    status: suggestions.length > 0 ? "needs_protocol" : "complete",
    summary:
      suggestions.length > 0
        ? `发现 ${suggestions.length} 个实验协议缺口，需要补齐后再生成 final export。`
        : "实验协议已满足当前 final gate 要求。",
    final_export_blocked: finalBlocked,
    gaps: [...gaps],
    suggestions,
  }
}

function experimentProtocolStarterPack(input: {
  guidance: ExperimentProtocolGuidance
  topic: string
  now: string
}): ExperimentProtocolStarterPack | undefined {
  if (input.guidance.status !== "needs_protocol" || input.guidance.suggestions.length === 0) return undefined
  const metricName = "primary_metric"
  const baselineContent = [
    "import { writeFileSync } from 'node:fs'",
    "",
    "const result = {",
    "  schema_version: 'ExperimentResult.v1',",
    "  role: 'baseline',",
    "  metric: { name: 'primary_metric', value: 0, direction: 'higher_better' },",
    "  notes: 'Replace this toy baseline with the actual baseline method and dataset split.'",
    "}",
    "",
    "writeFileSync('reports/experiment-baseline.json', JSON.stringify(result, null, 2))",
    "console.log(JSON.stringify(result))",
  ].join("\n")
  const ablationContent = [
    "import { writeFileSync } from 'node:fs'",
    "",
    "const result = {",
    "  schema_version: 'ExperimentResult.v1',",
    "  role: 'ablation',",
    "  metric: { name: 'primary_metric', value: 0, direction: 'higher_better' },",
    "  removed_component: 'replace-with-core-component',",
    "  notes: 'Replace this with an ablation that removes one claimed contribution.'",
    "}",
    "",
    "writeFileSync('reports/experiment-ablation.json', JSON.stringify(result, null, 2))",
    "console.log(JSON.stringify(result))",
  ].join("\n")
  const dockerfileContent = [
    "FROM oven/bun:1",
    "WORKDIR /workspace",
    "COPY package.json bun.lock* ./",
    "RUN bun install --frozen-lockfile || bun install",
    "COPY . .",
    "CMD [\"bun\", \"run\", \"baseline:starter\"]",
  ].join("\n")
  const readmeContent = [
    `# Experiment Protocol Starter: ${input.topic}`,
    "",
    "PaperCode blocked final export because the repository does not yet expose a complete experiment protocol.",
    "",
    "Required fixes:",
    ...input.guidance.suggestions.map((item) => `- ${item.recommended_script}: ${item.next_action}`),
    "",
    "Minimum acceptance:",
    `- Proposed, baseline, and ablation commands must emit the same metric name: ${metricName}.`,
    "- Container reproduction must run without relying on local-only state.",
    "- Replace the toy values in these starter files with real benchmark results before rerunning PaperRun.",
  ].join("\n")
  const files: ExperimentProtocolStarterPack["files"] = [
    {
      path: "experiments/starter/baseline-starter.ts",
      purpose: "Baseline runner skeleton; replace toy metric with a real baseline evaluation.",
      content: baselineContent,
    },
    {
      path: "experiments/starter/ablation-starter.ts",
      purpose: "Ablation runner skeleton; remove one claimed component and report the same metric.",
      content: ablationContent,
    },
    {
      path: "experiments/starter/Dockerfile.repro",
      purpose: "Container reproduction skeleton for isolated final gate evidence.",
      content: dockerfileContent,
    },
    {
      path: "experiments/starter/README.md",
      purpose: "Human checklist for converting the starter pack into real experiments.",
      content: readmeContent,
    },
  ]
  return {
    schema_version: "ExperimentProtocolStarterPack.v1",
    created_at: input.now,
    status: "ready",
    summary: "已生成实验协议 starter pack；请复制模板到仓库并替换为真实 baseline、ablation 和容器复现实验。",
    package_json_scripts: {
      "baseline:starter": "bun run experiments/starter/baseline-starter.ts",
      "ablation:starter": "bun run experiments/starter/ablation-starter.ts",
      "repro:container:starter": "docker build -f experiments/starter/Dockerfile.repro -t papercode-repro . && docker run --rm papercode-repro",
    },
    files,
    next_steps: [
      "将 starter files 复制到目标仓库或用同等脚本替换。",
      "让 proposed、baseline、ablation 输出同名主指标。",
      "构建镜像后，在 experiments/protocol.json 登记绑定实验 ID 的 docker/podman run 命令；deep/submission/custom 档位才执行容器复现。",
      "重新启动 PaperRun，让 final gate 基于真实实验结果重新判断。",
    ],
  }
}

function starterFileMimeType(filePath: string) {
  if (filePath.endsWith(".ts")) return "text/typescript"
  if (filePath.endsWith(".md")) return "text/markdown"
  if (filePath.endsWith(".json")) return "application/json"
  if (filePath.toLowerCase().includes("dockerfile")) return "text/x-dockerfile"
  return "text/plain"
}

async function materializeExperimentProtocolStarterFiles(
  runDir: string,
  starterPack: ExperimentProtocolStarterPack,
  options?: ResearchRuntimeOptions,
) {
  const files: ExperimentProtocolStarterPack["files"] = []
  const artifactIds: string[] = []
  for (const file of starterPack.files) {
    const artifact = await writeResearchArtifact(
      runDir,
      {
        kind: "log",
        logical_path: file.path,
        data: file.content,
        mime_type: starterFileMimeType(file.path),
        metadata: {
          artifact_schema: "ExperimentProtocolStarterFile.v1",
          starter_pack_schema: starterPack.schema_version,
          starter_file_path: file.path,
          starter_file_purpose: file.purpose,
        },
      },
      options,
    )
    artifactIds.push(artifact.artifact_id)
    files.push({
      ...file,
      mime_type: artifact.mime_type,
      artifact_id: artifact.artifact_id,
      artifact_path: artifact.path,
    })
  }
  return {
    starterPack: {
      ...starterPack,
      files,
    },
    artifactIds,
  }
}

function runShellCommand(command: string, cwd: string, timeoutMs: number, env?: Record<string, string>) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean; wallTimeSeconds: number }>((resolve) => {
    const started = Date.now()
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      env: {
        ...process.env,
        ...env,
        CI: process.env.CI ?? "1",
        NO_COLOR: process.env.NO_COLOR ?? "1",
      },
    })
    let stdout = ""
    let stderr = ""
    const limit = 64_000
    const append = (current: string, chunk: Buffer) => (current + chunk.toString("utf8")).slice(-limit)
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk)
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk)
    })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, timeoutMs)
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({
        stdout,
        stderr,
        exitCode: timedOut ? 124 : code ?? 1,
        timedOut,
        wallTimeSeconds: Math.max(0, (Date.now() - started) / 1000),
      })
    })
    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({
        stdout,
        stderr: `${stderr}\n${error instanceof Error ? error.message : String(error)}`.trim(),
        exitCode: 127,
        timedOut,
        wallTimeSeconds: Math.max(0, (Date.now() - started) / 1000),
      })
    })
  })
}

function repositoryUrlFromPackage(value: unknown) {
  if (typeof value === "string") return cleanRepositoryUrl(value)
  if (typeof value === "object" && value !== null && "url" in value && typeof value.url === "string") {
    return cleanRepositoryUrl(value.url)
  }
  return undefined
}

function cleanRepositoryUrl(value: string) {
  const clean = value.trim().replace(/^git\+/, "").replace(/^git:\/\//, "https://").replace(/\.git$/, "")
  return clean || undefined
}

async function gitShortCommit(workspace: string) {
  const result = await runShellCommand("git rev-parse --short HEAD", workspace, 5_000)
  if (result.exitCode !== 0 || result.timedOut) return undefined
  return result.stdout.trim() || undefined
}

async function gitWorktreeDirty(workspace: string) {
  const result = await runShellCommand("git status --porcelain", workspace, 5_000)
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

async function workspaceCodeMetadata(request: ResearchIntakeRequest, options?: ResearchRuntimeOptions): Promise<CodeAvailabilityMetadata | undefined> {
  const workspace = request.workspace_path ?? options?.workspace
  if (!workspace) return undefined
  const packagePath = path.join(workspace, "package.json")
  const raw = await readFile(packagePath, "utf8").catch(() => undefined)
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
    version: await workspaceProductVersion(workspace, packageVersion, options?.workspace),
    commit_hash: await gitShortCommit(workspace),
    worktree_dirty: await gitWorktreeDirty(workspace),
    license: typeof parsed.license === "string" ? parsed.license : undefined,
  }
  return metadata.package_name || metadata.repository_url || metadata.version || metadata.commit_hash || typeof metadata.worktree_dirty === "boolean" || metadata.license ? metadata : undefined
}

function localCodeExperimentRunner(input: {
  request: ResearchIntakeRequest
  code: DefaultCodeAnalysisResult
  protocol?: ExperimentProtocol
}): ExperimentRunner | undefined {
  const protocol = input.protocol ?? experimentProtocolFromCode(input.code)
  const entry = protocol.entries.find((item) => item.role === "proposed")
  const command = entry ? parseScriptCommand(experimentCommandToShell(entry.command)) : undefined
  if (!entry || !command) return undefined
  const workspace = workspacePath(input.request)
  return async (spec, environment) => {
    const containerCommand = environment.mode === "container" ? selectContainerCommand(protocol, spec) : undefined
    const protocolEntry = environment.mode === "host"
      ? protocol.entries.find((item) => item.role === spec.role && (item.protocol_id === spec.experiment_id || item.label === spec.label))
      : undefined
    if (environment.mode === "container" && !containerCommand) {
      return {
        status: "environment_failed",
        metrics: [],
        stdout: "",
        stderr: "No experiment-bound container command is configured in experiments/protocol.json.",
        exit_code: 127,
        resource_usage: { wall_time_seconds: 0 },
      }
    }
    const shellCommand = containerCommand ? experimentCommandToShell(containerCommand) : protocolEntry ? experimentCommandToShell(protocolEntry.command) : spec.role === "proposed" ? command : undefined
    if (!shellCommand) {
      return {
        status: "environment_failed",
        metrics: [],
        stdout: "",
        stderr: `No local baseline runner is configured for ${spec.experiment_id}; baseline claims remain blocked until explicit benchmark evidence is supplied.`,
        exit_code: 127,
        resource_usage: { wall_time_seconds: 0 },
      }
    }
    const metricName = spec.expected_metric
    const actualCommand = containerCommand ?? protocolEntry?.command ?? spec.command
    const timeoutSeconds =
      environment.mode === "container"
        ? Math.min(actualCommand.timeout_seconds ?? 600, 600)
        : Math.min(actualCommand.timeout_seconds ?? 120, 120)
    const executionWorkspace = path.resolve(workspace, actualCommand.cwd ?? ".")
    const containerResult = environment.mode === "container"
      ? await executeContainerExperiment(actualCommand, executionWorkspace, timeoutSeconds * 1000)
      : undefined
    const result = containerResult ?? await executeHostExperiment(actualCommand, workspace, timeoutSeconds * 1000)
    const parsedMetrics = parseExperimentMetrics(result.stdout, spec, metricName)
    const metrics = parsedMetrics.length > 0 ? parsedMetrics : /^(typecheck_pass|lint_pass|container_reproduction_pass)$/.test(metricName)
      ? [{ name: metricName, value: result.exitCode === 0 ? 1 : 0, direction: "higher_better" as const, unit: "ratio" }]
      : []
    return {
      status: result.exitCode === 0 ? "succeeded" : result.timedOut ? "resource_exceeded" : "failed",
      command: actualCommand,
      metrics,
      execution: environment.mode === "container"
        ? containerResult?.execution
        : { kind: "process", command: actualCommand, exit_code: result.exitCode },
      stdout: `Local ${environment.mode} script ${protocolEntry?.label ?? entry.label}: ${shellCommand}\n${result.stdout}`.trim(),
      stderr: result.timedOut ? `Command timed out after ${result.wallTimeSeconds.toFixed(1)}s.\n${result.stderr}`.trim() : result.stderr,
      exit_code: result.exitCode,
      resource_usage: { wall_time_seconds: result.wallTimeSeconds },
    }
  }
}

function resolveInputPath(request: ResearchIntakeRequest, inputPath: string) {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(workspacePath(request), inputPath)
}

function isExperimentEvidenceManifest(value: unknown): value is ExperimentEvidenceManifest {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<ExperimentEvidenceManifest>
  return candidate.schema_version === "ExperimentEvidenceManifest.v1" && typeof candidate.metric_values === "object"
}

function isSourceCandidate(value: unknown): value is SourceCandidate {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<SourceCandidate>
  return (
    typeof candidate.source_id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.url === "string" &&
    typeof candidate.provider === "string" &&
    Boolean(candidate.license) &&
    Boolean(candidate.version) &&
    Boolean(candidate.verification)
  )
}

function isSourceEvidenceManifest(value: unknown): value is SourceEvidenceManifest {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<SourceEvidenceManifest>
  return candidate.schema_version === "SourceEvidenceManifest.v1" && Array.isArray(candidate.sources)
}

async function loadExperimentEvidenceManifest(
  runDir: string,
  request: ResearchIntakeRequest,
  options?: ResearchRuntimeOptions,
): Promise<ExperimentEvidenceManifest | undefined> {
  for (const inputPath of request.experiment_logs ?? []) {
    const resolved = resolveInputPath(request, inputPath)
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(resolved, "utf8"))
    } catch {
      continue
    }
    if (!isExperimentEvidenceManifest(parsed)) continue
    await writeResearchArtifact(
      runDir,
      {
        kind: "log",
        logical_path: `experiments/evidence/${path.basename(resolved)}`,
        data: parsed,
        metadata: {
          artifact_schema: "ExperimentEvidenceManifest.v1",
          source_path: resolved,
          provenance: parsed.provenance ?? "user_supplied_experiment_log",
        },
      },
      options,
    )
    await appendResearchEvent(
      runDir,
      {
        type: "experiments.evidencemanifest.loaded",
        actor: "system",
        payload: {
          source_path: resolved,
          provenance: parsed.provenance ?? "user_supplied_experiment_log",
          primary_metric: parsed.primary_metric,
        },
      },
      options,
    )
    return parsed
  }
  return undefined
}

async function loadSourceEvidenceManifest(
  runDir: string,
  request: ResearchIntakeRequest,
  options?: ResearchRuntimeOptions,
): Promise<SourceEvidenceManifest | undefined> {
  const inputPaths = [...(request.paper_files ?? []), ...(request.experiment_logs ?? [])]
  for (const inputPath of inputPaths) {
    const resolved = resolveInputPath(request, inputPath)
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(resolved, "utf8"))
    } catch {
      continue
    }
    if (!isSourceEvidenceManifest(parsed)) continue
    const sources = parsed.sources.filter(isSourceCandidate)
    const manifest: SourceEvidenceManifest = { ...parsed, sources }
    await writeResearchArtifact(
      runDir,
      {
        kind: "source_snapshot",
        logical_path: `sources/evidence/${path.basename(resolved)}`,
        data: manifest,
        metadata: {
          artifact_schema: "SourceEvidenceManifest.v1",
          source_path: resolved,
          provenance: manifest.provenance ?? "user_supplied_source_evidence",
        },
      },
      options,
    )
    await appendResearchEvent(
      runDir,
      {
        type: "sources.evidencemanifest.loaded",
        actor: "system",
        payload: {
          source_path: resolved,
          provenance: manifest.provenance ?? "user_supplied_source_evidence",
          source_count: sources.length,
          verified_source_count: sources.filter((source) => source.verification.status === "verified").length,
        },
      },
      options,
    )
    return manifest
  }
  return undefined
}

function verifiedClearSourceIds(sources: SourceRecord[]) {
  return sources
    .filter((source) => source.verification.status === "verified" && source.license.status === "clear")
    .map((source) => source.source_id)
}

function codeMethodClaimText(
  code: Awaited<ReturnType<typeof defaultCodeAnalysis>>,
  request: ResearchIntakeRequest,
) {
  const files = code.analysis.codebase_map.files
  const methods = code.analysis.method_extraction.methods
  const tests = code.analysis.experiment_surface.tests
  const runnables = code.analysis.experiment_surface.runnable_entries
  const primaryPaths = (request.code_paths ?? []).slice(0, 3).join(", ")
  const methodNames = methods.slice(0, 5).map((method) => `${method.name}(${method.source_range.path}:${method.source_range.start_line})`)
  const runnableNames = runnables.slice(0, 4).map((entry) => entry.name)
  const parts = [
    `对提交代码库的 ${files.length} 个文件进行 source-range-grounded 分析，覆盖 ${primaryPaths || "用户授权路径"}。`,
  ]
  if (methods.length > 0) {
    parts.push(`系统抽取到 ${methods.length} 个导出方法/类表面，其中包括 ${methodNames.join(", ")}。`)
    const methodSummaries = methods
      .slice(0, 5)
      .map((method) => method.summary)
      .filter((summary) => summary.includes(" returns "))
    if (methodSummaries.length > 0) {
      parts.push(`方法摘要：${methodSummaries.join(" ")}`)
    }
  }
  if (tests.length > 0 || runnables.length > 0) {
    parts.push(
      `实验入口包含 ${tests.length} 个测试文件和 ${runnables.length} 个 package script${runnableNames.length > 0 ? `（${runnableNames.join(", ")}）` : ""}。`,
    )
  }
  parts.push("这些结论仅绑定本地哈希、文件路径和 source range，不把未执行的性能结果写成最终 claim。")
  return parts.join(" ")
}

async function localCodeSourceRecords(runDir: string, options?: ResearchRuntimeOptions): Promise<SourceRecord[]> {
  const now = nowIso(options)
  const sources = await readJsonlFacts(runDir, "source")
  return sources
    .filter((source) => source.kind === "code")
    .map((source) => ({
      schema_version: "SourceRecord.v1" as const,
      source_id: source.source_id,
      kind: source.kind,
      title: source.title,
      url: source.locator?.path ? `file://${source.locator.path.replace(/\\/g, "/")}` : `file://${source.title}`,
      provider: "papercode-local-workspace",
      license: { status: "clear" as const, expression: "workspace-authorized local source" },
      version: {
        value: typeof source.metadata?.sha256 === "string" ? source.metadata.sha256 : undefined,
        retrieved_at: source.created_at,
        hash: typeof source.metadata?.sha256 === "string" ? source.metadata.sha256 : undefined,
      },
      verification: {
        status: "verified" as const,
        method: "local-workspace-hash-and-source-range",
        checked_at: now,
        diagnostics: [],
      },
      retrieved_at: source.created_at,
    }))
}

function metricDirection(plan: ExperimentPlan, metricName: string, evidence: ExperimentEvidenceManifest): ExperimentMetricDirection {
  return evidence.metric_direction ?? plan.metrics.find((metric) => metric.name === metricName)?.direction ?? "higher_better"
}

function evidenceMetricValue(evidence: ExperimentEvidenceManifest, spec: Parameters<ExperimentRunner>[0], mode: "host" | "container") {
  const values = evidence.metric_values ?? {}
  return values[`${mode}:${spec.experiment_id}`] ?? (mode === "host" ? values[spec.experiment_id] : undefined)
}

function experimentEvidenceRunner(plan: ExperimentPlan, evidence: ExperimentEvidenceManifest, mode: "host" | "container"): ExperimentRunner {
  return (spec) => {
    const metricName = evidence.primary_metric ?? plan.metrics.find((metric) => metric.primary)?.name ?? spec.expected_metric
    const value = evidenceMetricValue(evidence, spec, mode)
    if (mode === "container" || typeof value !== "number" || !Number.isFinite(value)) {
      return {
        status: "environment_failed",
        metrics: [],
        stdout: "",
        stderr: mode === "container"
          ? "Imported metrics are observations, not verified container executions."
          : `Experiment evidence manifest is missing ${mode} metric value for ${spec.experiment_id}.`,
        exit_code: 2,
        resource_usage: { wall_time_seconds: 0 },
      }
    }
    return {
      status: "succeeded",
      metrics: [{ name: metricName, value, direction: metricDirection(plan, metricName, evidence) }],
      stdout: evidence.stdout ?? `Imported ${mode} observation from ExperimentEvidenceManifest.v1.`,
      execution: { kind: "imported" },
      stderr: "",
      exit_code: 0,
      resource_usage: { wall_time_seconds: 0 },
    }
  }
}

async function defaultExperimentLoop(
  runDir: string,
  request: ResearchIntakeRequest,
  options?: ResearchRuntimeOptions,
): Promise<DefaultExperimentLoopResult> {
  const cache = defaultCache(runDir)
  if (cache.experiment) return cache.experiment
  const sources = await defaultSourceDiscovery(runDir, request, options)
  const evidence = await loadExperimentEvidenceManifest(runDir, request, options)
  const code = !evidence && (request.code_paths ?? []).length > 0 ? await defaultCodeAnalysis(runDir, request, options) : undefined
  const protocol = code ? await loadExperimentProtocol(workspacePath(request)) ?? experimentProtocolFromCode(code) : undefined
  const proposedProtocol = protocol?.entries.find((entry) => entry.role === "proposed")
  const baselines = protocol?.entries.filter((entry) => entry.role === "baseline") ?? []
  const ablations = protocol?.entries.filter((entry) => entry.role === "ablation") ?? []
  const plan = planExperiments({
    topic: normalizeResearchIntake(request).topic,
    method_name: methodName(request),
    dataset_ids: sources.data_plan.datasets.map((dataset) => dataset.dataset_id),
    objective: "Create a reproducible evaluation plan before allowing final paper claims.",
    primary_metric: primaryExperimentMetric(request, evidence, proposedProtocol?.expected_metric),
    metric_direction: evidence?.metric_direction ?? protocol?.metric_direction,
    proposed_id: proposedProtocol?.protocol_id,
    proposed_command: proposedProtocol?.command,
    baseline_specs: protocol && baselines.length > 0
      ? baselines.map((entry) => ({
          experiment_id: entry.protocol_id,
          label: entry.label,
          command: entry.command,
          rationale: entry.rationale,
        }))
      : evidence?.experiments?.filter((item) => item.role === "baseline").map((item) => ({ ...item, command: { argv: [] } })) ?? [],
    ablation_specs: protocol && ablations.length > 0
      ? ablations.map((entry) => ({
          experiment_id: entry.protocol_id,
          label: entry.label,
          command: entry.command,
          rationale: entry.rationale,
        }))
      : evidence?.experiments?.filter((item) => item.role === "ablation").map((item) => ({ ...item, command: { argv: [] } })) ?? [],
    include_default_baselines: false,
    now: nowIso(options),
  })
  if (protocol) {
    await writeResearchArtifact(
      runDir,
      {
        kind: "log",
        logical_path: "experiments/experiment-protocol.json",
        data: protocol,
        metadata: { artifact_schema: "ExperimentProtocol.v1" },
      },
      options,
    )
  }
  const localRunner = code ? automaticCodeExperimentRunner({ request, code, protocol }) : undefined
  const loop = await recordExperimentLoop(
    runDir,
    {
      plan,
      host_runner: evidence
        ? experimentEvidenceRunner(plan, evidence, "host")
        : localRunner ?? defaultExperimentRunner("no approved experiment command or container runner was attached to this PaperRun"),
      container_runner: evidence
        ? experimentEvidenceRunner(plan, evidence, "container")
        : localRunner ?? defaultExperimentRunner("host exploration did not produce runnable successful experiments"),
      container_reproduction: budgetTierPolicy((await loadResearchRun(runDir)).metadata?.paper_budget_tier as BudgetTier || "standard").container_reproduction,
      run_options: {
        now: nowIso(options),
        container_image: evidence?.container_image,
        container_digest: evidence?.container_digest,
      },
    },
    options,
  )
  const guidance = experimentProtocolGuidance({ protocol, report: loop.report, now: nowIso(options) })
  const guidanceArtifact =
    guidance.status === "needs_protocol"
      ? await writeResearchArtifact(
          runDir,
          {
            kind: "log",
            logical_path: "experiments/experiment-protocol-guidance.json",
            data: guidance,
            metadata: { artifact_schema: "ExperimentProtocolGuidance.v1" },
          },
          options,
        )
      : undefined
  const starterPackDraft = experimentProtocolStarterPack({ guidance, topic: request.topic, now: nowIso(options) })
  const materializedStarterPack =
    starterPackDraft && starterPackDraft.status === "ready"
      ? await materializeExperimentProtocolStarterFiles(runDir, starterPackDraft, options)
      : undefined
  const starterPack = materializedStarterPack?.starterPack ?? starterPackDraft
  const starterPackArtifact =
    starterPack && starterPack.status === "ready"
      ? await writeResearchArtifact(
          runDir,
          {
            kind: "log",
            logical_path: "experiments/experiment-protocol-starter-pack.json",
            data: starterPack,
            metadata: { artifact_schema: "ExperimentProtocolStarterPack.v1" },
          },
          options,
        )
      : undefined
  cache.experiment = {
    sources,
    plan,
    protocol,
    guidance,
    guidance_artifact_id: guidanceArtifact?.artifact_id,
    starter_pack: starterPack,
    starter_pack_artifact_id: starterPackArtifact?.artifact_id,
    starter_pack_file_artifact_ids: materializedStarterPack?.artifactIds ?? [],
    loop,
  }
  return cache.experiment
}

async function defaultClaimLedger(
  runDir: string,
  request: ResearchIntakeRequest,
  options?: ResearchRuntimeOptions,
): Promise<{ ledger: ClaimLedger; literatureMap: LiteratureMap; sourceIds: string[]; sourceRecords: SourceRecord[]; evidenceArtifactIds: string[] }> {
  const cache = defaultCache(runDir)
  if (cache.claims) return cache.claims
  const sources = await defaultSourceDiscovery(runDir, request, options)
  const code = (request.code_paths ?? []).length > 0 ? await defaultCodeAnalysis(runDir, request, options) : undefined
  const codeSourceRecords = code ? await localCodeSourceRecords(runDir, options) : []
  const sourceRecords = [...sources.literature.sources, ...codeSourceRecords]
  const sourceIds = [...verifiedClearSourceIds(sources.literature.sources), ...codeSourceRecords.map((source) => source.source_id)]
  const methodSourceIds = codeSourceRecords.length > 0 ? codeSourceRecords.map((source) => source.source_id) : sourceIds
  const evidenceArtifactIds = [
    sources.artifacts.literature.artifact_id,
    sources.artifacts.data_plan.artifact_id,
    ...(code?.artifacts.map((artifact) => artifact.artifact_id) ?? []),
  ]
  const ledger = composeClaimLedger({
    topic: normalizeResearchIntake(request).topic,
    claims: [
      {
        section_id: "method",
        text:
          code
            ? codeMethodClaimText(code, request)
            : "The submitted topic has an initial research direction that requires verified literature and reproduction before final claims.",
        confidence: methodSourceIds.length > 0 && evidenceArtifactIds.length > 0 ? 0.65 : 0.25,
        source_ids: methodSourceIds.slice(0, 3),
        artifact_ids: evidenceArtifactIds,
      },
    ],
    now: nowIso(options),
  })
  cache.claims = { ledger, literatureMap: sources.literature, sourceIds, sourceRecords, evidenceArtifactIds }
  return cache.claims
}

async function defaultResultReport(
  runDir: string,
  request: ResearchIntakeRequest,
  options?: ResearchRuntimeOptions,
): Promise<{
  dataPlan: DataPlan
  literatureMap: LiteratureMap
  experimentPlan: ExperimentPlan
  experimentProtocol?: ExperimentProtocol
  experimentGuidance?: ExperimentProtocolGuidance
  experimentStarterPack?: ExperimentProtocolStarterPack
  experimentRuns: Pick<Awaited<ReturnType<typeof recordExperimentLoop>>, "host_runs" | "container_runs">
  resultReport: ResultReport
  sourceIds: string[]
  sourceRecords: SourceRecord[]
  evidenceArtifactIds: string[]
}> {
  const cache = defaultCache(runDir)
  if (cache.result) return cache.result
  const claims = await defaultClaimLedger(runDir, request, options)
  const experiment = await defaultExperimentLoop(runDir, request, options)
  cache.result = {
    dataPlan: experiment.sources.data_plan,
    literatureMap: claims.literatureMap,
    experimentPlan: experiment.plan,
    experimentProtocol: experiment.protocol,
    experimentGuidance: experiment.guidance,
    experimentStarterPack: experiment.starter_pack,
    experimentRuns: {
      host_runs: experiment.loop.host_runs,
      container_runs: experiment.loop.container_runs,
    },
    resultReport: experiment.loop.report,
    sourceIds: claims.sourceIds,
    sourceRecords: claims.sourceRecords,
    evidenceArtifactIds: [
      ...claims.evidenceArtifactIds,
      experiment.loop.artifacts.result_report.artifact_id,
      ...(experiment.guidance_artifact_id ? [experiment.guidance_artifact_id] : []),
      ...(experiment.starter_pack_file_artifact_ids ?? []),
      ...(experiment.starter_pack_artifact_id ? [experiment.starter_pack_artifact_id] : []),
    ],
  }
  return cache.result
}

/** Compose with the caller's declarations and section overrides so stage artifacts match the manuscript. */
function requestDraft(input: Parameters<typeof composeDraftPaper>[0], request: ResearchIntakeRequest) {
  const composed = composeDraftPaper({ ...input, declarations: request.declarations })
  return request.draft_sections?.length ? applySectionOverrides(composed, request.draft_sections) : composed
}

async function defaultAuthoring(runDir: string, request: ResearchIntakeRequest, options?: ResearchRuntimeOptions) {
  const cache = defaultCache(runDir)
  if (cache.authoring) return cache.authoring
  const claims = await defaultClaimLedger(runDir, request, options)
  const result = await defaultResultReport(runDir, request, options)
  const codeMetadata = await workspaceCodeMetadata(request, options)
  cache.authoring = await runPaperAuthoringLoop(
    runDir,
    {
      title: normalizeResearchIntake(request).topic,
      ledger: claims.ledger,
      literature_map: result.literatureMap,
      data_plan: result.dataPlan,
      experiment_plan: result.experimentPlan,
      experiment_protocol: result.experimentProtocol,
      experiment_guidance: result.experimentGuidance,
      experiment_starter_pack: result.experimentStarterPack,
      experiment_runs: result.experimentRuns,
      result_report: result.resultReport,
      code_metadata: codeMetadata,
      available_source_ids: result.sourceIds,
      source_records: result.sourceRecords,
      model_reviews: [
        {
          model: "papercode-default-reviewer",
          verdict: "warn",
          message: "Default reviewer requires live literature verification and passed reproduction before final export.",
        },
      ],
      target_profile: targetProfile(request),
      section_overrides: request.draft_sections,
      declarations: request.declarations,
      code_artifact_ids: result.evidenceArtifactIds,
      source_artifact_ids: result.evidenceArtifactIds,
      now: nowIso(options),
    },
    options,
  )
  return cache.authoring
}

const DEFAULT_STAGE_HANDLERS: Partial<Record<PaperResearchStageId, PaperStageHandler>> = {
  intake: async ({ run_dir, request, options }) => {
    const result = await recordResearchIntake(run_dir, request, options)
    const workspace = request.workspace_path
    if (workspace) {
      const materialIndex = await indexResearchMaterials({
        workspace_path: workspace,
        code_paths: request.code_paths,
        paper_files: request.paper_files,
        dataset_paths: request.dataset_paths,
        experiment_logs: request.experiment_logs,
        now: nowIso(options),
      })
      await recordMaterialIndex(run_dir, materialIndex, options)
    }
    return {
      status: "succeeded",
      summary: `Research intake recorded for ${result.brief.workflow}.`,
      artifact: {
        logical_path: "paper-orchestrator/intake.json",
        schema: "ResearchBrief.v1",
        data: result.brief,
      },
    }
  },
  planning: async ({ run_dir, request, options }) => {
    const brief = normalizeResearchIntake(request)
    const artifact = await writeStageLog(
      run_dir,
      {
        logical_path: "paper-orchestrator/planning.json",
        schema: "ResearchRunGraph.v1",
        data: {
          schema_version: "ResearchRunGraph.v1",
          topic: brief.topic,
          workflow: brief.workflow,
          stages: PAPER_RESEARCH_STAGE_GRAPH.stages,
          pause_policy:
            "Proceed automatically; pause only for missing tools, cost, source/license conflict, authenticity failure, reproduction failure, or permission risk.",
        },
      },
      options,
    )
    return {
      status: "succeeded",
      summary: `Planned ${PAPER_RESEARCH_STAGE_GRAPH.stages.length} paper stages for ${brief.workflow}.`,
      artifact: {
        logical_path: "paper-orchestrator/planning-summary.json",
        schema: "ResearchRunGraph.v1",
        data: { planning_artifact_id: artifact.artifact_id },
      },
    }
  },
  literature: async ({ run_dir, run_id, request, options }) => {
    const discovered = await defaultSourceDiscovery(run_dir, request, options)
    const novelty = await recordNoveltyCheckpoint(
      run_dir,
      {
        run_id,
        request,
        stage: "literature",
        sources: discovered.literature.sources,
      },
      options,
    )
    await recordResearchWiki(
      run_dir,
      {
        run_id,
        request,
        novelty: novelty.checkpoint,
        artifact_ids: [novelty.artifact.artifact_id, discovered.artifacts.literature.artifact_id],
      },
      options,
    )
    return {
      status: "succeeded",
      summary: `Recorded ${discovered.literature.sources.length} literature seed(s); novelty status is ${novelty.checkpoint.status}.`,
    }
  },
  code_analysis: async ({ run_dir, request, options }) => {
    let code: Awaited<ReturnType<typeof defaultCodeAnalysis>>
    try {
      code = await defaultCodeAnalysis(run_dir, request, options)
    } catch (error) {
      return {
        block: {
          reason: "safety_or_permission",
          message: `Code analysis could not read the requested paths: ${error instanceof Error ? error.message : String(error)}`,
        },
      }
    }
    return {
      status: "succeeded",
      summary: `Recorded ${code.analysis.codebase_map.files.length} code file(s) and ${code.analysis.method_extraction.methods.length} method surface(s).`,
    }
  },
  data: async ({ run_dir, request, options }) => {
    const discovered = await defaultSourceDiscovery(run_dir, request, options)
    return {
      status: "succeeded",
      summary: `Recorded ${discovered.data_plan.datasets.length} dataset candidate(s); recommendation is ${discovered.data_plan.recommendation}.`,
    }
  },
  experiment_design: async ({ run_dir, run_id, request, options }) => {
    const sources = await defaultSourceDiscovery(run_dir, request, options)
    const novelty = await recordNoveltyCheckpoint(
      run_dir,
      {
        run_id,
        request,
        stage: "experiment_design",
        sources: sources.literature.sources,
      },
      options,
    )
    const noveltyGate = await recordExperimentNoveltyGate(run_dir, novelty.checkpoint, options)
    if (noveltyGate.gate.status === "redirect_required" || noveltyGate.gate.status === "blocked") {
      return {
        block: {
          reason: "license_or_source_conflict",
          message: `查新 gate 阻断实验设计：${noveltyGate.gate.reason}`,
        },
      }
    }
    const code = (request.code_paths ?? []).length > 0 ? await defaultCodeAnalysis(run_dir, request, options) : undefined
    const protocol = code ? experimentProtocolFromCode(code) : undefined
    const proposedProtocol = protocol?.entries.find((entry) => entry.role === "proposed")
    const baselines = protocol?.entries.filter((entry) => entry.role === "baseline") ?? []
    const ablations = protocol?.entries.filter((entry) => entry.role === "ablation") ?? []
    const plan = planExperiments({
      topic: normalizeResearchIntake(request).topic,
      method_name: methodName(request),
      dataset_ids: sources.data_plan.datasets.map((dataset) => dataset.dataset_id),
      objective: "Create a reproducible evaluation plan before allowing final paper claims.",
      primary_metric: primaryExperimentMetric(request, undefined, proposedProtocol?.expected_metric),
      proposed_command: proposedProtocol?.command,
      baseline_specs: protocol
        ? baselines.map((entry) => ({
            experiment_id: entry.protocol_id,
            label: entry.label,
            command: entry.command,
            rationale: entry.rationale,
          }))
        : undefined,
      ablation_specs: protocol
        ? ablations.map((entry) => ({
            experiment_id: entry.protocol_id,
            label: entry.label,
            command: entry.command,
            rationale: entry.rationale,
          }))
        : undefined,
      include_default_baselines: !code,
      now: nowIso(options),
    })
    await writeStageLog(
      run_dir,
      {
        logical_path: "experiments/experiment-plan-stage.json",
        schema: "ExperimentPlan.v1",
        data: plan,
      },
      options,
    )
    return {
      status: "succeeded",
      summary: `Planned ${1 + plan.baselines.length + plan.ablations.length} experiment spec(s); novelty gate is ${noveltyGate.gate.status}.`,
    }
  },
  experiment_execution: async ({ run_dir, request, options }) => {
    const experiment = await defaultExperimentLoop(run_dir, request, options)
    return {
      status: "succeeded",
      summary: `Recorded host exploration with recommendation ${experiment.loop.report.recommendation}.`,
    }
  },
  reproduction: async ({ run_dir, request, options }) => {
    const experiment = await defaultExperimentLoop(run_dir, request, options)
    await writeStageLog(
      run_dir,
      {
        logical_path: "experiments/reproduction-gate-stage.json",
        schema: "ResultReport.v1",
        data: experiment.loop.report,
      },
      options,
    )
    return {
      status: "succeeded",
      summary: `Reproduction gate is ${experiment.loop.report.reproduction.status}; final claims allowed: ${experiment.loop.report.final_claims_allowed}.`,
    }
  },
  claim_ledger: async ({ run_dir, run_id, request, options }) => {
    const claims = await defaultClaimLedger(run_dir, request, options)
    const sources = await defaultSourceDiscovery(run_dir, request, options)
    const novelty = await recordNoveltyCheckpoint(
      run_dir,
      {
        run_id,
        request,
        stage: "claim_ledger",
        sources: sources.literature.sources,
      },
      options,
    )
    const spine = await recordPaperSpineAndFigure(
      run_dir,
      {
        run_id,
        request,
        novelty: novelty.checkpoint,
        claims: claims.ledger,
        sources: sources.literature.sources,
      },
      options,
    )
    await writeStageLog(
      run_dir,
      {
        logical_path: "writing/claim-ledger-stage.json",
        schema: "ClaimLedger.v1",
        data: claims.ledger,
      },
      options,
    )
    return {
      status: "succeeded",
      summary: `Prepared ${claims.ledger.entries.length} claim ledger entr${claims.ledger.entries.length === 1 ? "y" : "ies"}; PaperSpine is ${spine.spine.readiness}.`,
    }
  },
  drafting: async ({ run_dir, request, options }) => {
    const claims = await defaultClaimLedger(run_dir, request, options)
    const result = await defaultResultReport(run_dir, request, options)
    const codeMetadata = await workspaceCodeMetadata(request, options)
    const draft = requestDraft({
      title: normalizeResearchIntake(request).topic,
      ledger: claims.ledger,
      literature_map: result.literatureMap,
      data_plan: result.dataPlan,
      experiment_plan: result.experimentPlan,
      experiment_protocol: result.experimentProtocol,
      experiment_guidance: result.experimentGuidance,
      experiment_runs: result.experimentRuns,
      result_report: result.resultReport,
      code_metadata: codeMetadata,
      now: nowIso(options),
    }, request)
    await writeStageLog(
      run_dir,
      {
        logical_path: "writing/draft-stage.json",
        schema: "DraftPaper.v1",
        data: draft,
      },
      options,
    )
    return {
      status: "succeeded",
      summary: `Prepared Markdown draft ${draft.draft_id}.`,
    }
  },
  profile_formatting: async ({ run_dir, request, options }) => {
    const registry = createPaperProfileRegistry(defaultPaperProfiles())
    const selection = resolvePaperProfileSelection({
      target_profile: request.target_profile,
      target_journal: request.target_journal,
      target_journal_url: request.target_journal_url,
    })
    const check = registry.check(selection.profile_id, {
      sections: ["abstract", "introduction", "methods", "results"],
      statements: ["data-availability", "code-availability"],
      artifacts: ["references"],
    })
    if (selection.generated_profile || selection.profile_id === "custom-journal") {
      await writeStageLog(
        run_dir,
        {
          logical_path: "profiles/generated-journal-profile-stage.json",
          schema: "PaperGeneratedJournalProfile.v1",
          data:
            selection.generated_profile ??
            createGeneratedJournalProfileDraft({
              journal_name: request.target_journal ?? "自定义期刊",
              official_url: request.target_journal_url,
              now: nowIso(options),
            }),
        },
        options,
      )
    }
    await writeStageLog(
      run_dir,
      {
        logical_path: "profiles/profile-check-stage.json",
        schema: "PaperProfileCheck.v1",
        data: check,
      },
      options,
    )
    return {
      status: "succeeded",
      summary: `Profile ${check.profile_id} check is ${check.status}.`,
    }
  },
  verification: async ({ run_dir, request, options }) => {
    const authoring = await defaultAuthoring(run_dir, request, options)
    return {
      status: "succeeded",
      summary: `Authenticity gate ${authoring.verification.blocking_report.status}; final export blocked: ${authoring.final_export_blocked}.`,
    }
  },
  revision: async ({ run_dir, request, options }) => {
    const claims = await defaultClaimLedger(run_dir, request, options)
    const result = await defaultResultReport(run_dir, request, options)
    const codeMetadata = await workspaceCodeMetadata(request, options)
    const draft = requestDraft({
      title: normalizeResearchIntake(request).topic,
      ledger: claims.ledger,
      data_plan: result.dataPlan,
      literature_map: result.literatureMap,
      experiment_plan: result.experimentPlan,
      experiment_protocol: result.experimentProtocol,
      experiment_guidance: result.experimentGuidance,
      experiment_runs: result.experimentRuns,
      result_report: result.resultReport,
      code_metadata: codeMetadata,
      now: nowIso(options),
    }, request)
    await writeStageLog(
      run_dir,
      {
        logical_path: "writing/revision-stage.json",
        schema: "DraftRevision.v1",
        data: {
          schema_version: "DraftRevision.v1",
          created_at: nowIso(options),
          previous_markdown: draft.markdown,
          next_markdown: draft.markdown,
          diff: "No manual guidance was supplied; revision is a checkpoint copy.",
          rollback_token: "default-revision-checkpoint",
        },
      },
      options,
    )
    return {
      status: "succeeded",
      summary: "Recorded revision checkpoint.",
    }
  },
  export: async ({ run_dir, request, options }) => {
    const authoring = await defaultAuthoring(run_dir, request, options)
    return {
      status: "succeeded",
      summary: `Recorded ${authoring.export.bundle.status} bundle ${authoring.export.bundle.bundle_id}.`,
    }
  },
}

async function writeSnapshot(runDir: string, snapshot: PaperResearchRunSnapshot, options?: ResearchRuntimeOptions) {
  return writeResearchArtifact(
    runDir,
    {
      kind: "log",
      logical_path: "paper-orchestrator/state.json",
      data: snapshot,
      metadata: { artifact_schema: "ResearchRunController.v1" },
    },
    options,
  )
}

async function writeBlockedDiagnostic(
  runDir: string,
  input: {
    run_id: string
    stage: PaperResearchStageId
    block: NonNullable<PaperStageHandlerResult["block"]>
  },
  options?: ResearchRuntimeOptions,
) {
  return writeResearchArtifact(
    runDir,
    {
      kind: "log",
      logical_path: `paper-orchestrator/blocked/${input.stage}.json`,
      data: {
        schema_version: "BlockedDiagnostic.v1",
        run_id: input.run_id,
        stage: input.stage,
        ...input.block,
      },
      metadata: { artifact_schema: "BlockedDiagnostic.v1" },
    },
    options,
  )
}

export async function startPaperResearchRun(
  input: StartPaperResearchRunInput,
  options?: ResearchRuntimeOptions,
): Promise<PaperResearchRunSnapshot> {
  const run = await import("./research/runtime").then((runtime) => runtime.loadResearchRun(input.run_dir))
  const capabilities = input.capabilities ?? createResearchCapabilityRegistry(defaultResearchCapabilities())
  let snapshot: PaperResearchRunSnapshot = {
    schema_version: "ResearchRunController.v1",
    run_id: run.run_id,
    graph: PAPER_RESEARCH_STAGE_GRAPH,
    stages: initialStages(),
    paused: false,
    updated_at: nowIso(options),
  }

  await appendResearchEvent(
    input.run_dir,
    { type: "paperorchestrator.started", actor: "system", payload: { graph: PAPER_RESEARCH_STAGE_GRAPH } },
    options,
  )

  const maxStages = input.max_stages ?? PAPER_RESEARCH_STAGE_GRAPH.stages.length
  for (let count = 0; count < maxStages; count++) {
    const stage = nextRunnableStage(snapshot.stages)
    if (!stage) break
    const startedAt = nowIso(options)
    snapshot = {
      ...snapshot,
      stages: updateStage(snapshot.stages, stage.id, { status: "running", started_at: startedAt }),
      updated_at: startedAt,
    }
    await appendResearchEvent(
      input.run_dir,
      { type: "paperorchestrator.stage.started", actor: "system", payload: { stage: stage.id } },
      options,
    )

    const handler = input.handlers?.[stage.id] ?? defaultHandlerFor(stage.id)
    const result = await handler({
      run_dir: input.run_dir,
      run_id: run.run_id,
      stage: stage.id,
      request: input.request,
      capabilities,
      options,
    })

    if (result.block) {
      const diagnostic = await writeBlockedDiagnostic(input.run_dir, { run_id: run.run_id, stage: stage.id, block: result.block }, options)
      const updatedAt = nowIso(options)
      snapshot = {
        ...snapshot,
        paused: true,
        pause: {
          stage: stage.id,
          reason: result.block.reason,
          message: result.block.message,
          diagnostic_artifact_id: diagnostic.artifact_id,
        },
        stages: updateStage(snapshot.stages, stage.id, {
          status: "blocked",
          block_reason: result.block.reason,
          summary: result.block.message,
        }),
        updated_at: updatedAt,
      }
      await appendResearchEvent(
        input.run_dir,
        {
          type: "paperorchestrator.stage.blocked",
          actor: "system",
          payload: { stage: stage.id, ...result.block, diagnostic_artifact_id: diagnostic.artifact_id },
        },
        options,
      )
      break
    }

    if (result.artifact) {
      await writeResearchArtifact(
        input.run_dir,
        {
          kind: "log",
          logical_path: result.artifact.logical_path,
          data: result.artifact.data,
          metadata: { artifact_schema: result.artifact.schema ?? stage.artifact_schema },
        },
        options,
      )
    }
    const completedAt = nowIso(options)
    snapshot = {
      ...snapshot,
      stages: updateStage(snapshot.stages, stage.id, {
        status: result.status ?? "succeeded",
        completed_at: completedAt,
        summary: result.summary,
      }),
      updated_at: completedAt,
    }
    await appendResearchEvent(
      input.run_dir,
      {
        type: "paperorchestrator.stage.completed",
        actor: "system",
        payload: { stage: stage.id, status: result.status ?? "succeeded" },
      },
      options,
    )
  }

  await writeSnapshot(input.run_dir, snapshot, options)
  defaultExecutionCache.delete(input.run_dir)
  return snapshot
}
