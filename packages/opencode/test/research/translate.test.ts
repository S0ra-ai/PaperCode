import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import os from "os"
import path from "path"
import { composeClaimLedger, composeDraftPaper } from "@/paper/research/writing"
import { createResearchRun, type ResearchRuntimeOptions } from "@/paper/research/runtime"
import { translatorFromEnv, translateDraftSections } from "@/paper/translate"
import { runPaperAuthoringLoop } from "@/paper"

const now = "2026-10-19T00:00:00Z"

function runtimeOptions(workspace: string, home: string): ResearchRuntimeOptions {
  let index = 0
  return { workspace, home, clock: () => new Date(now), idFactory: (kind) => `${kind}-${++index}` }
}

function chineseDraft() {
  const ledger = composeClaimLedger({
    topic: "检索评测",
    claims: [
      {
        text: "该方法在公开基准上提升了检索准确率。",
        section_id: "results",
        confidence: 0.82,
        source_ids: [],
        artifact_ids: [],
      },
    ],
    now,
  })
  return composeDraftPaper({
    title: "证据约束检索",
    ledger,
    result_report: {
      primary_metric: "accuracy",
      proposed: { experiment_id: "proposed", value: 0.91 },
      best_baseline: { experiment_id: "baseline", value: 0.88 },
      blockers: [],
      recommendation: "accept",
      reproduction: { status: "passed", container_run_ids: [] },
      final_claims_allowed: true,
    },
    now,
  })
}

const englishBySection: Record<string, string> = {
  title: "Evidence-Constrained Retrieval",
  abstract: "This paper studies evidence-constrained retrieval and reports a reproducible evaluation.",
  keywords: "retrieval, evaluation, reproducibility",
  introduction: "The introduction states the problem and the contribution of this work.",
  related_work: "Prior work is compared along a shared dimension.",
  method: "The method section describes the proposed procedure.",
  experimental_setup: "The setup names the dataset, baselines and metrics.",
  results: [
    "Results report the primary metric against the strongest baseline (Figure 1, Table 1).",
    "",
    "| Method | Accuracy |",
    "| --- | --- |",
    "| Baseline | 0.880 |",
    "| Ours | 0.910 |",
    "",
    "Accuracy is 0.910 ± 0.004 over five seeds (p = 0.003, Wilcoxon); the effect size is large (Cliff's delta = 1.0).",
    "![Figure 1](figures/primary-metric.png)",
  ].join("\n"),
  discussion: "The discussion separates supported from unsupported claims.",
  conclusion: "The conclusion restates the supported claim.",
  declarations: "| Item | Declaration |\n| --- | --- |\n| Funding | None. |",
  data_availability: "The dataset is available at https://zenodo.org/record/1 and the code at https://github.com/example/repo.",
}

/** A stub that keeps the table/figure skeleton so the structure guard accepts it. */
function countStructure(text: string) {
  return {
    tables: (text.match(/^\s*\|?\s*:?-{3,}/gm) ?? []).length,
    images: (text.match(/!\[[^\]]*\]\([^)]+\)/g) ?? []).length,
  }
}

/** Keep at least as much structure as the source so the translation guard accepts the stub. */
function padStructure(source: string, translated: string) {
  const sourceCounts = countStructure(source)
  const translatedCounts = countStructure(translated)
  const blocks = [translated]
  for (let index = translatedCounts.tables; index < sourceCounts.tables; index++) {
    blocks.push("| A | B |\n| --- | --- |\n| x | y |")
  }
  for (let index = translatedCounts.images; index < sourceCounts.images; index++) {
    blocks.push("![Figure](figures/primary-metric.png)")
  }
  return blocks.join("\n\n")
}

function stubTranslator(overrides: Record<string, string> = englishBySection) {
  return async ({ section_id, text }: { section_id: string; text: string }) => {
    if (section_id.startsWith("heading:")) return "Translated heading"
    if (section_id.startsWith("section_title:")) {
      const id = section_id.slice("section_title:".length)
      return id === "method" ? "Methods" : `Translated ${id.replaceAll("_", " ")}`
    }
    const canned = overrides[section_id] ?? `English text for the ${section_id} section, translated for the venue. It repeats enough words to count as substantive prose.`
    return padStructure(text, canned)
  }
}

