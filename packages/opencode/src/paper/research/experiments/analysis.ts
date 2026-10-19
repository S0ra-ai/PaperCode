import { withSpan } from "../telemetry"
import { plannedExperimentSpecs } from "./planning"
import { hasIsolatedContainerExecution, hasProcessExecution, standardDeviation } from "./runner"
import { cliffsDelta, cohensD, holmAdjust, meanConfidenceInterval, welchTTest, wilcoxonRankSum } from "./statistics"
import type {
  ExperimentFinding,
  ExperimentPlan,
  ExperimentRun,
  ExperimentSignificance,
  ExperimentStatistic,
  ResultReport,
} from "./schemas"

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
  return (
    plan.metrics.find((metric) => metric.primary) ??
    plan.metrics[0] ?? { name: "accuracy", direction: "higher_better" as const }
  )
}

function metricValue(run: ExperimentRun, metricName: string) {
  const metrics = run.metrics.filter((metric) => metric.name === metricName)
  return metrics.length === 1 && Number.isFinite(metrics[0].value) ? metrics[0].value : undefined
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
    if (run.status === "failed" || run.exit_code !== 0) {
      return [
        {
          category: "experiment_failed",
          severity: "blocking",
          message: `Experiment ${run.experiment_id} failed; its measurements cannot support final claims.`,
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
      "papercode.research.experiment.plan_id": input.plan.plan_id,
    },
    (span) => {
      const metric = primaryMetric(input.plan)
      const specs = plannedExperimentSpecs(input.plan)
      const proposedRun = input.host_runs.find(
        (run) => run.experiment_id === input.plan.proposed.experiment_id && run.status === "succeeded",
      )
      const proposedValue = proposedRun ? metricValue(proposedRun, metric.name) : undefined
      const baselineValues = input.host_runs
        .filter(
          (run) =>
            run.role === "baseline" &&
            run.status === "succeeded" &&
            run.plan_id === input.plan.plan_id &&
            input.plan.baselines.some((spec) => spec.experiment_id === run.experiment_id),
        )
        .map((run) => ({ experiment_id: run.experiment_id, value: metricValue(run, metric.name) }))
        .filter((item): item is { experiment_id: string; value: number } => typeof item.value === "number")
      const bestBaseline = baselineValues.reduce<{ experiment_id: string; value: number } | undefined>((best, item) => {
        if (!best) return item
        return better(item.value, best.value, metric.direction) ? item : best
      }, undefined)

      const findings: ExperimentFinding[] = [
        ...blockingRunFindings(input.host_runs),
        ...blockingRunFindings(input.container_runs),
      ]
      const statistics: ExperimentStatistic[] = [...input.host_runs, ...input.container_runs].flatMap((run) =>
        run.metrics
          .filter((metric) => (metric.samples?.length ?? 0) > 1)
          .map((metric) => ({
            experiment_id: run.experiment_id,
            environment: run.environment.mode === "container" ? ("container" as const) : ("host" as const),
            metric: metric.name,
            n: metric.samples!.length,
            mean: metric.value,
            std: standardDeviation(metric.samples!),
            ci95: meanConfidenceInterval(metric.samples!),
          })),
      )
      // A baseline comparison with repeated trials gets the standard unequal-variance test, so the
      // manuscript reports a p-value the tool actually computed rather than one the author typed.
      const samplesByExperiment = new Map<string, number[]>()
      for (const run of input.host_runs) {
        if (run.status !== "succeeded") continue
        const samples = run.metrics.find((item) => item.name === metric.name)?.samples
        if (samples && samples.length > 1) samplesByExperiment.set(run.experiment_id, samples)
      }
      const proposedSamples = samplesByExperiment.get(input.plan.proposed.experiment_id)
      const comparisons: ExperimentSignificance[] = proposedSamples
        ? input.plan.baselines.flatMap((baseline) => {
            const baselineSamples = samplesByExperiment.get(baseline.experiment_id)
            if (!baselineSamples) return []
            const tests: ExperimentSignificance["tests"] = []
            const welch = welchTTest(proposedSamples, baselineSamples)
            if (welch) {
              tests.push({
                name: "welch_t",
                statistic: welch.statistic,
                df: welch.df,
                p: welch.p,
                p_adjusted: welch.p,
                effect_size: cohensD(proposedSamples, baselineSamples),
              })
            }
            const wilcoxon = wilcoxonRankSum(proposedSamples, baselineSamples)
            if (wilcoxon) {
              tests.push({
                name: "wilcoxon_rank_sum",
                statistic: wilcoxon.statistic,
                p: wilcoxon.p,
                p_adjusted: wilcoxon.p,
                effect_size: cliffsDelta(proposedSamples, baselineSamples),
              })
            }
            if (tests.length === 0) return []
            return [
              {
                experiment_id: input.plan.proposed.experiment_id,
                baseline_experiment_id: baseline.experiment_id,
                metric: metric.name,
                n_proposed: proposedSamples.length,
                n_baseline: baselineSamples.length,
                tests,
              },
            ]
          })
        : []
      // Holm within each test family: comparing against several baselines inflates false positives
      // unless the family is corrected, and reviewers check that it was.
      for (const name of ["welch_t", "wilcoxon_rank_sum"] as const) {
        const family = comparisons.flatMap((comparison) => comparison.tests.filter((test) => test.name === name))
        const adjusted = holmAdjust(family.map((test) => test.p))
        family.forEach((test, index) => {
          test.p_adjusted = adjusted[index]
        })
      }
      const significance: ExperimentSignificance[] = comparisons
      if (new Set(specs.map((spec) => spec.experiment_id)).size !== specs.length) {
        findings.push({
          category: "experiment_protocol_incomplete",
          severity: "blocking",
          message: "Experiment plan contains duplicate experiment IDs.",
          experiment_ids: specs.map((spec) => spec.experiment_id),
        })
      }
      for (const spec of specs) {
        const runs = input.host_runs.filter((run) => run.experiment_id === spec.experiment_id)
        if (
          runs.length !== 1 ||
          runs[0].plan_id !== input.plan.plan_id ||
          runs[0].role !== spec.role ||
          runs[0].environment.mode !== "host"
        ) {
          findings.push({
            category: "experiment_protocol_incomplete",
            severity: "blocking",
            message: `Host evidence must contain exactly one matching run for ${spec.experiment_id}.`,
            experiment_ids: [spec.experiment_id],
          })
        }
      }
      for (const run of [...input.host_runs, ...input.container_runs]) {
        if (!hasProcessExecution(run.execution)) {
          findings.push({
            category: "execution_unverified",
            severity: "blocking",
            message: `Experiment ${run.experiment_id} has no verified process execution; imported or legacy observations are not executions.`,
            experiment_ids: [run.experiment_id],
          })
        }
        const measurement = run.metrics.filter((item) => item.name === metric.name)
        if (metricValue(run, metric.name) === undefined || measurement[0]?.direction !== metric.direction) {
          findings.push({
            category: "metric_missing",
            severity: "blocking",
            message: `Experiment ${run.experiment_id} requires one finite primary metric ${metric.name} with the planned direction.`,
            experiment_ids: [run.experiment_id],
          })
        }
        if (
          run.plan_id !== input.plan.plan_id ||
          !specs.some((spec) => spec.experiment_id === run.experiment_id && spec.role === run.role)
        ) {
          findings.push({
            category: "experiment_protocol_incomplete",
            severity: "blocking",
            message: `Run ${run.experiment_run_id} does not match the declared experiment plan.`,
            experiment_ids: [run.experiment_id],
          })
        }
      }
      if (input.plan.baselines.length === 0) {
        findings.push({
          category: "experiment_protocol_incomplete",
          severity: "blocking",
          message:
            "No baseline runner is declared; final research claims require at least one explicit baseline protocol.",
          experiment_ids: [input.plan.proposed.experiment_id],
        })
      }
      if (input.plan.ablations.length === 0) {
        findings.push({
          category: "experiment_protocol_incomplete",
          severity: "warning",
          message: "No ablation runner is declared; keep contribution claims narrow until ablation evidence exists.",
          experiment_ids: [input.plan.proposed.experiment_id],
        })
      }
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

      const tolerance = input.plan.reproduction_tolerance ?? { absolute: 1e-6, relative: 1e-6 }
      const validTolerance =
        Number.isFinite(tolerance.absolute) &&
        tolerance.absolute >= 0 &&
        Number.isFinite(tolerance.relative) &&
        tolerance.relative >= 0
      const reproductionPassed =
        validTolerance &&
        input.host_runs.length === specs.length &&
        input.container_runs.length === specs.length &&
        new Set(specs.map((spec) => spec.experiment_id)).size === specs.length &&
        specs.every((spec) => {
          const host = input.host_runs.filter((run) => run.experiment_id === spec.experiment_id)
          const container = input.container_runs.filter((run) => run.experiment_id === spec.experiment_id)
          if (host.length !== 1 || container.length !== 1) return false
          const runs = [host[0], container[0]]
          if (
            runs.some(
              (run) =>
                run.plan_id !== input.plan.plan_id ||
                run.role !== spec.role ||
                run.status !== "succeeded" ||
                run.exit_code !== 0 ||
                !hasProcessExecution(run.execution) ||
                run.metrics.filter((item) => item.name === metric.name).length !== 1 ||
                run.metrics.find((item) => item.name === metric.name)?.direction !== metric.direction,
            )
          )
            return false
          if (
            host[0].environment.mode !== "host" ||
            container[0].environment.mode !== "container" ||
            !container[0].reproduction.container_reproduced ||
            !hasIsolatedContainerExecution(container[0].execution)
          )
            return false
          const hostValue = metricValue(host[0], metric.name)
          const containerValue = metricValue(container[0], metric.name)
          return (
            hostValue !== undefined &&
            containerValue !== undefined &&
            Math.abs(hostValue - containerValue) <= tolerance.absolute + tolerance.relative * Math.abs(hostValue)
          )
        })
      const reproductionStatus =
        input.container_runs.length === 0 ? "not_run" : reproductionPassed ? "passed" : "failed"
      if (reproductionStatus !== "passed") {
        findings.push({
          category: "container_reproduction_failed",
          severity: "blocking",
          message:
            reproductionStatus === "not_run"
              ? "Container reproduction was not run; final paper claims are blocked."
              : "Container reproduction requires complete successful process runs, isolated container evidence, and matching primary metrics.",
          experiment_ids: specs.map((spec) => spec.experiment_id),
        })
      }

      const blockers = Array.from(
        new Set(findings.filter((finding) => finding.severity === "blocking").map((finding) => finding.category)),
      )
      const hasUnderperforming = findings.some((finding) => finding.category === "underperforming_method")
      const recommendation = blockers.length > 0 ? "block" : hasUnderperforming ? "revise" : "accept"
      const finalClaimsAllowed = blockers.length === 0 && reproductionStatus === "passed"

      span.setAttribute("papercode.research.experiment.recommendation", recommendation)
      span.setAttribute("papercode.research.experiment.final_claims_allowed", finalClaimsAllowed)
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
        ...(statistics.length > 0 ? { statistics } : {}),
        ...(significance.length > 0 ? { significance } : {}),
        final_claims_allowed: finalClaimsAllowed,
      }
    },
  )
}
