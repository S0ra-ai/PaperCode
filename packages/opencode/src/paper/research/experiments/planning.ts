import { withSpan } from "../telemetry"
import type { ExperimentCommand, ExperimentMetricDirection, ExperimentPlan, ExperimentSpec } from "./schemas"

export type ExperimentPlanningInput = {
  topic: string
  method_name: string
  dataset_ids: string[]
  objective?: string
  primary_metric?: string
  metric_direction?: ExperimentMetricDirection
  proposed_id?: string
  proposed_command?: ExperimentCommand
  baseline_specs?: Array<{ experiment_id: string; label: string; command: ExperimentCommand; rationale: string }>
  ablation_specs?: Array<{ experiment_id: string; label: string; command: ExperimentCommand; rationale: string }>
  /** Legacy input retained for compatibility; experiment specs must always be explicit. */
  include_default_baselines?: boolean
  resource_budget?: ExperimentPlan["resource_budget"]
  reproduction_tolerance?: ExperimentPlan["reproduction_tolerance"]
  now?: string
}

function nowIso(override?: string) {
  return override ?? new Date().toISOString()
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 56)
}

function spec(input: {
  experiment_id: string
  label: string
  role: ExperimentSpec["role"]
  dataset_ids: string[]
  rationale: string
  expected_metric: string
  command?: ExperimentCommand
}): ExperimentSpec {
  return {
    ...input,
    command: input.command ?? { argv: [] },
  }
}

export function planExperiments(input: ExperimentPlanningInput): ExperimentPlan {
  const createdAt = nowIso(input.now)
  return withSpan(
    "research.experiments.plan",
    {
      "papercode.research.topic": input.topic,
      "papercode.research.method": input.method_name,
    },
    (span) => {
      const primaryMetric = input.primary_metric ?? "accuracy"
      // Experiment identities must come from an explicit protocol, never from a generic topic.
      const baselineSpecs = (input.baseline_specs ?? []).map((item) =>
        spec({ ...item, role: "baseline", dataset_ids: input.dataset_ids, expected_metric: primaryMetric }),
      )
      const ablationSpecs = (input.ablation_specs ?? []).map((item) =>
        spec({ ...item, role: "ablation", dataset_ids: input.dataset_ids, expected_metric: primaryMetric }),
      )
      const plan: ExperimentPlan = {
        schema_version: "ExperimentPlan.v1",
        plan_id: `experiment-plan:${slug(input.topic) || "topic"}`,
        topic: input.topic,
        method_name: input.method_name,
        objective: input.objective ?? `Evaluate ${input.method_name} against reproducible baselines.`,
        created_at: createdAt,
        metrics: [{ name: primaryMetric, direction: input.metric_direction ?? "higher_better", primary: true }],
        proposed: spec({
          experiment_id: input.proposed_id ?? "proposed",
          label: input.method_name,
          role: "proposed",
          dataset_ids: input.dataset_ids,
          rationale: "Primary proposed method under evaluation.",
          expected_metric: primaryMetric,
          command: input.proposed_command,
        }),
        baselines: baselineSpecs,
        ablations: ablationSpecs,
        resource_budget: input.resource_budget ?? {
          max_wall_time_seconds: 4 * 60 * 60,
          max_memory_mb: 24576,
          max_gpu_hours: 0,
        },
        reproduction_tolerance: input.reproduction_tolerance,
        downgrade_policy: [
          "If fewer than two baselines can run, downgrade to an engineering report.",
          "If datasets are unavailable, turn to the nearest open verified benchmark.",
          "If container reproduction fails, block final paper claims.",
        ],
      }
      span.setAttribute("papercode.research.experiments.baselines", plan.baselines.length)
      span.setAttribute("papercode.research.experiments.ablations", plan.ablations.length)
      return plan
    },
  )
}

export function plannedExperimentSpecs(plan: ExperimentPlan) {
  return [plan.proposed, ...plan.baselines, ...plan.ablations]
}
