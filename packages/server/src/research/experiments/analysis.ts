import { withSpan } from "../telemetry"
import type { ExperimentFinding, ExperimentPlan, ExperimentRun, ResultReport } from "./schemas"

export type ExperimentAnalysisInput = {
  plan: ExperimentPlan
  host_runs: ExperimentRun[]
  container_runs: ExperimentRun[]
  now?: string
}

function nowIso(override?: string) {
  return override ?? new Date().toISOString()
}

function primaryMetric(plan: ExperimentPlan) {
  return plan.metrics.find((metric) => metric.primary) ?? plan.metrics[0] ?? { name: "accuracy", direction: "higher_better" as const }
}

function metricValue(run: ExperimentRun, metricName: string) {
  return run.metrics.find((metric) => metric.name === metricName)?.value
}

function better(left: number, right: number, direction: "higher_better" | "lower_better") {
  return direction === "higher_better" ? left > right : left < right
}

function blockingRunFindings(runs: ExperimentRun[]): ExperimentFinding[] {
  return runs.flatMap((run): ExperimentFinding[] => {
    if (run.status === "environment_failed") {
      return [
        {
          category: "environment_failed" as const,
          severity: "blocking" as const,
          message: `Experiment ${run.experiment_id} failed because the host/container environment was incomplete.`,
          experiment_ids: [run.experiment_id],
        },
      ]
    }
    if (run.status === "resource_exceeded") {
      return [
        {
          category: "resource_exceeded" as const,
          severity: "blocking" as const,
          message: `Experiment ${run.experiment_id} exceeded the configured resource budget.`,
          experiment_ids: [run.experiment_id],
        },
      ]
    }
    return []
  })
}

export function analyzeExperimentResults(input: ExperimentAnalysisInput): ResultReport {
  const createdAt = nowIso(input.now)
  return withSpan(
    "research.experiments.analyze",
    {
      "paper_fucker.research.experiment.plan_id": input.plan.plan_id,
    },
    (span) => {
      const metric = primaryMetric(input.plan)
      const proposedRun = input.host_runs.find((run) => run.experiment_id === input.plan.proposed.experiment_id)
      const proposedValue = proposedRun ? metricValue(proposedRun, metric.name) : undefined
      const baselineValues = input.host_runs
        .filter((run) => run.role === "baseline")
        .map((run) => ({ experiment_id: run.experiment_id, value: metricValue(run, metric.name) }))
        .filter((item): item is { experiment_id: string; value: number } => typeof item.value === "number")
      const bestBaseline = baselineValues.reduce<{ experiment_id: string; value: number } | undefined>((best, item) => {
        if (!best) return item
        return better(item.value, best.value, metric.direction) ? item : best
      }, undefined)

      const findings: ExperimentFinding[] = [...blockingRunFindings(input.host_runs), ...blockingRunFindings(input.container_runs)]
      if (typeof proposedValue !== "number") {
        findings.push({
          category: "metric_missing",
          severity: "blocking",
          message: `Proposed experiment is missing primary metric ${metric.name}.`,
          experiment_ids: [input.plan.proposed.experiment_id],
        })
      } else if (bestBaseline && better(bestBaseline.value, proposedValue, metric.direction)) {
        findings.push({
          category: "underperforming_method",
          severity: "warning",
          message: `Proposed method underperforms best baseline ${bestBaseline.experiment_id}.`,
          experiment_ids: [input.plan.proposed.experiment_id, bestBaseline.experiment_id],
        })
      }

      const reproductionStatus =
        input.container_runs.length === 0
          ? "not_run"
          : input.container_runs.every((run) => run.status === "succeeded" && run.reproduction.container_reproduced)
            ? "passed"
            : "failed"
      if (reproductionStatus === "failed") {
        findings.push({
          category: "container_reproduction_failed",
          severity: "blocking",
          message: "Container reproduction failed; final paper claims are blocked.",
          experiment_ids: input.container_runs.filter((run) => run.status !== "succeeded").map((run) => run.experiment_id),
        })
      }

      const blockers = Array.from(
        new Set(
          findings
            .filter((finding) => finding.severity === "blocking")
            .map((finding) => finding.category),
        ),
      )
      const hasUnderperforming = findings.some((finding) => finding.category === "underperforming_method")
      const recommendation = blockers.length > 0 ? "block" : hasUnderperforming ? "revise" : "accept"
      const finalClaimsAllowed = blockers.length === 0 && reproductionStatus === "passed"

      span.setAttribute("paper_fucker.research.experiment.recommendation", recommendation)
      span.setAttribute("paper_fucker.research.experiment.final_claims_allowed", finalClaimsAllowed)
      return {
        schema_version: "ResultReport.v1",
        plan_id: input.plan.plan_id,
        created_at: createdAt,
        primary_metric: metric.name,
        best_baseline: bestBaseline,
        proposed:
          typeof proposedValue === "number"
            ? {
                experiment_id: input.plan.proposed.experiment_id,
                value: proposedValue,
              }
            : undefined,
        findings,
        blockers,
        recommendation,
        reproduction: {
          status: reproductionStatus,
          container_run_ids: input.container_runs.map((run) => run.experiment_run_id),
        },
        final_claims_allowed: finalClaimsAllowed,
      }
    },
  )
}
