import { describe, expect, test } from "bun:test"
import {
  assertAuthenticResearchOutput,
  createStageBlockingDiagnostic,
  ResearchAuthenticityError,
  type ResearchFinalGateState,
} from "@/paper/research/runtime"

const now = "2026-05-09T00:00:00Z"

describe("research authenticity guards", () => {
  test("creates explicit stage blocking diagnostics", () => {
    const diagnostic = createStageBlockingDiagnostic({
      stage: "verification",
      reason: "claim evidence is missing",
      required_action: "attach source ledger entries before final export",
      historical_task_id: "task-014-verification-gate",
    })

    expect(diagnostic).toEqual({
      stage: "verification",
      status: "blocked",
      reason: "claim evidence is missing",
      required_action: "attach source ledger entries before final export",
      historical_task_id: "task-014-verification-gate",
      blocks_final_output: true,
    })
  })

  test("blocks placeholder research facts and final export before the gate passes", () => {
    expect(() =>
      assertAuthenticResearchOutput({
        kind: "claim",
        provenance: { source_type: "placeholder", note: "fixture-only claim" },
      }),
    ).toThrow(ResearchAuthenticityError)

    const blockedGate: ResearchFinalGateState = {
      status: "blocked",
      blockers: ["missing evidence"],
      updated_at: now,
    }
    expect(() =>
      assertAuthenticResearchOutput({
        kind: "final_export",
        provenance: { source_type: "verified", source_ids: ["src:test"], artifact_ids: ["art:test"] },
        final_gate: blockedGate,
      }),
    ).toThrow(/passed authenticity gate/)
  })

  test("allows verified outputs after the final gate passes", () => {
    const passedGate: ResearchFinalGateState = {
      status: "passed",
      blockers: [],
      updated_at: now,
    }
    expect(() =>
      assertAuthenticResearchOutput({
        kind: "final_export",
        provenance: { source_type: "verified", source_ids: ["src:test"], artifact_ids: ["art:test"] },
        final_gate: passedGate,
      }),
    ).not.toThrow()
  })
})
