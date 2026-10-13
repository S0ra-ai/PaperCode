import { describe, expect, test } from "bun:test"
import { analyzeExperimentResults } from "@/paper/research/experiments/analysis"
import { planExperiments } from "@/paper/research/experiments/planning"
import { runContainerReproduction, runHostExploration } from "@/paper/research/experiments/runner"
import type { ExperimentRunner, ExperimentRun } from "@/paper/research/experiments/schemas"

const plan = planExperiments({
  topic: "explicit reproduction protocol",
  method_name: "proposed",
  dataset_ids: ["fixture"],
  proposed_command: { argv: ["python", "proposed.py"] },
  baseline_specs: [
    {
      experiment_id: "baseline",
      label: "baseline",
      command: { argv: ["python", "baseline.py"] },
      rationale: "fixture control",
    },
  ],
  ablation_specs: [],
  include_default_baselines: false,
})

// Simulated evidence for gate unit tests; these tests do not execute Docker.
const processFixture: ExperimentRunner = (spec, environment) => ({
  status: "succeeded",
  command: spec.command,
  execution: {
    kind: "process",
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
  metrics: [{ name: "accuracy", value: spec.role === "proposed" ? 0.9 : 0.7, direction: "higher_better" }],
  stdout: "fixture measurement",
  stderr: "",
  exit_code: 0,
})

async function fixture() {
  const host_runs = await runHostExploration(plan, processFixture)
  const container_runs = await runContainerReproduction(plan, host_runs, processFixture)
  return { plan, host_runs, container_runs }
}

describe("experiment reproduction gate", () => {
  test("passes only complete matching process measurements with isolation evidence", async () => {
    const input = await fixture()
    expect(analyzeExperimentResults(input)).toMatchObject({
      reproduction: { status: "passed" },
      final_claims_allowed: true,
    })
  })

  test("successful callbacks without execution evidence are not container reproductions", async () => {
    const input = await fixture()
    const runner: ExperimentRunner = async (spec, environment) => ({
      ...(await processFixture(spec, environment)),
      execution: undefined,
    })
    input.container_runs = await runContainerReproduction(plan, input.host_runs, runner)
    expect(input.container_runs.every((run) => !run.reproduction.container_reproduced)).toBe(true)
    expect(analyzeExperimentResults(input)).toMatchObject({
      reproduction: { status: "failed" },
      final_claims_allowed: false,
    })
  })

  test("imports and legacy records cannot claim process execution", async () => {
    for (const execution of [undefined, { kind: "imported" as const }]) {
      const input = await fixture()
      input.host_runs[0].execution = execution
      const report = analyzeExperimentResults(input)
      expect(report.final_claims_allowed).toBe(false)
      expect(report.blockers).toContain("execution_unverified")
    }
  })

  test("partial coverage, duplicates, wrong plan and host relabeling block reproduction", async () => {
    const mutations: Array<(runs: ExperimentRun[]) => void> = [
      (runs) => {
        runs.pop()
      },
      (runs) => {
        runs[1] = structuredClone(runs[0])
      },
      (runs) => {
        runs[0].plan_id = "unrelated-plan"
      },
      (runs) => {
        runs[0].environment.mode = "host"
      },
      (runs) => {
        runs[0].execution!.container = undefined
      },
      (runs) => {
        runs[0].execution!.container!.isolated = false
      },
      (runs) => {
        runs[0].execution!.container!.image_digest = "sha256:placeholder"
      },
    ]
    for (const mutate of mutations) {
      const input = await fixture()
      mutate(input.container_runs)
      expect(analyzeExperimentResults(input)).toMatchObject({
        reproduction: { status: "failed" },
        final_claims_allowed: false,
      })
    }
  })

  test("failed host runs block despite available metric values", async () => {
    const input = await fixture()
    input.host_runs[1].status = "failed"
    const report = analyzeExperimentResults(input)
    expect(report.blockers).toContain("experiment_failed")
    expect(report.final_claims_allowed).toBe(false)
  })

  test("finite, unique, planned primary metrics are required on every experiment", async () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      const input = await fixture()
      input.host_runs[1].metrics[0].value = value
      const report = analyzeExperimentResults(input)
      expect(report.blockers).toContain("metric_missing")
      expect(report.final_claims_allowed).toBe(false)
    }
    const input = await fixture()
    input.container_runs[1].metrics.push({ ...input.container_runs[1].metrics[0] })
    expect(analyzeExperimentResults(input).final_claims_allowed).toBe(false)
  })

  test("unequal host and container primary measurements cannot pass", async () => {
    const input = await fixture()
    input.container_runs[0].metrics[0].value = 0.1
    expect(analyzeExperimentResults(input)).toMatchObject({
      reproduction: { status: "failed" },
      final_claims_allowed: false,
    })
  })

  test("uses bounded configured numeric tolerance and rejects invalid tolerance", async () => {
    const input = await fixture()
    input.plan = { ...plan, reproduction_tolerance: { absolute: 0.01, relative: 0 } }
    input.container_runs[0].metrics[0].value = 0.905
    expect(analyzeExperimentResults(input).reproduction.status).toBe("passed")
    input.plan.reproduction_tolerance = { absolute: NaN, relative: 0 }
    expect(analyzeExperimentResults(input).reproduction.status).toBe("failed")
  })

  test("skipped reproduction remains exploratory and blocks final claims", async () => {
    const input = await fixture()
    input.container_runs = []
    const report = analyzeExperimentResults(input)
    expect(report).toMatchObject({
      reproduction: { status: "not_run" },
      final_claims_allowed: false,
      recommendation: "block",
    })
    expect(report.blockers).toContain("container_reproduction_failed")
  })
})
