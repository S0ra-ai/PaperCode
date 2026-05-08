import { appendResearchEvent, writeResearchArtifact, type ResearchRuntimeOptions } from "../runtime"
import { withSpan } from "../telemetry"
import { analyzeExperimentResults } from "./analysis"
import { runContainerReproduction, runHostExploration, type ExperimentRunOptions } from "./runner"
import type { ExperimentPlan, ExperimentRunner } from "./schemas"

export type RecordExperimentLoopInput = {
  plan: ExperimentPlan
  host_runner: ExperimentRunner
  container_runner: ExperimentRunner
  run_options?: ExperimentRunOptions
}

export async function recordExperimentLoop(
  runDir: string,
  input: RecordExperimentLoopInput,
  options?: ResearchRuntimeOptions,
) {
  return withSpan(
    "research.experiments.record_loop",
    {
      "paper_fucker.research.experiment.plan_id": input.plan.plan_id,
    },
    async (span) => {
      const now = options?.clock?.().toISOString()
      const runOptions = { now, ...(input.run_options ?? {}) }
      const hostRuns = await runHostExploration(input.plan, input.host_runner, runOptions)
      const containerRuns = await runContainerReproduction(input.plan, hostRuns, input.container_runner, runOptions)
      const report = analyzeExperimentResults({
        plan: input.plan,
        host_runs: hostRuns,
        container_runs: containerRuns,
        now,
      })

      const planArtifact = await writeResearchArtifact(
        runDir,
        {
          kind: "log",
          logical_path: "experiments/experiment-plan.json",
          data: input.plan,
          metadata: { artifact_schema: "ExperimentPlan.v1" },
        },
        options,
      )
      const hostArtifact = await writeResearchArtifact(
        runDir,
        {
          kind: "log",
          logical_path: "experiments/host-runs.json",
          data: hostRuns,
          metadata: { artifact_schema: "ExperimentRun.v1[]" },
        },
        options,
      )
      const containerArtifact = await writeResearchArtifact(
        runDir,
        {
          kind: "log",
          logical_path: "experiments/container-runs.json",
          data: containerRuns,
          metadata: { artifact_schema: "ExperimentRun.v1[]" },
        },
        options,
      )
      const reportArtifact = await writeResearchArtifact(
        runDir,
        {
          kind: "table",
          logical_path: "experiments/result-report.json",
          data: report,
          metadata: { artifact_schema: "ResultReport.v1" },
        },
        options,
      )
      await appendResearchEvent(
        runDir,
        {
          type: "experiments.loop.completed",
          actor: "agent",
          payload: {
            plan_artifact_id: planArtifact.artifact_id,
            host_runs_artifact_id: hostArtifact.artifact_id,
            container_runs_artifact_id: containerArtifact.artifact_id,
            result_report_artifact_id: reportArtifact.artifact_id,
            recommendation: report.recommendation,
            final_claims_allowed: report.final_claims_allowed,
          },
        },
        options,
      )

      span.setAttribute("paper_fucker.research.experiment.recommendation", report.recommendation)
      return {
        plan: input.plan,
        host_runs: hostRuns,
        container_runs: containerRuns,
        report,
        artifacts: {
          plan: planArtifact,
          host_runs: hostArtifact,
          container_runs: containerArtifact,
          result_report: reportArtifact,
        },
      }
    },
  )
}
