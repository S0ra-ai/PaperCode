import {
  appendResearchEvent,
  writeResearchArtifact,
  type ResearchRuntimeOptions,
} from "./research/runtime"
import type { ResearchArtifact } from "./research/contracts"
import { createResearchCapabilityRegistry, defaultResearchCapabilities, type ResearchCapabilityRegistry } from "./capabilities"
import { normalizeResearchIntake, recordResearchIntake, type ResearchIntakeRequest } from "./intake"
import { analyzeCodebaseForPaper, recordCodeToPaperArtifacts, type CodeToPaperAnalysis } from "./code-to-paper"
import { runPaperAuthoringLoop } from "./authoring"
import { createPaperProfileRegistry, defaultPaperProfiles, type PaperProfileId } from "./profiles"
import { indexResearchMaterials, recordMaterialIndex } from "./material-index"
import { discoverAndRecordLiteratureData } from "./research/sources"
import { planExperiments } from "./research/experiments/planning"
import { recordExperimentLoop } from "./research/experiments/recording"
import { composeClaimLedger, composeDraftPaper } from "./research/writing"
import type { DataPlan } from "./research/sources"
import type { ResultReport, ExperimentPlan, ExperimentRunner } from "./research/experiments"
import type { ClaimLedger } from "./research/writing"

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
        message: `Stage ${stage} has required capabilities but no concrete paper_fucker handler is implemented yet for ${brief.workflow}.`,
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
  const profile = request.target_profile
  if (
    profile === "nature-paper" ||
    profile === "ieee-paper" ||
    profile === "acm-paper" ||
    profile === "springer-paper" ||
    profile === "generic-preprint"
  ) {
    return profile
  }
  return "generic-preprint"
}

let defaultDiscoverySequence = 0

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
  loop: Awaited<ReturnType<typeof recordExperimentLoop>>
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

async function defaultSourceDiscovery(runDir: string, request: ResearchIntakeRequest, options?: ResearchRuntimeOptions) {
  const cache = defaultCache(runDir)
  if (cache.source) return cache.source
  const brief = normalizeResearchIntake(request)
  const now = nowIso(options)
  const sequence = ++defaultDiscoverySequence
  cache.source = await discoverAndRecordLiteratureData(
    runDir,
    {
      topic: brief.topic,
      full_access: false,
      literature_candidates: [
        {
          source_id: `paper:${slug(brief.topic)}:seed:${sequence}`,
          kind: "paper",
          title: `${brief.topic} source discovery seed ${sequence}`,
          url: `https://arxiv.org/search/?query=${encodeURIComponent(brief.topic)}`,
          provider: "paper_fucker-default-source-discovery",
          license: { status: "clear", expression: "arXiv non-exclusive distribution" },
          version: { value: "search-seed", retrieved_at: now },
          verification: {
            status: "unverified",
            method: "default-source-seed",
            checked_at: now,
            diagnostics: ["Live source verification has not been completed; final claims stay gated."],
          },
          topics: [brief.topic],
        },
      ],
      min_verified_sources: 1,
      now,
    },
    options,
  )
  return cache.source
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
  if ((request.code_paths ?? []).length > 0) return "Code-grounded paper_fucker workflow"
  return "Evidence-led paper_fucker workflow"
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

async function defaultExperimentLoop(
  runDir: string,
  request: ResearchIntakeRequest,
  options?: ResearchRuntimeOptions,
): Promise<DefaultExperimentLoopResult> {
  const cache = defaultCache(runDir)
  if (cache.experiment) return cache.experiment
  const sources = await defaultSourceDiscovery(runDir, request, options)
  const plan = planExperiments({
    topic: normalizeResearchIntake(request).topic,
    method_name: methodName(request),
    dataset_ids: sources.data_plan.datasets.map((dataset) => dataset.dataset_id),
    objective: "Create a reproducible evaluation plan before allowing final paper claims.",
    now: nowIso(options),
  })
  const loop = await recordExperimentLoop(
    runDir,
    {
      plan,
      host_runner: defaultExperimentRunner("no approved experiment command or container runner was attached to this PaperRun"),
      container_runner: defaultExperimentRunner("host exploration did not produce runnable successful experiments"),
      run_options: { now: nowIso(options) },
    },
    options,
  )
  cache.experiment = { sources, plan, loop }
  return cache.experiment
}

async function defaultClaimLedger(
  runDir: string,
  request: ResearchIntakeRequest,
  options?: ResearchRuntimeOptions,
): Promise<{ ledger: ClaimLedger; sourceIds: string[]; evidenceArtifactIds: string[] }> {
  const cache = defaultCache(runDir)
  if (cache.claims) return cache.claims
  const sources = await defaultSourceDiscovery(runDir, request, options)
  const code = (request.code_paths ?? []).length > 0 ? await defaultCodeAnalysis(runDir, request, options) : undefined
  const sourceIds = sources.literature.sources.map((source) => source.source_id)
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
          (request.code_paths ?? []).length > 0
            ? "The submitted codebase exposes implementation surfaces that can be described in a source-range-grounded paper draft."
            : "The submitted topic has an initial research direction that requires verified literature and reproduction before final claims.",
        confidence: sourceIds.length > 0 && evidenceArtifactIds.length > 0 ? 0.55 : 0.25,
        source_ids: sourceIds.slice(0, 3),
        artifact_ids: evidenceArtifactIds,
      },
    ],
    now: nowIso(options),
  })
  cache.claims = { ledger, sourceIds, evidenceArtifactIds }
  return cache.claims
}

