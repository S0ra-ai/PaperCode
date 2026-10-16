import { appendResearchEvent, getResearchRunStatus, writeResearchArtifact, type ResearchRuntimeOptions } from "../runtime"
import { withSpan } from "../telemetry"
import { applyQueuedGuidance, queueGuidance } from "./guidance"
import { decideAutomaticStagePolicy, type StagePolicySignal } from "./policy"
import {
  AUTOMATIC_STAGE_GRAPH,
  initialStageSnapshots,
  nextRunnableStage,
  type ResearchStageId,
  type ResearchStageSnapshot,
} from "./stage-graph"

export * from "./controls"
export * from "./guidance"
export * from "./policy"
export * from "./stage-graph"

export type StageHandlerResult = {
  status?: "succeeded" | "skipped"
  summary?: string
  signal?: StagePolicySignal
  artifact?: {
    logical_path: string
    data: unknown
    schema?: string
  }
}

export type StageHandler = (input: {
  run_dir: string
  run_id: string
  stage: ResearchStageId
  guidance: Array<{ guidance_id: string; text: string }>
}) => Promise<StageHandlerResult> | StageHandlerResult

export type OrchestratorRunInput = {
  run_dir: string
  handlers?: Partial<Record<ResearchStageId, StageHandler>>
  max_stages?: number
}

export type OrchestratorSnapshot = {
  schema_version: "OrchestratorState.v1"
  run_id: string
  graph: typeof AUTOMATIC_STAGE_GRAPH
  stages: ResearchStageSnapshot[]
  paused: boolean
  pause?: {
    stage: ResearchStageId
    reason: string
    message: string
  }
  updated_at: string
}

function nowIso(options?: ResearchRuntimeOptions) {
  return (options?.clock?.() ?? new Date()).toISOString()
}

function updateStage(stages: ResearchStageSnapshot[], stage: ResearchStageId, update: Partial<ResearchStageSnapshot>) {
  return stages.map((item) => (item.id === stage ? { ...item, ...update } : item))
}

async function writeOrchestratorState(runDir: string, state: OrchestratorSnapshot, options?: ResearchRuntimeOptions) {
  return writeResearchArtifact(
    runDir,
    {
      kind: "log",
      logical_path: "orchestrator/state.json",
      data: state,
      metadata: { artifact_schema: "OrchestratorState.v1" },
    },
    options,
  )
}

export async function startAutomaticResearchRun(input: OrchestratorRunInput, options?: ResearchRuntimeOptions) {
  return withSpan(
    "research.orchestrator.run",
    { "papercode.research.run_dir": input.run_dir },
    async (span) => {
      const status = await getResearchRunStatus(input.run_dir)
      let snapshot: OrchestratorSnapshot = {
        schema_version: "OrchestratorState.v1",
        run_id: status.run.run_id,
        graph: AUTOMATIC_STAGE_GRAPH,
        stages: initialStageSnapshots(),
        paused: false,
        updated_at: nowIso(options),
      }
      await appendResearchEvent(
        input.run_dir,
        { type: "orchestrator.started", actor: "system", payload: { graph: AUTOMATIC_STAGE_GRAPH } },
        options,
      )
      await appendResearchEvent(
        input.run_dir,
        { type: "preview.start.requested", actor: "system", payload: { readonly: true } },
        options,
      )

      const maxStages = input.max_stages ?? AUTOMATIC_STAGE_GRAPH.stages.length
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
          { type: "orchestrator.stage.started", actor: "system", payload: { stage: stage.id } },
          options,
        )
        const guidance = await applyQueuedGuidance(input.run_dir, stage.id, options)
        const result =
          (await input.handlers?.[stage.id]?.({
            run_dir: input.run_dir,
            run_id: status.run.run_id,
            stage: stage.id,
            guidance: guidance.map((item) => ({ guidance_id: item.guidance_id, text: item.text })),
          })) ?? {
            status: "skipped" as const,
            summary: `${stage.title} requires a concrete stage handler.`,
            signal: { stage_failure: `No handler registered for ${stage.id}.` },
          }
        const policy = decideAutomaticStagePolicy({
          state: (await getResearchRunStatus(input.run_dir)).state,
          stage: stage.id,
          signal: result.signal,
        })
        if (policy.action === "pause") {
          const updatedAt = nowIso(options)
          snapshot = {
            ...snapshot,
            paused: true,
            pause: { stage: stage.id, reason: policy.condition.reason, message: policy.condition.message },
            stages: updateStage(snapshot.stages, stage.id, {
              status: "paused",
              pause_reason: policy.condition.reason,
              summary: policy.condition.message,
            }),
            updated_at: updatedAt,
          }
          await appendResearchEvent(
            input.run_dir,
            { type: "orchestrator.paused", actor: "system", payload: snapshot.pause },
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
              metadata: { artifact_schema: result.artifact.schema ?? `${stage.id}.v1` },
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
            type: "orchestrator.stage.completed",
            actor: "system",
            payload: { stage: stage.id, status: result.status ?? "succeeded", guidance_applied: guidance.length },
          },
          options,
        )
      }
      await writeOrchestratorState(input.run_dir, snapshot, options)
      span.setAttribute("papercode.research.run_id", status.run.run_id)
      span.setAttribute("papercode.research.orchestrator.paused", snapshot.paused)
      return snapshot
    },
  )
}

export { queueGuidance }
