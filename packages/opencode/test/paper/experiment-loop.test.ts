import { describe, expect, test } from "bun:test"
import {
  classifyExperimentClaimEligibility,
  parseExperimentLogMetrics,
  resolveExperimentLoopCapabilities,
  type ExperimentClaimEligibility,
} from "@/paper"
import { createResearchCapabilityRegistry, defaultResearchCapabilities } from "@/paper"
import type { ResultReport } from "@/paper/research/experiments"

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
})
