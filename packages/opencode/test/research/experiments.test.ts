import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import { createResearchRun, getResearchRunStatus, type ResearchRuntimeOptions } from "@/paper/research/runtime"
import {
  analyzeExperimentResults,
  mergeTrialResults,
  planExperiments,
  recordExperimentLoop,
  runContainerReproduction,
  runHostExploration,
  welchTTest,
  type ExperimentRunner,
} from "@/paper/research/experiments"
import { composeClaimLedger, composeDraftPaper } from "@/paper/research/writing"

const now = "2026-05-09T00:00:00Z"

const protocols = {
  proposed_command: { argv: ["python", "fixture.py", "proposed"] },
  baseline_specs: ["bm25", "dense", "rag"].map((name) => ({
    experiment_id: `baseline-${name}`,
    label: name,
    command: { argv: ["python", "fixture.py", name] },
    rationale: "Explicit test fixture baseline",
  })),
  ablation_specs: [
    {
      experiment_id: "ablation-no-claim-ledger",
      label: "fixture ablation",
      command: { argv: ["python", "fixture.py", "ablation"] },
      rationale: "Explicit test fixture ablation",
    },
  ],
}

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch((error) => {
    if (attempts <= 1) {
      console.warn(`Could not remove temporary experiments test directory ${dir}: ${String(error)}`)
      return
    }
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
  // Simulated process/isolation records exercise the gate; no container is launched by this fixture.
  return async (spec, environment) => ({
    status,
    execution: {
      kind: "process",
      command: spec.command,
      exit_code: status === "succeeded" ? 0 : 1,
      container:
        environment.mode === "container"
          ? {
              runtime: "docker",
              container_id: `fixture-${spec.experiment_id}`,
              image_digest: `sha256:${"a".repeat(64)}`,
              isolated: true,
            }
          : undefined,
    },
    metrics:
      status === "succeeded"
        ? [{ name: "accuracy", value: scores[spec.experiment_id] ?? 0.7, direction: "higher_better" }]
        : [],
    stdout: `${environment.mode}:${spec.experiment_id}`,
    stderr: status === "failed" ? "fixture failure" : "",
    exit_code: status === "succeeded" ? 0 : 1,
  })
}

describe("experiment loop", () => {
  test("welch t-test separates identical from different samples", () => {
    const same = welchTTest([0.9, 0.91, 0.89], [0.9, 0.91, 0.89])
    expect(same?.p).toBeCloseTo(1, 6)
    const different = welchTTest([0.9, 0.92, 0.94], [0.66, 0.67, 0.65])
    expect(different?.p).toBeLessThan(0.001)
  })

  test("repeated trials are summarised as mean ± std in the report and the draft", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "papercode-repeated-trials-test-"))
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
        ...protocols,
        now,
      })
      const trials: Record<string, number[]> = {
        proposed: [0.9, 0.92, 0.94],
        "baseline-bm25": [0.66, 0.67, 0.65],
        "baseline-dense": [0.74, 0.75, 0.73],
        "baseline-rag": [0.78, 0.79, 0.77],
        "ablation-no-claim-ledger": [0.79, 0.8, 0.78],
      }
      const repeated: ExperimentRunner = async (spec, environment) =>
        mergeTrialResults(
          (trials[spec.experiment_id] ?? [0.7]).map((value) => ({
            status: "succeeded" as const,
            execution: {
              kind: "process" as const,
              command: spec.command,
              exit_code: 0,
              container:
                environment.mode === "container"
                  ? {
                      runtime: "docker",
                      container_id: `fixture-${spec.experiment_id}`,
                      image_digest: `sha256:${"a".repeat(64)}`,
                      isolated: true,
                    }
                  : undefined,
            },
            metrics: [{ name: "accuracy", value, direction: "higher_better" as const }],
            stdout: `${environment.mode}:${spec.experiment_id}`,
            stderr: "",
            exit_code: 0,
          })),
        )

      const recorded = await recordExperimentLoop(
        handle.run_dir,
        { plan, host_runner: repeated, container_runner: repeated },
        options,
      )
      const proposed = recorded.report.statistics?.find(
        (item) => item.experiment_id === "proposed" && item.environment === "host",
      )
      expect(proposed?.n).toBe(3)
      expect(proposed?.mean).toBeCloseTo(0.92, 6)
      expect(proposed?.std).toBeCloseTo(0.02, 6)
      expect(recorded.report.significance?.length).toBe(3)
      expect(recorded.report.significance?.every((item) => item.test === "welch_t" && item.p < 0.01)).toBe(true)

      const ledger = composeClaimLedger({ topic: "Repeated trials", claims: [], now })
      const draft = composeDraftPaper({
        title: "Repeated trials",
        ledger,
        experiment_plan: plan,
        experiment_runs: { host_runs: recorded.host_runs, container_runs: recorded.container_runs },
        result_report: recorded.report,
        now,
      })
      expect(draft.markdown).toContain("±")
      expect(draft.markdown).toContain("(n=3)")
      expect(draft.markdown).toContain("Welch")
      expect(draft.markdown).toMatch(/p [<=]/)
    } finally {
      await clean(dir)
    }
  })

  test("plans baselines, records successful host exploration, and passes container reproduction", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "papercode-experiment-test-"))
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
        ...protocols,
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
            proposed: 0.84,
            "baseline-bm25": 0.66,
            "baseline-dense": 0.74,
            "baseline-rag": 0.78,
            "ablation-no-claim-ledger": 0.79,
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

      let containerCalls = 0
      const skipped = await recordExperimentLoop(
        handle.run_dir,
        {
          plan,
          host_runner: metricRunner({ proposed: 0.84 }),
          container_runner: async (...args) => {
            containerCalls++
            return metricRunner({})(...args)
          },
          container_reproduction: false,
        },
        options,
      )
      expect(containerCalls).toBe(0)
      expect(skipped.container_runs).toEqual([])
      expect(skipped.report).toMatchObject({ reproduction: { status: "not_run" }, final_claims_allowed: false })
    } finally {
      await clean(dir)
    }
  })

  test("flags an underperforming proposed method against baselines", async () => {
    const plan = planExperiments({
      topic: "retrieval",
      method_name: "weak reranker",
      dataset_ids: ["fixture"],
      ...protocols,
      now,
    })
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

    const containerRuns = await runContainerReproduction(
      plan,
      runs,
      metricRunner({
        proposed: 0.6,
        "baseline-bm25": 0.68,
        "baseline-dense": 0.7,
        "baseline-rag": 0.72,
        "ablation-no-claim-ledger": 0.59,
      }),
      { now },
    )
    const report = analyzeExperimentResults({ plan, host_runs: runs, container_runs: containerRuns, now })
    expect(report.recommendation).toBe("revise")
    expect(report.findings.map((item) => item.category)).toContain("underperforming_method")
  })

  test("classifies environment failures separately from method failures", async () => {
    const plan = planExperiments({
      topic: "retrieval",
      method_name: "reranker",
      dataset_ids: ["fixture"],
      ...protocols,
      now,
    })
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
    const plan = planExperiments({
      topic: "retrieval",
      method_name: "reranker",
      dataset_ids: ["fixture"],
      ...protocols,
      now,
    })
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
    const plan = planExperiments({
      topic: "retrieval",
      method_name: "reranker",
      dataset_ids: ["fixture"],
      ...protocols,
      now,
    })
    const hostRuns = await runHostExploration(plan, metricRunner({ proposed: 0.8, "baseline-bm25": 0.7 }), { now })
    const containerRuns = await runContainerReproduction(plan, hostRuns, metricRunner({}, "failed"), { now })
    const report = analyzeExperimentResults({ plan, host_runs: hostRuns, container_runs: containerRuns, now })

    expect(report.reproduction.status).toBe("failed")
    expect(report.final_claims_allowed).toBe(false)
    expect(report.blockers).toContain("container_reproduction_failed")
  })
})
