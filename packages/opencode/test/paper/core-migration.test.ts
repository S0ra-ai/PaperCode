import { describe, expect, test } from "bun:test"

import {
  PAPER_RESEARCH_STAGE_GRAPH,
  normalizeResearchIntake,
  type ResearchIntakeRequest,
} from "@/paper"
import { RESEARCH_SCHEMA_VERSION, storageFacts } from "@/paper/research"

describe("paper core migration", () => {
  test("paper runtime is exported from opencode", () => {
    const request: ResearchIntakeRequest = {
      topic: "source-grounded code-to-paper generation",
      code_paths: ["packages/opencode/src/paper"],
      target_profile: "generic-preprint",
    }

    const brief = normalizeResearchIntake(request)

    expect(brief.workflow).toBe("code_to_paper")
    expect(PAPER_RESEARCH_STAGE_GRAPH.stages.map((stage) => stage.id)).toContain("claim_ledger")
    expect(RESEARCH_SCHEMA_VERSION).toBe("research.v1")
    expect(storageFacts.events).toBe("events.jsonl")
  })
})
