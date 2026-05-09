import { withSpan } from "../telemetry"
import type { ExperimentPlan, ExperimentSpec } from "./schemas"

export type ExperimentPlanningInput = {
  topic: string
  method_name: string
  dataset_ids: string[]
  objective?: string
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

function command(experimentId: string) {
  return {
    argv: ["paper-fucker-experiment", "run", experimentId],
    timeout_seconds: 3600,
  }
}

function spec(input: {
  experiment_id: string
  label: string
  role: ExperimentSpec["role"]
  dataset_ids: string[]
  rationale: string
}): ExperimentSpec {
  return {
    ...input,
    command: command(input.experiment_id),
    expected_metric: "accuracy",
  }
}

export function planExperiments(input: ExperimentPlanningInput): ExperimentPlan {
  const createdAt = nowIso(input.now)
  return withSpan(
    "research.experiments.plan",
    {
      "paper_fucker.research.topic": input.topic,
      "paper_fucker.research.method": input.method_name,
    },
    (span) => {
      const plan: ExperimentPlan = {
        schema_version: "ExperimentPlan.v1",
        plan_id: `experiment-plan:${slug(input.topic) || "topic"}`,
        topic: input.topic,
        method_name: input.method_name,
        objective: input.objective ?? `Evaluate ${input.method_name} against reproducible baselines.`,
        created_at: createdAt,
        metrics: [{ name: "accuracy", direction: "higher_better", primary: true }],
        proposed: spec({
          experiment_id: "proposed",
          label: input.method_name,
          role: "proposed",
          dataset_ids: input.dataset_ids,
          rationale: "Primary proposed method under evaluation.",
        }),
        baselines: [
          spec({
            experiment_id: "baseline-bm25",
            label: "BM25 lexical retrieval",
            role: "baseline",
            dataset_ids: input.dataset_ids,
            rationale: "Strong sparse retrieval baseline for retrieval-style CS/AI papers.",
          }),
          spec({
            experiment_id: "baseline-dense",
            label: "Dense bi-encoder retrieval",
            role: "baseline",
            dataset_ids: input.dataset_ids,
            rationale: "Common neural retrieval baseline for embedding-based methods.",
          }),
          spec({
            experiment_id: "baseline-rag",
            label: "Standard RAG pipeline",
            role: "baseline",
            dataset_ids: input.dataset_ids,
            rationale: "End-to-end retrieval augmented generation baseline.",
          }),
        ],
        ablations: [
          spec({
            experiment_id: "ablation-no-claim-ledger",
            label: "Ablation without claim ledger",
            role: "ablation",
            dataset_ids: input.dataset_ids,
            rationale: "Tests whether claim-ledger evidence tracking contributes to the result.",
          }),
        ],
        resource_budget: {
          max_wall_time_seconds: 4 * 60 * 60,
          max_memory_mb: 24576,
          max_gpu_hours: 4,
        },
        downgrade_policy: [
          "If fewer than two baselines can run, downgrade to an engineering report.",
          "If datasets are unavailable, turn to the nearest open verified benchmark.",
          "If container reproduction fails, block final paper claims.",
        ],
      }
      span.setAttribute("paper_fucker.research.experiments.baselines", plan.baselines.length)
      span.setAttribute("paper_fucker.research.experiments.ablations", plan.ablations.length)
      return plan
    },
  )
}

export function plannedExperimentSpecs(plan: ExperimentPlan) {
  return [plan.proposed, ...plan.baselines, ...plan.ablations]
}