describe("draft translation", () => {
  test("is disabled without a configured endpoint", () => {
    expect(translatorFromEnv({})).toBeUndefined()
    expect(translatorFromEnv({ PAPERCODE_TRANSLATE_BASE_URL: "https://example.test/v1" })).toBeUndefined()
  })

  test("replaces the Chinese narrative with English and leaves English sections alone", async () => {
    const draft = chineseDraft()
    const result = await translateDraftSections(draft, stubTranslator())
    expect(result?.overrides.length).toBeGreaterThan(5)
    expect(result?.title).toBe("Evidence-Constrained Retrieval")
    const abstract = result?.overrides.find((override) => override.section_id === "abstract")
    expect(abstract?.markdown).toContain("evidence-constrained retrieval")
    const translatable = new Set(
      draft.sections.map((section) => section.section_id).filter((id) => id !== "references" && !id.startsWith("appendix_")),
    )
    const retranslated = result?.overrides.filter((override) => translatable.has(override.section_id))
    expect(retranslated?.length).toBeGreaterThan(5)
    expect(retranslated?.every((override) => !/[一-鿿]/.test(override.markdown))).toBe(true)
  })

  test("refuses a translation that drops a table", async () => {
    const draft = chineseDraft()
    const padded = stubTranslator()
    const overrides = await translateDraftSections(draft, async (request) => {
      // This section loses its table on purpose; every other one keeps its structure.
      if (request.section_id === "declarations") return "Funding: none. Competing interests: none."
      return padded(request)
    })
    expect(overrides).toBeUndefined()
  })

  test("refuses a translation that is still Chinese", async () => {
    const draft = chineseDraft()
    const overrides = await translateDraftSections(draft, async () => "这仍然是一段中文。")
    expect(overrides).toBeUndefined()
  })

  test("refuses when the translator fails", async () => {
    const draft = chineseDraft()
    const overrides = await translateDraftSections(draft, async () => {
      throw new Error("endpoint down")
    })
    expect(overrides).toBeUndefined()
  })

  test("strips markdown fences from the model output", async () => {
    const draft = chineseDraft()
    const result = await translateDraftSections(draft, stubTranslator({ ...englishBySection, introduction: "```markdown\nThe introduction in English.\n```" }))
    expect(result?.overrides.find((override) => override.section_id === "introduction")?.markdown).toBe(
      "The introduction in English.",
    )
  })

  test("authoring applies the translation and the gate stops reporting a language mismatch", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "papercode-translate-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "Translation" }, options)
      const ledger = composeClaimLedger({ topic: "Translation", claims: [], now })
      const result = await runPaperAuthoringLoop(
        handle.run_dir,
        {
          title: "Evidence-Constrained Retrieval",
          ledger,
          data_plan: {
            schema_version: "DataPlan.v1",
            topic: "Translation",
            created_at: now,
            datasets: [],
            license_conflicts: [],
            access_constraints: [],
            diagnostics: { verification_failures: [], gaps: [] },
            recommendation: "insufficient",
          } as any,
          result_report: {
            schema_version: "ResultReport.v1",
            plan_id: "plan-1",
            created_at: now,
            primary_metric: "accuracy",
            proposed: { experiment_id: "proposed", value: 0.91 },
            best_baseline: { experiment_id: "baseline", value: 0.88 },
            findings: [],
            blockers: [],
            recommendation: "accept",
            reproduction: { status: "passed", container_run_ids: [] },
            final_claims_allowed: true,
          } as any,
          available_source_ids: [],
          model_reviews: [],
          target_profile: "international-q1",
          translator: stubTranslator(),
          now,
        },
        options,
      )
      expect(result.draft.title).toBe("Evidence-Constrained Retrieval")
      expect(result.draft.sections.find((section) => section.section_id === "abstract")?.markdown).toContain(
        "evidence-constrained retrieval",
      )
      expect(result.verification.blocking_report.blockers.map((item) => item.category)).not.toContain(
        "manuscript_language",
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("translation diagnostics", () => {
  test("retries once when the model echoes the source language", async () => {
    let firstTitle = true
    const base = stubTranslator()
    const flaky = async (input: { section_id: string; text: string }) => {
      if (firstTitle && input.section_id === "title") {
        firstTitle = false
        return "证据约束检索"
      }
      return base(input)
    }
    const result = await translateDraftSections(chineseDraft(), flaky)
    expect(result?.title).toBe("Evidence-Constrained Retrieval")
    expect(result?.overrides.length).toBeGreaterThan(5)
  })

  test("reports why a translation was abandoned instead of only returning undefined", async () => {
    const failures: Array<{ section_id: string; reason: string }> = []
    const result = await translateDraftSections(
      chineseDraft(),
      async () => "这仍然是中文。",
      { onFailure: (failure) => failures.push(failure) },
    )
    expect(result).toBeUndefined()
    expect(failures).toHaveLength(1)
    expect(failures[0]?.section_id).toBe("title")
    expect(failures[0]?.reason).toContain("translation still contains Chinese")
  })

  test("reports endpoint errors with the failing section", async () => {
    const failures: Array<{ section_id: string; reason: string }> = []
    const result = await translateDraftSections(
      chineseDraft(),
      async () => {
        throw new Error("translation endpoint returned 401")
      },
      { onFailure: (failure) => failures.push(failure) },
    )
    expect(result).toBeUndefined()
    expect(failures).toEqual([{ section_id: "title", reason: "request failed: translation endpoint returned 401" }])
  })
})

describe("translated titles", () => {
  test("drops a Chinese parenthetical the model appends to an English title", async () => {
    const base = stubTranslator()
    const translator = async (input: { section_id: string; text: string }) =>
      input.section_id === "section_title:reproducibility" ? "Reproducibility（可复现性）" : base(input)
    const result = await translateDraftSections(chineseDraft(), translator)
    expect(result?.overrides.find((override) => override.section_id === "reproducibility")?.title).toBe(
      "Reproducibility",
    )
  })

  test("strips heading markers and retries commentary instead of writing it into the manuscript", async () => {
    const base = stubTranslator()
    let commentarySent = false
    const translator = async (input: { section_id: string; text: string }) => {
      if (input.section_id === "section_title:data_availability") return "## Data and Code Availability"
      if (input.section_id === "section_title:limitations" && !commentarySent) {
        commentarySent = true
        return "It looks like only the word “限制” was provided. Please paste the section you want translated."
      }
      return base(input)
    }
    const result = await translateDraftSections(chineseDraft(), translator)
    const dataAvailability = result?.overrides.find((override) => override.section_id === "data_availability")
    expect(dataAvailability?.title).toBe("Data and Code Availability")
    const limitations = result?.overrides.find((override) => override.section_id === "limitations")
    expect(limitations?.title).not.toContain("looks like")
    expect(limitations?.title).toBe("Translated limitations")
  })
})

describe("headings in kept sections", () => {
  test("translates appendix headings without translating the kept body", async () => {
    const result = await translateDraftSections(chineseDraft(), stubTranslator())
    const appendix = result?.overrides.find(
      (override) => override.section_id === "appendix_operational_reproducibility_checklist",
    )
    expect(appendix?.markdown).toContain("### Translated heading")
    expect(appendix?.markdown).not.toContain("### 复现实验入口")
  })
})
