import { describe, expect, test } from "bun:test"
import { discoverDatasets, openVerifiedDatasets } from "@/paper/research/sources"
import { checkDataAndExperiments } from "@/paper/research/verification"
import type { ResultReport } from "@/paper/research/experiments"
import type { ClaimLedger, DraftPaper } from "@/paper/research/writing"

const now = "2026-05-31T00:00:00Z"

describe("dataset discovery", () => {
  test("does not treat placeholder dataset locators as open verified data", () => {
    const plan = discoverDatasets({
      topic: "Claim-aware retrieval",
      now,
      candidates: [
        {
          dataset_id: "dataset-placeholder",
          source_id: "source-dataset-placeholder",
          title: "Placeholder Dataset",
          url: "https://example.org/dataset",
          provider: "unit-test",
          license: { status: "clear", expression: "CC-BY-4.0" },
          version: { value: "v1", retrieved_at: now },
          verification: { status: "verified", method: "unit-test", checked_at: now },
          access: "open",
          task_fit: 0.9,
        },
      ],
    })

    expect(openVerifiedDatasets(plan)).toEqual([])
    expect(plan.diagnostics.gaps).toContain("no_open_verified_dataset")
    expect(plan.diagnostics.verification_failures).toContainEqual({
      dataset_id: "dataset-placeholder",
      reason: "placeholder_dataset_locator",
    })
    expect(plan.recommendation).toBe("turn")
  })

  test("blocks final data checks when only placeholder datasets are present", () => {
    const dataPlan = discoverDatasets({
      topic: "Claim-aware retrieval",
      now,
      candidates: [
        {
          dataset_id: "dataset-placeholder",
          source_id: "source-dataset-placeholder",
          title: "Placeholder Dataset",
          url: "https://example.org/dataset",
          provider: "unit-test",
          license: { status: "clear", expression: "CC-BY-4.0" },
          version: { value: "v1", retrieved_at: now },
          verification: { status: "verified", method: "unit-test", checked_at: now },
          access: "open",
          task_fit: 0.9,
        },
      ],
    })
    const ledger: ClaimLedger = {
      schema_version: "ClaimLedger.v1",
      topic: "Claim-aware retrieval",
      created_at: now,
      entries: [],
      unsupported_claim_ids: [],
    }
    const draft: DraftPaper = {
      schema_version: "DraftPaper.v1",
      draft_id: "draft-1",
      title: "Claim-aware retrieval",
      created_at: now,
      version: 1,
      sections: [],
      markdown: "",
      claim_ids: [],
      applied_guidance_ids: [],
    }
    const resultReport: ResultReport = {
      schema_version: "ResultReport.v1",
      plan_id: "plan-1",
      created_at: now,
      primary_metric: "nDCG@3",
      findings: [],
      blockers: [],
      recommendation: "accept",
      reproduction: { status: "passed", container_run_ids: ["container-run-1"] },
      final_claims_allowed: true,
    }

    const findings = checkDataAndExperiments({
      ledger,
      draft,
      data_plan: dataPlan,
      result_report: resultReport,
      available_source_ids: [],
      model_reviews: [],
      now,
    })

    expect(findings).toContainEqual(
      expect.objectContaining({
        category: "missing_open_dataset",
        severity: "blocker",
        source_ids: ["dataset-placeholder"],
      }),
    )
  })
})
