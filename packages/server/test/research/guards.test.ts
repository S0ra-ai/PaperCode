import { describe, expect, test } from "bun:test"
import {
  assertAuthenticResearchOutput,
  phaseOneStageStubs,
  ResearchAuthenticityError,
  type ResearchFinalGateState,
} from "@/research/runtime"

const now = "2026-05-09T00:00:00Z"

describe("research authenticity guards", () => {
  test("marks phase one downstream research stages as explicit not_implemented stubs", () => {
    const stubs = phaseOneStageStubs()
    expect(stubs.map((stub) => stub.stage)).toEqual([
      "template",
      "literature",
      "data",
      "experiment",
      "writing",
      "verification",
      "export",
    ])
    expect(stubs.every((stub) => stub.status === "not_implemented" && stub.blocks_final_output)).toBe(true)
  })

  test("blocks placeholder research facts and final export before the gate passes", () => {
    expect(() =>
      assertAuthenticResearchOutput({
        kind: "claim",
        provenance: { source_type: "synthetic", note: "fixture-only claim" },
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
