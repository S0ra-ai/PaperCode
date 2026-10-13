import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { exportPaperRun, runPaperRunExperimentProtocol, stopAllPaperRunLivePreviews } from "@/paper/run"
import { createResearchRun, setResearchFinalGate, writeResearchArtifact } from "@/paper/research/runtime"
import { planExperiments } from "@/paper/research/experiments/planning"
import type { ExperimentProtocol } from "@/paper/research/experiments/schemas"

const roots: string[] = []
afterEach(async () => {
  stopAllPaperRunLivePreviews()
  Bun.gc(true)
  await new Promise((resolve) => setTimeout(resolve, 100))
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 })
})

test("rerun uses refreshed explicit IDs, scientific metrics, environment and working directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "papercode-protocol-regression-"))
  roots.push(root)
  const workspace = path.join(root, "workspace")
  const home = path.join(root, "home")
  await mkdir(path.join(workspace, "measure"), { recursive: true })
  await mkdir(path.join(workspace, "experiments"), { recursive: true })
  await writeFile(
    path.join(workspace, "measure", "measure.ts"),
    'console.log(JSON.stringify({metrics:[{name:"loss",value:Number(process.env.MEASURE),direction:"lower_better"}]}))',
  )
  const options = { workspace, home }
  const handle = await createResearchRun(
    { topic: "explicit loss protocol", workspace, metadata: { paper_budget_tier: "deep" } },
    options,
  )
  const command = { argv: ["bun", "run", "measure.ts"], cwd: "measure", env: { MEASURE: "0.9" }, timeout_seconds: 10 }
  const protocol: ExperimentProtocol = {
    schema_version: "ExperimentProtocol.v1",
    discovered_from: "manifest",
    metric_direction: "lower_better",
    gaps: [],
    entries: [
      {
        protocol_id: "method-real",
        role: "proposed",
        label: "real method",
        expected_metric: "loss",
        rationale: "explicit",
        command,
      },
      {
        protocol_id: "control-real",
        role: "baseline",
        label: "real control",
        expected_metric: "loss",
        rationale: "explicit",
        command,
      },
      {
        protocol_id: "isolated",
        role: "container_reproduction",
        label: "unverified script",
        expected_metric: "loss",
        rationale: "must be rejected",
        command: { argv: ["bun", "run", "{experiment_id}"] },
      },
    ],
  }
  const plan = planExperiments({
    topic: "explicit loss protocol",
    method_name: "real method",
    dataset_ids: [],
    proposed_id: "method-real",
    proposed_command: command,
    primary_metric: "loss",
    metric_direction: "lower_better",
    baseline_specs: [{ experiment_id: "control-real", label: "real control", command, rationale: "explicit" }],
    resource_budget: { max_wall_time_seconds: 11, max_memory_mb: 1234, max_gpu_hours: 0 },
    reproduction_tolerance: { absolute: 0.001, relative: 0.002 },
  })
  await writeResearchArtifact(
    handle.run_dir,
    {
      kind: "log",
      logical_path: "experiments/plan.json",
      data: plan,
      metadata: { artifact_schema: "ExperimentPlan.v1" },
    },
    options,
  )
  await writeResearchArtifact(
    handle.run_dir,
    {
      kind: "log",
      logical_path: "experiments/protocol.json",
      data: protocol,
      metadata: { artifact_schema: "ExperimentProtocol.v1" },
    },
    options,
  )
  const refreshed = {
    ...protocol,
    entries: protocol.entries.map((entry) =>
      entry.role === "container_reproduction"
        ? entry
        : { ...entry, command: { ...entry.command, env: { MEASURE: "0.37" } } },
    ),
  }
  await writeFile(path.join(workspace, "experiments", "protocol.json"), JSON.stringify(refreshed))
  const result = await runPaperRunExperimentProtocol(
    handle.run.run_id,
    { dry_run: false, workspace_path: workspace },
    options,
  )
  expect(result.status).toBe("blocked")
  expect(result.host_runs.map((run) => run.experiment_id)).toEqual(["method-real", "control-real"])
  expect(result.host_runs.every((run) => run.status === "succeeded")).toBe(true)
  expect(result.report?.proposed?.value).toBe(0.37)
  expect(result.report?.primary_metric).toBe("loss")
  expect(result.report?.final_claims_allowed).toBe(false)
  const recordedPlan = JSON.parse(
    await readFile(path.join(handle.run_dir, "artifacts", "experiments", "experiment-plan.json"), "utf8"),
  )
  expect(recordedPlan.metrics[0].direction).toBe("lower_better")
  expect(recordedPlan.resource_budget).toEqual(plan.resource_budget)
  expect(recordedPlan.reproduction_tolerance).toEqual(plan.reproduction_tolerance)
  const hostRuns = JSON.parse(
    await readFile(path.join(handle.run_dir, "artifacts", "experiments", "host-runs.json"), "utf8"),
  )
  expect(hostRuns.every((run: { metrics: { value: number }[] }) => run.metrics[0].value === 0.37)).toBe(true)
  const containers = JSON.parse(
    await readFile(path.join(handle.run_dir, "artifacts", "experiments", "container-runs.json"), "utf8"),
  )
  expect(
    containers.every(
      (run: { reproduction: { container_reproduced: boolean } }) => !run.reproduction.container_reproduced,
    ),
  ).toBe(true)
}, 60000)

test("a historical passed gate without execution evidence cannot issue a new final export", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "papercode-legacy-export-"))
  roots.push(root)
  const workspace = path.join(root, "workspace")
  await mkdir(workspace, { recursive: true })
  const options = { workspace, home: path.join(root, "home") }
  const handle = await createResearchRun({ topic: "legacy imported experiment", workspace }, options)
  await setResearchFinalGate(handle.run_dir, { status: "passed", blockers: [] }, options)
  const exported = await exportPaperRun(handle.run.run_id, { forced: false }, options)
  expect(exported.status).toBe("blocked")
  expect(exported.failed_checks).toContain("reproduction_failure")
}, 60000)
