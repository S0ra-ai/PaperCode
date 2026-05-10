import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"
import { appendResearchEvent, type ResearchRuntimeOptions } from "./research/runtime"
import type { PaperRunSnapshot, PaperRunStageSnapshot } from "./run"

type PaperRunSnapshotForController = Omit<PaperRunSnapshot, "controller_state">

export type PaperRunControllerStatus = "running" | "paused" | "review_required" | "cancelled" | "completed"
export type PaperRunControlAction = "resume" | "retry" | "cancel"

export interface PaperRunControllerCheckpoint {
  checkpoint_id: string
  stage: PaperRunStageSnapshot["id"]
  status: PaperRunStageSnapshot["status"]
  summary?: string
  event_ids: string[]
  artifact_ids: string[]
  created_at: string
}

export interface PaperRunGuidanceQueueItem {
  guidance_id: string
  message: string
  status: "queued" | "applied"
  event_id: string
  created_at: string
}

export interface PaperRunControlRecord {
  control_id: string
  action: PaperRunControlAction
  stage?: PaperRunStageSnapshot["id"]
  event_id: string
  created_at: string
}

export interface PaperRunControllerState {
  schema_version: "PaperRunController.v1"
  run_id: string
  status: PaperRunControllerStatus
  checkpoints: PaperRunControllerCheckpoint[]
  guidance_queue: PaperRunGuidanceQueueItem[]
  controls: PaperRunControlRecord[]
  internal_sessions: string[]
  updated_at: string
}

export interface PaperRunControlInput {
  action: PaperRunControlAction
  stage?: PaperRunStageSnapshot["id"]
}

function nowIso(options?: ResearchRuntimeOptions) {
  return (options?.clock?.() ?? new Date()).toISOString()
}

function controllerFile(runDir: string) {
  return path.join(runDir, "paper-controller", "state.json")
}

function stageEventIds(snapshot: PaperRunSnapshotForController, stage: PaperRunStageSnapshot) {
  return snapshot.events
    .filter((event) => event.payload?.stage === stage.id)
    .map((event) => event.event_id)
}

function stageArtifactIds(snapshot: PaperRunSnapshotForController, stage: PaperRunStageSnapshot) {
  return snapshot.artifacts
    .filter((artifact) => artifact.path.includes(stage.id) || artifact.metadata?.artifact_schema === stage.artifact_schema)
    .map((artifact) => artifact.artifact_id)
}

function statusFromSnapshot(snapshot: PaperRunSnapshotForController): PaperRunControllerStatus {
  if (snapshot.status === "cancelled") return "cancelled"
  const terminalStages = snapshot.stage_graph.stages.every((stage) => stage.status !== "pending" && stage.status !== "running")
  const blockedStage = snapshot.stage_graph.stages.some((stage) => stage.status === "blocked")
  if (snapshot.status === "blocked" && terminalStages) return "review_required"
  if (snapshot.pause_questions.length > 0 && terminalStages) return "review_required"
  if (snapshot.pause_questions.length > 0) return "paused"
  if (blockedStage) return "paused"
  if (snapshot.stage_graph.stages.every((stage) => stage.status === "succeeded")) return "completed"
  return "running"
}

export function derivePaperRunControllerState(
  snapshot: PaperRunSnapshotForController,
  previous?: PaperRunControllerState,
): PaperRunControllerState {
  const updatedAt = snapshot.updated_at
  return {
    schema_version: "PaperRunController.v1",
    run_id: snapshot.run_id,
    status: previous?.status === "cancelled" ? "cancelled" : statusFromSnapshot(snapshot),
    checkpoints: snapshot.stage_graph.stages
      .filter((stage) => stage.status !== "pending")
      .map((stage) => ({
        checkpoint_id: `${snapshot.run_id}:${stage.id}`,
        stage: stage.id,
        status: stage.status,
        summary: stage.summary,
        event_ids: stageEventIds(snapshot, stage),
        artifact_ids: stageArtifactIds(snapshot, stage),
        created_at: updatedAt,
      })),
    guidance_queue: previous?.guidance_queue ?? [],
    controls: previous?.controls ?? [],
    internal_sessions: snapshot.internal_sessions,
    updated_at: updatedAt,
  }
}

export async function savePaperRunControllerState(runDir: string, state: PaperRunControllerState) {
  const file = controllerFile(runDir)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`)
  return state
}

export async function loadPaperRunControllerState(runDir: string): Promise<PaperRunControllerState> {
  return JSON.parse(await readFile(controllerFile(runDir), "utf8")) as PaperRunControllerState
}

export async function initializePaperRunControllerState(
  runDir: string,
  snapshot: PaperRunSnapshot,
  options?: ResearchRuntimeOptions,
) {
  const previous = await loadPaperRunControllerState(runDir).catch(() => undefined)
  const state = await savePaperRunControllerState(runDir, derivePaperRunControllerState(snapshot, previous))
  await appendResearchEvent(
    runDir,
    {
      type: "paper.controller.synced",
      actor: "system",
      payload: { status: state.status, checkpoints: state.checkpoints.length },
    },
    options,
  )
  return state
}

export async function enqueuePaperRunGuidance(
  runDir: string,
  input: { message: string; event_id: string },
  options?: ResearchRuntimeOptions,
) {
  const state = await loadPaperRunControllerState(runDir)
  const createdAt = nowIso(options)
  const next: PaperRunControllerState = {
    ...state,
    guidance_queue: [
      ...state.guidance_queue,
      {
        guidance_id: `${state.run_id}:guidance:${state.guidance_queue.length + 1}`,
        message: input.message,
        status: "queued",
        event_id: input.event_id,
        created_at: createdAt,
      },
    ],
    status: state.status === "completed" ? "paused" : state.status,
    updated_at: createdAt,
  }
  await savePaperRunControllerState(runDir, next)
  await appendResearchEvent(
    runDir,
    {
      type: "paper.controller.guidance.queued",
      actor: "system",
      created_at: createdAt,
      payload: { guidance_id: next.guidance_queue.at(-1)?.guidance_id },
    },
    options,
  )
  return next
}

export async function applyPaperRunControl(
  runDir: string,
  input: PaperRunControlInput,
  options?: ResearchRuntimeOptions,
) {
  const state = await loadPaperRunControllerState(runDir)
  const createdAt = nowIso(options)
  const nextStatus: PaperRunControllerStatus = input.action === "cancel" ? "cancelled" : "running"
  const event = await appendResearchEvent(
    runDir,
    {
      type: "paper.controller.control.applied",
      actor: "system",
      created_at: createdAt,
      payload: { action: input.action, stage: input.stage, status: nextStatus },
    },
    options,
  )
  const next: PaperRunControllerState = {
    ...state,
    status: nextStatus,
    guidance_queue:
      input.action === "resume" || input.action === "retry"
        ? state.guidance_queue.map((item) => ({ ...item, status: "applied" as const }))
        : state.guidance_queue,
    controls: [
      ...state.controls,
      {
        control_id: `${state.run_id}:control:${state.controls.length + 1}`,
        action: input.action,
        stage: input.stage,
        event_id: event.event_id,
        created_at: createdAt,
      },
    ],
    updated_at: createdAt,
  }
  return savePaperRunControllerState(runDir, next)
}

export function controllerSseEvent(state: PaperRunControllerState) {
  return `event: paper.run.controller\ndata: ${JSON.stringify(state)}\n\n`
}
