import { withSpan } from "../telemetry"
import { discoverDatasets, openVerifiedDatasets } from "./datasets"
import type { DataPlan, DirectionFeasibility, LiteratureMap, NearbyDirection } from "./schemas"

export type DirectionFeasibilityInput = {
  topic: string
  literature: LiteratureMap
  data_plan: DataPlan
  full_access?: boolean
  nearby_directions?: NearbyDirection[]
  min_verified_sources?: number
  now?: string
}

function nowIso(override?: string) {
  return override ?? new Date().toISOString()
}

function feasibleDirection(directions: NearbyDirection[] | undefined, now: string) {
  return (directions ?? []).find((direction) => {
    const plan = discoverDatasets({ topic: direction.topic, candidates: direction.dataset_candidates, now })
    return openVerifiedDatasets(plan).length > 0 && plan.license_conflicts.length === 0
  })
}

export function assessDirectionFeasibility(input: DirectionFeasibilityInput): DirectionFeasibility {
  const createdAt = nowIso(input.now)
  return withSpan(
    "research.sources.direction_feasibility",
    {
      "paper_fucker.research.topic": input.topic,
      "paper_fucker.research.full_access": input.full_access === true,
    },
    (span) => {
      const blockers: string[] = []
      const minVerified = input.min_verified_sources ?? 3
      const openDatasets = openVerifiedDatasets(input.data_plan)

      if (input.literature.summary.verified_sources < minVerified) blockers.push("insufficient_verified_literature")
      if (input.data_plan.license_conflicts.length > 0) blockers.push("dataset_license_conflict")
      if (openDatasets.length === 0) blockers.push("missing_open_dataset")

      if (blockers.includes("dataset_license_conflict")) {
        span.setAttribute("paper_fucker.research.direction.status", "pause")
        return {
          schema_version: "DirectionFeasibility.v1",
          topic: input.topic,
          selected_direction: input.topic,
          status: "pause",
          confidence: 0.35,
          rationale: "Dataset license conflicts require human review before the work can proceed.",
          blockers,
          rollback: { original_topic: input.topic },
          candidate_dataset_ids: input.data_plan.datasets.map((dataset) => dataset.dataset_id),
          created_at: createdAt,
        }
      }

      if (blockers.length === 0) {
        span.setAttribute("paper_fucker.research.direction.status", "feasible")
        return {
          schema_version: "DirectionFeasibility.v1",
          topic: input.topic,
          selected_direction: input.topic,
          status: "feasible",
          confidence: 0.86,
          rationale: "The topic has enough verified literature and at least one open verified dataset.",
          blockers: [],
          rollback: { original_topic: input.topic },
          candidate_dataset_ids: openDatasets.map((dataset) => dataset.dataset_id),
          created_at: createdAt,
        }
      }

      const turn = input.full_access === true ? feasibleDirection(input.nearby_directions, createdAt) : undefined
      if (turn && blockers.every((blocker) => blocker === "missing_open_dataset")) {
        const turnPlan = discoverDatasets({ topic: turn.topic, candidates: turn.dataset_candidates, now: createdAt })
        span.setAttribute("paper_fucker.research.direction.status", "turned")
        return {
          schema_version: "DirectionFeasibility.v1",
          topic: input.topic,
          selected_direction: turn.topic,
          status: "turned",
          confidence: 0.78,
          rationale: turn.rationale,
          blockers,
          rollback: {
            original_topic: input.topic,
            previous_direction: input.topic,
            reason: "Original topic lacked an open verified dataset.",
          },
          candidate_dataset_ids: openVerifiedDatasets(turnPlan).map((dataset) => dataset.dataset_id),
          created_at: createdAt,
        }
      }

      span.setAttribute("paper_fucker.research.direction.status", "pause")
      return {
        schema_version: "DirectionFeasibility.v1",
        topic: input.topic,
        selected_direction: input.topic,
        status: "pause",
        confidence: 0.42,
        rationale: "The topic cannot yet support an experimental paper without resolving discovery blockers.",
        blockers,
        rollback: { original_topic: input.topic },
        candidate_dataset_ids: openDatasets.map((dataset) => dataset.dataset_id),
        created_at: createdAt,
      }
    },
  )
}