async function defaultResultReport(
  runDir: string,
  request: ResearchIntakeRequest,
  options?: ResearchRuntimeOptions,
): Promise<{ dataPlan: DataPlan; resultReport: ResultReport; sourceIds: string[]; evidenceArtifactIds: string[] }> {
  const cache = defaultCache(runDir)
  if (cache.result) return cache.result
  const claims = await defaultClaimLedger(runDir, request, options)
  const experiment = await defaultExperimentLoop(runDir, request, options)
  cache.result = {
    dataPlan: experiment.sources.data_plan,
    resultReport: experiment.loop.report,
    sourceIds: claims.sourceIds,
    evidenceArtifactIds: [...claims.evidenceArtifactIds, experiment.loop.artifacts.result_report.artifact_id],
  }
  return cache.result
}

async function defaultAuthoring(runDir: string, request: ResearchIntakeRequest, options?: ResearchRuntimeOptions) {
  const cache = defaultCache(runDir)
  if (cache.authoring) return cache.authoring
  const claims = await defaultClaimLedger(runDir, request, options)
  const result = await defaultResultReport(runDir, request, options)
  cache.authoring = await runPaperAuthoringLoop(
    runDir,
    {
      title: normalizeResearchIntake(request).topic,
      ledger: claims.ledger,
      data_plan: result.dataPlan,
      result_report: result.resultReport,
      available_source_ids: result.sourceIds,
      model_reviews: [
        {
          model: "paper_fucker-default-reviewer",
          verdict: "warn",
          message: "Default reviewer requires live literature verification and passed reproduction before final export.",
        },
      ],
      target_profile: targetProfile(request),
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
  literature: async ({ run_dir, request, options }) => {
    const discovered = await defaultSourceDiscovery(run_dir, request, options)
    return {
      status: "succeeded",
      summary: `Recorded ${discovered.literature.sources.length} literature seed(s); verification gaps remain explicit.`,
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
  experiment_design: async ({ run_dir, request, options }) => {
    const sources = await defaultSourceDiscovery(run_dir, request, options)
    const plan = planExperiments({
      topic: normalizeResearchIntake(request).topic,
      method_name: methodName(request),
      dataset_ids: sources.data_plan.datasets.map((dataset) => dataset.dataset_id),
      objective: "Create a reproducible evaluation plan before allowing final paper claims.",
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
      summary: `Planned ${1 + plan.baselines.length + plan.ablations.length} experiment spec(s).`,
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
  claim_ledger: async ({ run_dir, request, options }) => {
    const claims = await defaultClaimLedger(run_dir, request, options)
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
      summary: `Prepared ${claims.ledger.entries.length} claim ledger entr${claims.ledger.entries.length === 1 ? "y" : "ies"}.`,
    }
  },
  drafting: async ({ run_dir, request, options }) => {
    const claims = await defaultClaimLedger(run_dir, request, options)
    const draft = composeDraftPaper({
      title: normalizeResearchIntake(request).topic,
      ledger: claims.ledger,
      now: nowIso(options),
    })
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
    const check = registry.check(targetProfile(request), {
      sections: ["abstract", "introduction", "methods", "results"],
      statements: ["data-availability", "code-availability"],
      artifacts: ["references"],
    })
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
    const draft = composeDraftPaper({
      title: normalizeResearchIntake(request).topic,
      ledger: claims.ledger,
      now: nowIso(options),
    })
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
