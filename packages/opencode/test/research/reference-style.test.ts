import { describe, expect, test } from "bun:test"
import { composeClaimLedger, composeDraftPaper } from "@/paper/research/writing"
import type { PaperReferenceStyle } from "@/paper/research/writing"
import { paperReferenceStyle } from "@/paper/profiles"

const now = "2026-10-19T00:00:00Z"

function literatureMap() {
  const sources = [
    {
      schema_version: "SourceRecord.v1" as const,
      source_id: "paper-a",
      kind: "paper" as const,
      title: "Evidence-Constrained Retrieval",
      url: "https://arxiv.org/abs/2402.10000",
      provider: "arxiv",
      license: { status: "clear" as const, expression: "arXiv" },
      version: { value: "v1", retrieved_at: now, published_at: "2024-02-01" },
      verification: { status: "verified" as const, method: "unit-test", checked_at: now },
      authors: ["Ada Lovelace", "Alan Turing"],
      arxiv_id: "2402.10000",
      doi: "10.1000/xyz",
      retrieved_at: now,
    },
  ]
  return {
    schema_version: "LiteratureMap.v1" as const,
    topic: "Retrieval",
    created_at: now,
    sources,
    clusters: [],
    summary: { total_sources: sources.length, verified_sources: sources.length, open_license_sources: sources.length },
    diagnostics: { verification_failures: [], gaps: [] },
  }
}

function references(style: PaperReferenceStyle) {
  const ledger = composeClaimLedger({ topic: "Retrieval", claims: [], now })
  const draft = composeDraftPaper({ title: "Retrieval", ledger, literature_map: literatureMap(), reference_style: style, now })
  return draft.sections.find((section) => section.section_id === "references")?.markdown ?? ""
}

describe("reference styles", () => {
  test("formats the same entry for each venue convention", () => {
    const gb = references("gb7714")
    expect(gb).toContain("[J/OL].")
    expect(gb).toContain("2024-02-01")

    const ieee = references("ieee")
    expect(ieee).toContain('"Evidence-Constrained Retrieval,"')
    expect(ieee).toContain("[Online]. Available:")
    expect(ieee).not.toContain("[J/OL]")

    const acm = references("acm")
    expect(acm).toContain("2024.")
    expect(acm).toContain("arXiv.")
    expect(acm).not.toContain("[J/OL]")

    const elsevier = references("elsevier")
    expect(elsevier).toContain("2024")
    expect(elsevier).toContain("https://arxiv.org/abs/2402.10000")
    expect(elsevier).not.toContain("[J/OL]")
  })

  test("maps each profile to its convention", () => {
    expect(paperReferenceStyle("cjc-paper")).toBe("gb7714")
    expect(paperReferenceStyle(undefined)).toBe("gb7714")
    expect(paperReferenceStyle("international-q1")).toBe("elsevier")
    expect(paperReferenceStyle("ieee-paper")).toBe("ieee")
    expect(paperReferenceStyle("acm-paper")).toBe("acm")
  })
})
