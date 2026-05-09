import {
  appendResearchEvent,
  writeResearchArtifact,
  type ResearchRuntimeOptions,
} from "./research/runtime"
import { createResearchCapabilityRegistry, defaultResearchCapabilities, type ResearchCapabilityRegistry } from "./capabilities"
import { normalizeResearchIntake, recordResearchIntake, type ResearchIntakeRequest } from "./intake"

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
  if (stage === "intake") {
    return async ({ run_dir, request }, options?: never) => {
      void options
      const result = await recordResearchIntake(run_dir, request)
      return {
        status: "succeeded",
        summary: `Research intake recorded for ${result.brief.workflow}.`,
      }
    }
  }

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
  return snapshot
}
