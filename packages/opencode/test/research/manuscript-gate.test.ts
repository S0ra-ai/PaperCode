import { describe, expect, test } from "bun:test"
import { composeClaimLedger, composeDraftPaper } from "@/paper/research/writing"
import type { DraftPaper } from "@/paper/research/writing"
import { discoverDatasets } from "@/paper/research/sources"
import type { ResultReport } from "@/paper/research/experiments"
import {
  CJC_MANUSCRIPT_REQUIREMENTS,
  Q1_MANUSCRIPT_REQUIREMENTS,
  checkManuscriptQuality,
  evaluateVerificationGate,
  manuscriptRequirementsForProfile,
  type VerificationGateInput,
} from "@/paper/research/verification"

const now = "2026-10-19T00:00:00Z"

function draftWith(sections: Record<string, string>): DraftPaper {
  const entries = Object.entries(sections)
  return {
    schema_version: "DraftPaper.v1",
    draft_id: "draft:submission",
    title: "A Submission-Grade Manuscript",
    created_at: now,
    version: 1,
    sections: entries.map(([section_id, markdown]) => ({
      section_id,
      title: section_id,
      level: 2,
      markdown,
      claim_ids: [],
      source_ranges: [],
    })),
    markdown: entries.map(([id, markdown]) => `## ${id}\n\n${markdown}`).join("\n\n"),
    claim_ids: [],
    applied_guidance_ids: [],
  }
}

const prose = (sentence: string) => Array.from({ length: 8 }, () => sentence).join(" ")
const words = (count: number) => Array.from({ length: count }, (_, index) => `token${index}`).join(" ")

const resultReport: ResultReport = {
  schema_version: "ResultReport.v1",
  plan_id: "plan-1",
  created_at: now,
  primary_metric: "accuracy",
  best_baseline: { experiment_id: "experiment-baseline", value: 0.88 },
  proposed: { experiment_id: "experiment-proposed", value: 0.91 },
  findings: [],
  blockers: [],
  recommendation: "accept",
  reproduction: { status: "passed", container_run_ids: [] },
  final_claims_allowed: true,
}

const references = Array.from(
  { length: 40 },
  (_, index) => `[${index + 1}] Author ${index}. Study ${index}[J/OL]. ${2021 + (index % 5)}-01-01. https://doi.org/10.1000/x${index}.`,
).join("\n")

const submissionSections: Record<string, string> = {
  abstract: words(180),
  keywords: "retrieval, evaluation, reproducibility, statistics, benchmark",
  introduction: prose("The introduction states the problem and the contribution."),
  related_work: prose("Prior work is compared along a shared dimension."),
  method: prose("The method section describes the proposed procedure."),
  experimental_setup: prose("The setup names the dataset, baselines and metrics."),
  results: [
    prose("Results report the primary metric against the strongest baseline."),
    "| Method | Accuracy |",
    "| --- | --- |",
    "| Baseline | 0.880 |",
    "| Ours | 0.910 |",
    "",
    "| Ablation | Accuracy |",
    "| --- | --- |",
    "| w/o module | 0.890 |",
    "| full | 0.910 |",
    "",
    "Accuracy is 0.910 ± 0.004 over five seeds and the difference is significant (p = 0.003, Wilcoxon signed-rank).",
    "![Figure 1: primary result](figures/result.png)",
  ].join("\n"),
  discussion: prose("The discussion separates what the evidence supports from what it does not."),
  conclusion: prose("The conclusion restates the supported claim."),
  references,
  data_availability:
    "The evaluation dataset is public at https://zenodo.org/record/123 and the implementation is available at https://github.com/example/repo.",
  declarations: [
    "| Item | Declaration |",
    "| --- | --- |",
    "| Funding | National Key R&D Program 2024AAA123. |",
    "| Author contributions | A.B. designed the study; C.D. ran the experiments. |",
    "| Competing interests | The authors declare no competing interests. |",
    "| Ethics | Not applicable; no human or animal subjects were involved. |",
    "| Generative AI disclosure | An LLM assisted with language editing; the authors verified all content. |",
  ].join("\n"),
}

function gateInput(overrides: Partial<VerificationGateInput> = {}): VerificationGateInput {
  const ledger = composeClaimLedger({ topic: "Submission", claims: [], now })
  return {
    ledger,
    draft: draftWith(submissionSections),
    data_plan: discoverDatasets({ topic: "Submission", candidates: [] }),
    result_report: resultReport,
    available_source_ids: [],
    model_reviews: [],
    manuscript_requirements: Q1_MANUSCRIPT_REQUIREMENTS,
    now,
    ...overrides,
  }
}

const categories = (input: VerificationGateInput) =>
  checkManuscriptQuality(input).map((finding) => finding.category)

