import { describe, expect, test } from "bun:test"
import { discoverDatasets, openVerifiedDatasets } from "@/paper/research/sources"

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
})
