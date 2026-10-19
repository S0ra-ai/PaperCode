import { withSpan } from "../telemetry"
import { plannedExperimentSpecs } from "./planning"
import type {
  ExperimentEnvironment,
  ExperimentExecutionEvidence,
  ExperimentPlan,
  ExperimentRun,
  ExperimentRunStatus,
  ExperimentRunner,
  ExperimentRunnerResult,
  ExperimentSpec,
} from "./schemas"

export type ExperimentRunOptions = {
  now?: string
  container_image?: string
  container_digest?: string
}

function nowIso(override?: string) {
  return override ?? new Date().toISOString()
}

function environment(mode: ExperimentEnvironment["mode"], options?: ExperimentRunOptions): ExperimentEnvironment {
  if (mode === "container") {
    const result: ExperimentEnvironment = {
      mode,
      platform: "container",
    }
    if (options?.container_image) result.image = options.container_image
    if (options?.container_digest) result.digest = options.container_digest
    return result
  }
  return {
    mode,
    platform: process.platform,
    node: process.version,
  }
}

function failureCategory(status: ExperimentRunStatus): ExperimentRun["failure_category"] {
  if (status === "environment_failed") return "environment_failed"
  if (status === "resource_exceeded") return "resource_exceeded"
  if (status === "failed") return "method_failed"
  return undefined
}

export function hasProcessExecution(execution?: ExperimentExecutionEvidence) {
  return (
    execution?.kind === "process" &&
    execution.exit_code === 0 &&
    !!execution.command?.argv.length &&
    execution.command.argv.every((arg) => typeof arg === "string" && arg.length > 0)
  )
}

export function hasIsolatedContainerExecution(execution?: ExperimentExecutionEvidence) {
  const container = execution?.container
  return (
    hasProcessExecution(execution) &&
    container?.isolated === true &&
    (container.runtime === "docker" || container.runtime === "podman") &&
    !!container.container_id?.trim() &&
    /^sha256:[a-f0-9]{64}$/i.test(container.image_digest ?? "")
  )
}

async function executeSpec(
  plan: ExperimentPlan,
  spec: ExperimentSpec,
  mode: ExperimentEnvironment["mode"],
  runner: ExperimentRunner,
  options?: ExperimentRunOptions,
): Promise<ExperimentRun> {
  const startedAt = nowIso(options?.now)
  const env = environment(mode, options)
  const result = await runner(spec, env)
  const finishedAt = nowIso(options?.now)
  if (mode === "container" && hasIsolatedContainerExecution(result.execution)) {
    env.digest = result.execution!.container!.image_digest
  }
  return {
    schema_version: "ExperimentRun.v1",
    experiment_run_id: `${mode}:${spec.experiment_id}`,
    plan_id: plan.plan_id,
    experiment_id: spec.experiment_id,
    role: spec.role,
    status: result.status,
    environment: env,
    command: result.command ?? spec.command,
    execution: result.execution,
    metrics: result.metrics,
    stdout: result.stdout,
    stderr: result.stderr,
    exit_code: result.exit_code,
    resource_usage: {
      wall_time_seconds: result.resource_usage?.wall_time_seconds ?? 0,
      peak_memory_mb: result.resource_usage?.peak_memory_mb,
      gpu_hours: result.resource_usage?.gpu_hours,
      cost_usd: result.resource_usage?.cost_usd,
    },
    failure_category: failureCategory(result.status),
    started_at: startedAt,
    finished_at: finishedAt,
    reproduction: {
      container_reproduced:
        mode === "container" &&
        result.status === "succeeded" &&
        result.exit_code === 0 &&
        hasIsolatedContainerExecution(result.execution),
      image: mode === "container" ? env.image : undefined,
      digest: mode === "container" ? env.digest : undefined,
    },
  }
}

export async function runHostExploration(
  plan: ExperimentPlan,
  runner: ExperimentRunner,
  options?: ExperimentRunOptions,
) {
  return withSpan(
    "research.experiments.host_exploration",
    {
      "papercode.research.experiment.plan_id": plan.plan_id,
    },
    async (span) => {
      const runs = []
      for (const spec of plannedExperimentSpecs(plan)) runs.push(await executeSpec(plan, spec, "host", runner, options))
      span.setAttribute("papercode.research.experiments.runs", runs.length)
      return runs
    },
  )
}

export async function runContainerReproduction(
  plan: ExperimentPlan,
  hostRuns: ExperimentRun[],
  runner: ExperimentRunner,
  options?: ExperimentRunOptions,
) {
  return withSpan(
    "research.experiments.container_reproduction",
    {
      "papercode.research.experiment.plan_id": plan.plan_id,
    },
    async (span) => {
      const runnableIds = new Set(hostRuns.filter((run) => run.status === "succeeded").map((run) => run.experiment_id))
      const runs = []
      for (const spec of plannedExperimentSpecs(plan).filter((item) => runnableIds.has(item.experiment_id))) {
        runs.push(await executeSpec(plan, spec, "container", runner, options))
      }
      span.setAttribute("papercode.research.experiments.container_runs", runs.length)
      return runs
    },
  )
}

/** Sample standard deviation (n-1). A single sample has no spread. */
export function standardDeviation(samples: number[]) {
  if (samples.length < 2) return 0
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (samples.length - 1)
  return Math.sqrt(variance)
}

/**
 * Fold repeated executions of one command into the single run the analysis expects. Each metric keeps
 * its samples and reports the mean, so the manuscript can print mean ± std and a reviewer can check
 * the spread; a failed trial makes the merged run failed rather than hiding it in the average.
 */
export function mergeTrialResults(results: ExperimentRunnerResult[]) {
  if (results.length === 1) return results[0]
  const base = results[0]
  const failed = results.find((result) => result.status !== "succeeded" || result.exit_code !== 0)
  const metrics = base.metrics.map((metric) => {
    const samples = results
      .map((result) => result.metrics.find((candidate) => candidate.name === metric.name)?.value)
      .filter((value): value is number => typeof value === "number")
    if (samples.length < 2) return { ...metric, samples }
    return { ...metric, value: samples.reduce((sum, value) => sum + value, 0) / samples.length, samples }
  })
  return {
    ...base,
    status: failed ? failed.status : base.status,
    exit_code: failed ? failed.exit_code : base.exit_code,
    metrics,
    stdout: results.map((result) => result.stdout).join("\n"),
    stderr: results
      .map((result) => result.stderr)
      .filter(Boolean)
      .join("\n"),
    resource_usage: {
      wall_time_seconds: results.reduce((sum, result) => sum + (result.resource_usage?.wall_time_seconds ?? 0), 0),
    },
  }
}