describe("manuscript quality gate", () => {
  test("passes a submission-grade manuscript", () => {
    expect(checkManuscriptQuality(gateInput())).toEqual([])
  })

  test("blocks a manuscript with no references", () => {
    const draft = draftWith({ ...submissionSections, references: "No references were registered for this run." })
    const findings = checkManuscriptQuality(gateInput({ draft }))
    expect(findings.map((finding) => finding.category)).toContain("insufficient_references")
    expect(findings.find((finding) => finding.category === "insufficient_references")?.severity).toBe("blocker")
  })

  test("blocks placeholder markers", () => {
    const draft = draftWith({ ...submissionSections, method: `${submissionSections.method} TODO: add the formula.` })
    expect(categories(gateInput({ draft }))).toContain("placeholder_text")
  })

  test("blocks a declaration the manuscript leaves as undeclared", () => {
    const draft = draftWith({
      ...submissionSections,
      declarations: submissionSections.declarations.replace(
        "| Competing interests | The authors declare no competing interests. |",
        "| Competing interests | 未声明。 |",
      ),
    })
    const findings = checkManuscriptQuality(gateInput({ draft }))
    const missing = findings.find((finding) => finding.category === "missing_statement")
    expect(missing?.severity).toBe("blocker")
    expect(missing?.message).toContain("利益冲突")
  })

  test("blocks a baseline comparison without statistics", () => {
    const draft = draftWith({
      ...submissionSections,
      results: submissionSections.results.replace(/Accuracy is 0\.910.*\n/, ""),
    })
    const findings = checkManuscriptQuality(gateInput({ draft }))
    expect(findings.map((finding) => finding.category)).toContain("missing_statistics")
  })

  test("blocks a Chinese manuscript for an English venue", () => {
    const draft = draftWith({
      ...submissionSections,
      abstract: prose("本文提出一种可复现的评测方法。"),
      introduction: prose("引言说明问题与贡献。"),
    })
    expect(categories(gateInput({ draft }))).toContain("manuscript_language")
  })

  test("blocks a required section that carries no prose", () => {
    const draft = draftWith({ ...submissionSections, discussion: "Too short." })
    const findings = checkManuscriptQuality(gateInput({ draft }))
    expect(findings.map((finding) => finding.category)).toContain("missing_section_content")
    expect(findings.find((finding) => finding.category === "missing_section_content")?.severity).toBe("blocker")
  })

  test("does not run without requirements", () => {
    expect(checkManuscriptQuality(gateInput({ manuscript_requirements: undefined }))).toEqual([])
  })

  test("the verification gate reports manuscript findings when requirements are supplied", () => {
    const input = gateInput({
      draft: draftWith({ ...submissionSections, references: "No references were registered for this run." }),
    })
    const gate = evaluateVerificationGate(input)
    expect(gate.blocking_report.blockers.map((finding) => finding.category)).toContain("insufficient_references")
  })

  test("maps CJC to the Chinese profile and everything else to the international one", () => {
    expect(manuscriptRequirementsForProfile("cjc-paper")).toBe(CJC_MANUSCRIPT_REQUIREMENTS)
    expect(manuscriptRequirementsForProfile("international-q1")).toBe(Q1_MANUSCRIPT_REQUIREMENTS)
    expect(manuscriptRequirementsForProfile(undefined).language).toBe("en")
  })

  test("renders enough references for the international bar", () => {
    const sources = Array.from({ length: 45 }, (_, index) => ({
      schema_version: "SourceRecord.v1" as const,
      source_id: `paper-${index + 1}`,
      kind: "paper" as const,
      title: `Study ${index + 1}`,
      url: `https://arxiv.org/abs/2402.${String(10000 + index).padStart(5, "0")}`,
      provider: "arxiv",
      license: { status: "clear" as const, expression: "arXiv" },
      version: { value: "v1", retrieved_at: now, published_at: "2024-02-01" },
      verification: { status: "verified" as const, method: "unit-test", checked_at: now },
      retrieved_at: now,
    }))
    const draft = composeDraftPaper({
      title: "Reference Bar",
      ledger: composeClaimLedger({ topic: "Reference Bar", claims: [], now }),
      literature_map: {
        schema_version: "LiteratureMap.v1",
        topic: "Reference Bar",
        created_at: now,
        sources,
        clusters: [],
        summary: { total_sources: sources.length, verified_sources: sources.length, open_license_sources: sources.length },
        diagnostics: { verification_failures: [], gaps: [] },
      },
      now,
    })
    const findings = checkManuscriptQuality(gateInput({ draft }))
    expect(findings.map((finding) => finding.category)).not.toContain("insufficient_references")
  })
})
