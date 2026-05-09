import { readJsonlFacts, writeResearchArtifact, type ResearchRuntimeOptions } from "../runtime"
import type { ResearchStageId } from "./stage-graph"

export type QueuedGuidance = {
  guidance_id: string
  run_id: string
  text: string
  created_at: string
  apply_at_stage?: ResearchStageId
  applied_at_stage?: ResearchStageId
  status: "queued" | "applied"
}

export type GuidanceQueue = {
  schema_version: "GuidanceQueue.v1"
  items: QueuedGuidance[]
}

function nowIso(options?: ResearchRuntimeOptions) {
  return (options?.clock?.() ?? new Date()).toISOString()
}

async function loadGuidanceQueue(runDir: string): Promise<GuidanceQueue> {
  const artifacts = await readJsonlFacts(runDir, "artifact")
  const latest = artifacts
    .filter((artifact) => artifact.metadata?.artifact_schema === "GuidanceQueue.v1")
    .toSorted((left, right) => String(left.created_at).localeCompare(String(right.created_at)))
    .at(-1)
  if (!latest) return { schema_version: "GuidanceQueue.v1", items: [] }
  const content = await Bun.file(`${runDir}/${latest.path}`).json()
  return content as GuidanceQueue
}

export async function queueGuidance(
  runDir: string,
  input: { run_id: string; text: string; apply_at_stage?: ResearchStageId },
  options?: ResearchRuntimeOptions,
) {
  const queue = await loadGuidanceQueue(runDir)
  const createdAt = nowIso(options)
  const item: QueuedGuidance = {
    guidance_id: `guidance-${queue.items.length + 1}`,
    run_id: input.run_id,
    text: input.text,
    created_at: createdAt,
    apply_at_stage: input.apply_at_stage,
    status: "queued",
  }
  const next = { ...queue, items: [...queue.items, item] }
  await writeResearchArtifact(
    runDir,
    {
      kind: "log",
      logical_path: "orchestrator/guidance-queue.json",
      data: next,
      metadata: { artifact_schema: "GuidanceQueue.v1" },
    },
    options,
  )
  return item
}

export async function applyQueuedGuidance(
  runDir: string,
  stage: ResearchStageId,
  options?: ResearchRuntimeOptions,
): Promise<QueuedGuidance[]> {
  const queue = await loadGuidanceQueue(runDir)
  const applied: QueuedGuidance[] = []
  const nextItems = queue.items.map((item) => {
    if (item.status !== "queued") return item
    if (item.apply_at_stage && item.apply_at_stage !== stage) return item
    const next = { ...item, status: "applied" as const, applied_at_stage: stage }
    applied.push(next)
    return next
  })
  if (applied.length > 0) {
    await writeResearchArtifact(
      runDir,
      {
        kind: "log",
        logical_path: "orchestrator/guidance-queue.json",
        data: { ...queue, items: nextItems },
        metadata: { artifact_schema: "GuidanceQueue.v1" },
      },
      options,
    )
  }
  return applied
}
