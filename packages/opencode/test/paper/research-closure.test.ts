import { describe, expect, test } from "bun:test"
import {
  createExperimentNoveltyGate,
  createNoveltyCheckpoint,
  createGlobalFigureSpec,
  createPaperSpine,
} from "@/paper"
import type { ResearchIntakeRequest } from "@/paper"
import type { SourceRecord } from "@/paper/research/sources"

const now = "2026-05-26T00:00:00Z"

const request: ResearchIntakeRequest = {
  topic: "agent team for research papers",
  language: "zh-CN",
}

function source(input: Partial<SourceRecord> & Pick<SourceRecord, "source_id" | "title">): SourceRecord {
  return {
    schema_version: "SourceRecord.v1",
    source_id: input.source_id,
    kind: input.kind ?? "paper",
    title: input.title,
    url: input.url ?? `https://example.test/${input.source_id}`,
    provider: input.provider ?? "unit-test",
    license: input.license ?? { status: "clear", expression: "CC-BY-4.0" },
    version: input.version ?? { value: "v1", retrieved_at: now },
    verification: input.verification ?? {
      status: "verified",
      method: "unit-test",
      checked_at: now,
      diagnostics: [],
    },
    topics: input.topics ?? [request.topic],
    retrieved_at: input.retrieved_at ?? now,
  }
}

describe("Paper Fucker research closure contracts", () => {
  test("novelty checkpoint only blocks exact duplicate or explicit duplicate diagnostics", () => {
    const related = createNoveltyCheckpoint({
      request,
      stage: "literature",
      now,
      sources: [
        source({
          source_id: "related",
          title: "agent team for research papers benchmark study",
        }),
      ],
    })

    expect(related.status).toBe("needs_review")
    expect(related.conflicts[0]?.severity).toBe("medium")

    const duplicate = createNoveltyCheckpoint({
      request,
      stage: "experiment_design",
      now,
      sources: [
        source({
          source_id: "duplicate",
          title: "agent team for research papers",
        }),
      ],
    })
    const gate = createExperimentNoveltyGate({ checkpoint: duplicate, now })

    expect(duplicate.status).toBe("redirect_required")
    expect(gate.status).toBe("redirect_required")
    expect(gate.allowed_to_run_expensive_experiments).toBe(false)
  })

  test("PaperSpine and GlobalFigure become ready only when claims have evidence", () => {
    const checkpoint = createNoveltyCheckpoint({
      request,
      stage: "claim_ledger",
      now,
      sources: [
        source({
          source_id: "paper-1",
          title: "Evidence-grounded multi-agent research workflow",
        }),
      ],
    })
    const spine = createPaperSpine({
      run_id: "run-closure",
      title: request.topic,
      novelty: checkpoint,
      sources: [{ source_id: "paper-1", title: "Evidence-grounded multi-agent research workflow" }],
      claims: [
        {
          claim_id: "claim-1",
          text: "Agent teams improve paper research coverage when every claim is source-bound.",
          status: "supported",
          source_ids: ["paper-1"],
          artifact_ids: ["artifact-1"],
        },
      ],
      now,
    })
    const figure = createGlobalFigureSpec({
      run_id: "run-closure",
      title: request.topic,
      target_profile: "nature-paper",
      spine,
      now,
    })

    expect(spine.readiness).toBe("ready")
    expect(spine.central_claim).toContain("Agent teams")
    expect(figure.status).toBe("ready")
    expect(figure.panels.map((panel) => panel.panel_id)).toEqual(["A", "B", "C", "D"])
    expect(figure.checks.every((check) => check.status === "passed")).toBe(true)
  })
})
