import { describe, expect, test } from "bun:test"
import {
  classifyExperimentClaimEligibility,
  parseExperimentLogMetrics,
  resolveExperimentLoopCapabilities,
  type ExperimentClaimEligibility,
} from "@/paper"
import { createResearchCapabilityRegistry, defaultResearchCapabilities } from "@/paper"
import { analyzeExperimentResults, planExperiments, type ResultReport } from "@/paper/research/experiments"

const passedReport: ResultReport = {
  schema_version: "ResultReport.v1",
  plan_id: "plan-1",
  created_at: "2026-05-09T00:00:00Z",
  primary_metric: "accuracy",
  best_baseline: { experiment_id: "baseline", value: 0.7 },
  proposed: { experiment_id: "proposed", value: 0.82 },
  findings: [],
  blockers: [],
  recommendation: "accept",
  reproduction: { status: "passed", container_run_ids: ["container-1"] },
  final_claims_allowed: true,
}

describe("paper experiment MCP loop", () => {
  test("resolves notebook, shell, and Python experiment capabilities", () => {
    const capabilities = resolveExperimentLoopCapabilities(createResearchCapabilityRegistry(defaultResearchCapabilities()))

    expect(capabilities.map((capability) => capability.name)).toEqual(
      expect.arrayContaining([
        "skill.jupyter-notebook",
        "opencode.shell",
        "python.experiment-log-parse",
        "python.dataset-metadata-probe",
        "hf.jobs",
        "hf.trackio",
      ]),
    )
  })

  test("parses experiment logs into metric records", () => {
    expect(parseExperimentLogMetrics("accuracy=0.842\nlatency_ms: 120\nloss 0.31")).toEqual([
      { name: "accuracy", value: 0.842, direction: "higher_better" },
      { name: "latency_ms", value: 120, direction: "lower_better", unit: "ms" },
      { name: "loss", value: 0.31, direction: "lower_better" },
    ])
  })

  test("allows final claims only for reproduced results", () => {
    const eligibility = classifyExperimentClaimEligibility({ report: passedReport })

    expect(eligibility satisfies ExperimentClaimEligibility).toEqual({
      status: "claimable",
      final_claim_allowed: true,
      citation_label: "reproduced",
      blockers: [],
    })
  })

  test("blocks final claims for unreproduced results unless explicitly exploratory", () => {
    const failedReport: ResultReport = {
      ...passedReport,
      reproduction: { status: "failed", container_run_ids: [] },
      final_claims_allowed: false,
      blockers: ["container_reproduction_failed"],
      recommendation: "block",
    }

    expect(classifyExperimentClaimEligibility({ report: failedReport })).toMatchObject({
      status: "blocked",
      final_claim_allowed: false,
      blockers: ["container_reproduction_failed"],
    })
    expect(classifyExperimentClaimEligibility({ report: failedReport, exploratory: true })).toMatchObject({
      status: "exploratory_only",
      final_claim_allowed: false,
      citation_label: "exploratory",
      blockers: [],
    })
  })

  test("blocks final claims when code experiment protocol has no baseline", () => {
    const plan = planExperiments({
      topic: "code protocol",
      method_name: "proposed code workflow",
      dataset_ids: [],
      primary_metric: "typecheck_pass",
      proposed_command: { argv: ["bun run typecheck"], timeout_seconds: 120 },
      baseline_specs: [],
      ablation_specs: [],
      include_default_baselines: false,
      now: "2026-05-09T00:00:00Z",
    })
    const report = analyzeExperimentResults({
      plan,
      now: "2026-05-09T00:00:00Z",
      host_runs: [
        {
          schema_version: "ExperimentRun.v1",
          experiment_run_id: "host:proposed",
          plan_id: plan.plan_id,
          experiment_id: "proposed",
          role: "proposed",
          status: "succeeded",
          environment: { mode: "host", platform: process.platform, node: process.version },
          command: plan.proposed.command,
          metrics: [{ name: "typecheck_pass", value: 1, direction: "higher_better", unit: "ratio" }],
          stdout: "typecheck passed",
          stderr: "",
          exit_code: 0,
          resource_usage: { wall_time_seconds: 1 },
          started_at: "2026-05-09T00:00:00Z",
          finished_at: "2026-05-09T00:00:00Z",
          reproduction: { container_reproduced: false },
        },
      ],
      container_runs: [
        {
          schema_version: "ExperimentRun.v1",
          experiment_run_id: "container:proposed",
          plan_id: plan.plan_id,
          experiment_id: "proposed",
          role: "proposed",
          status: "succeeded",
          environment: { mode: "container", platform: "container", image: "local", digest: "sha256:test" },
          command: plan.proposed.command,
          metrics: [{ name: "container_reproduction_pass", value: 1, direction: "higher_better", unit: "ratio" }],
          stdout: "container reproduction passed",
          stderr: "",
          exit_code: 0,
          resource_usage: { wall_time_seconds: 1 },
          started_at: "2026-05-09T00:00:00Z",
          finished_at: "2026-05-09T00:00:00Z",
          reproduction: { container_reproduced: true, image: "local", digest: "sha256:test" },
        },
      ],
    })

    expect(report.reproduction.status).toBe("passed")
    expect(report.final_claims_allowed).toBe(false)
    expect(report.blockers).toContain("experiment_protocol_incomplete")
  })

  test("does not allocate GPU budget unless explicitly requested", () => {
    const defaultPlan = planExperiments({
      topic: "deterministic ranking protocol",
      method_name: "ranking workflow",
      dataset_ids: ["dataset:ranking"],
      primary_metric: "ranking_ndcg_at_3",
      include_default_baselines: false,
      now: "2026-05-09T00:00:00Z",
    })

    expect(defaultPlan.resource_budget.max_gpu_hours).toBe(0)

    const gpuPlan = planExperiments({
      topic: "vision model fine-tuning",
      method_name: "gpu training workflow",
      dataset_ids: ["dataset:images"],
      primary_metric: "accuracy",
      include_default_baselines: false,
      resource_budget: { max_wall_time_seconds: 7200, max_memory_mb: 32768, max_gpu_hours: 2 },
      now: "2026-05-09T00:00:00Z",
    })

    expect(gpuPlan.resource_budget).toEqual({
      max_wall_time_seconds: 7200,
      max_memory_mb: 32768,
      max_gpu_hours: 2,
    })
  })
})
