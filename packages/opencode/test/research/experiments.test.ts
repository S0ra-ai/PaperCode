import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import { createResearchRun, getResearchRunStatus, type ResearchRuntimeOptions } from "@/paper/research/runtime"
import {
  analyzeExperimentResults,
  planExperiments,
  recordExperimentLoop,
  runContainerReproduction,
  runHostExploration,
  type ExperimentRunner,
} from "@/paper/research/experiments"

const now = "2026-05-09T00:00:00Z"

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true }).catch((error) => {
    if (attempts <= 1) throw error
    return clean(dir, attempts - 1)
  })
}

function runtimeOptions(workspace: string, home: string): ResearchRuntimeOptions {
  let index = 0
  return {
    workspace,
    home,
    clock: () => new Date(now),
    idFactory: (kind) => `${kind}-${++index}`,
  }
}

function metricRunner(scores: Record<string, number>, status: "succeeded" | "failed" = "succeeded"): ExperimentRunner {
  return async (spec, environment) => ({
    status,
    metrics: status === "succeeded" ? [{ name: "accuracy", value: scores[spec.experiment_id] ?? 0.7, direction: "higher_better" }] : [],
    stdout: `${environment.mode}:${spec.experiment_id}`,
    stderr: status === "failed" ? "fixture failure" : "",
    exit_code: status === "succeeded" ? 0 : 1,
  })
}

describe("experiment loop", () => {
  test("plans baselines, records successful host exploration, and passes container reproduction", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-experiment-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "LLM retrieval evaluation" }, options)

      const plan = planExperiments({
        topic: "LLM retrieval evaluation",
        method_name: "claim-aware reranker",
        dataset_ids: ["ms-marco-fixture"],
        now,
      })
      expect(plan.baselines.length).toBeGreaterThanOrEqual(3)
      expect(plan.ablations.length).toBeGreaterThanOrEqual(1)

      const recorded = await recordExperimentLoop(
        handle.run_dir,
        {
          plan,
          host_runner: metricRunner({
            proposed: 0.84,
            "baseline-bm25": 0.66,
            "baseline-dense": 0.74,
            "baseline-rag": 0.78,
            "ablation-no-claim-ledger": 0.79,
          }),
          container_runner: metricRunner({
            proposed: 0.83,
            "baseline-bm25": 0.65,
            "baseline-dense": 0.73,
            "baseline-rag": 0.77,
            "ablation-no-claim-ledger": 0.78,
          }),
        },
        options,
      )

      expect(recorded.report.final_claims_allowed).toBe(true)
      expect(recorded.report.recommendation).toBe("accept")
      expect(recorded.report.reproduction.status).toBe("passed")

      const status = await getResearchRunStatus(handle.run_dir)
      expect(status.counts.artifacts).toBeGreaterThanOrEqual(3)
      expect(status.artifact_versions.map((item) => item.logical_path)).toContain("experiments/result-report.json")
    } finally {
      await clean(dir)
    }
  })

  test("flags an underperforming proposed method against baselines", async () => {
    const plan = planExperiments({ topic: "retrieval", method_name: "weak reranker", dataset_ids: ["fixture"], now })
    const runs = await runHostExploration(
      plan,
      metricRunner({
        proposed: 0.6,
        "baseline-bm25": 0.68,
        "baseline-dense": 0.7,
        "baseline-rag": 0.72,
        "ablation-no-claim-ledger": 0.59,
      }),
      { now },
    )

    const report = analyzeExperimentResults({ plan, host_runs: runs, container_runs: [], now })
    expect(report.recommendation).toBe("revise")
    expect(report.findings.map((item) => item.category)).toContain("underperforming_method")
  })

  test("classifies environment failures separately from method failures", async () => {
    const plan = planExperiments({ topic: "retrieval", method_name: "reranker", dataset_ids: ["fixture"], now })
    const runs = await runHostExploration(
      plan,
      async (spec, environment) => ({
        status: spec.experiment_id === "baseline-dense" ? "environment_failed" : "succeeded",
        metrics: [{ name: "accuracy", value: 0.7, direction: "higher_better" }],
        stdout: environment.mode,
        stderr: spec.experiment_id === "baseline-dense" ? "missing CUDA library" : "",
        exit_code: spec.experiment_id === "baseline-dense" ? 127 : 0,
      }),
      { now },
    )
    const report = analyzeExperimentResults({ plan, host_runs: runs, container_runs: [], now })
    expect(report.blockers).toContain("environment_failed")
  })

  test("blocks on resource exceeded failures", async () => {
    const plan = planExperiments({ topic: "retrieval", method_name: "reranker", dataset_ids: ["fixture"], now })
    const runs = await runHostExploration(
      plan,
      async () => ({
        status: "resource_exceeded",
        metrics: [],
        stdout: "",
        stderr: "out of memory",
        exit_code: 137,
        resource_usage: { peak_memory_mb: 65536, gpu_hours: 0.1, wall_time_seconds: 30 },
      }),
      { now },
    )
    const report = analyzeExperimentResults({ plan, host_runs: runs, container_runs: [], now })
    expect(report.blockers).toContain("resource_exceeded")
  })

  test("failed container reproduction blocks final claims", async () => {
    const plan = planExperiments({ topic: "retrieval", method_name: "reranker", dataset_ids: ["fixture"], now })
    const hostRuns = await runHostExploration(plan, metricRunner({ proposed: 0.8, "baseline-bm25": 0.7 }), { now })
    const containerRuns = await runContainerReproduction(plan, hostRuns, metricRunner({}, "failed"), { now })
    const report = analyzeExperimentResults({ plan, host_runs: hostRuns, container_runs: containerRuns, now })

    expect(report.reproduction.status).toBe("failed")
    expect(report.final_claims_allowed).toBe(false)
    expect(report.blockers).toContain("container_reproduction_failed")
  })
})
