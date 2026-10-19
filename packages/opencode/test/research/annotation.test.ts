import { describe, expect, test } from "bun:test"
import {
  annotationRows,
  applyHumanLabels,
  fromCsv,
  quadraticWeightedKappa,
  toCsv,
  type AnnotationDataset,
} from "@/paper/annotation"

const makeDataset = (): AnnotationDataset => ({
  schema_version: "LiveArxivRankingDataset.v3",
  label_policy: "Silver relevance labels.",
  queries: [
    {
      query: "paper ranking",
      candidates: [
        { id: "paper:1", title: "Paper Recommendation", abstract: "A survey, with commas, and notes.", label: 3, label_b: 2 },
        { id: "paper:2", title: "Citation Matching", abstract: "Related work.", label: 1, label_b: 1 },
      ],
    },
    {
      query: "literature review",
      candidates: [{ id: "paper:3", title: "Review Automation", abstract: "Automation.", label: 2, label_b: 3 }],
    },
  ],
})

describe("annotation sheet", () => {
  test("round-trips queries, commas, quotes and newlines", () => {
    const rows = annotationRows(makeDataset())
    expect(rows.map((row) => `${row.query}/${row.candidate_id}`)).toEqual([
      "paper ranking/paper:1",
      "paper ranking/paper:2",
      "literature review/paper:3",
    ])
    const csv = toCsv(rows.map((row) => ({ ...row, notes: 'line one\nline "two", end' })))
    const parsed = fromCsv(csv)
    expect(parsed[0]?.abstract).toBe("A survey, with commas, and notes.")
    expect(parsed[0]?.notes).toBe('line one\nline "two", end')
    expect(parsed[1]?.judge_a).toBe("1")
  })

  test("rejects a sheet without a candidate id column", () => {
    expect(() => fromCsv("query,human_label\npaper ranking,3\n")).toThrow("candidate_id")
  })

  test("imports human labels, preserves the model label and reports agreement", () => {
    const rows = fromCsv(
      toCsv(
        annotationRows(makeDataset()).map((row) => ({
          ...row,
          human_label: row.candidate_id === "paper:1" ? "3" : row.candidate_id === "paper:2" ? "0" : "",
        })),
      ),
    )
    const { dataset: updated, report } = applyHumanLabels(makeDataset(), rows, { importedAt: "2026-10-19T00:00:00Z" })
    expect(report.annotated).toBe(2)
    expect(report.total).toBe(3)
    expect(report.coverage).toBeCloseTo(0.6667, 3)
    const first = updated.queries?.[0]?.candidates[0]
    expect(first?.label).toBe(3)
    expect(first?.label_model).toBe(3)
    expect(first?.human_label).toBe(3)
    expect(updated.queries?.[0]?.candidates[1]?.label).toBe(0)
    expect(updated.queries?.[1]?.candidates[0]?.label).toBe(2)
    expect(report.kappa).toBeDefined()
    expect(updated.label_policy).toBe("Silver relevance labels.")
  })

  test("switches the policy only when every candidate is annotated", () => {
    const rows = fromCsv(
      toCsv(annotationRows(makeDataset()).map((row) => ({ ...row, human_label: row.candidate_id === "paper:2" ? "1" : "2" }))),
    )
    const { dataset: updated, report } = applyHumanLabels(makeDataset(), rows)
    expect(report.coverage).toBe(1)
    expect(updated.label_policy).toContain("Human relevance annotations")
    expect(updated.label_provenance?.human_annotation).toMatchObject({ annotated: 3, total: 3 })
  })
})

describe("quadratic weighted kappa", () => {
  test("is 1 for perfect agreement and undefined without variance", () => {
    expect(quadraticWeightedKappa([0, 1, 2, 3], [0, 1, 2, 3])).toBe(1)
    expect(quadraticWeightedKappa([1, 1, 1], [1, 1, 1])).toBeUndefined()
  })

  test("drops when the ratings disagree", () => {
    const value = quadraticWeightedKappa([3, 3, 0, 0], [0, 0, 3, 3])
    expect(value).toBeLessThan(0)
  })
})
