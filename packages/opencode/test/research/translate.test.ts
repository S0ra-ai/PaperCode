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
  abstract: "This paper studies evidence-constrained retrieval and reports a reproducible evaluation.",
  keywords: "retrieval, evaluation, reproducibility",
  introduction: "The introduction states the problem and the contribution of this work.",
  related_work: "Prior work is compared along a shared dimension.",
  method: "The method section describes the proposed procedure.",
  experimental_setup: "The setup names the dataset, baselines and metrics.",
  results: [
    "Results report the primary metric against the strongest baseline.",
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

describe("draft translation", () => {
  test("is disabled without a configured endpoint", () => {
    expect(translatorFromEnv({})).toBeUndefined()
    expect(translatorFromEnv({ PAPERCODE_TRANSLATE_BASE_URL: "https://example.test/v1" })).toBeUndefined()
  })

  test("replaces the Chinese narrative with English and leaves English sections alone", async () => {
    const draft = chineseDraft()
    const overrides = await translateDraftSections(draft, async ({ section_id }) => englishBySection[section_id] ?? "")
    expect(overrides?.length).toBeGreaterThan(5)
    const abstract = overrides?.find((override) => override.section_id === "abstract")
    expect(abstract?.markdown).toContain("evidence-constrained retrieval")
    expect(overrides?.every((override) => !/[一-鿿]/.test(override.markdown))).toBe(true)
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
    const overrides = await translateDraftSections(draft, async ({ section_id }) => {
      if (section_id === "introduction") return "```markdown\nThe introduction in English.\n```"
      return englishBySection[section_id] ?? ""
    })
    expect(overrides?.find((override) => override.section_id === "introduction")?.markdown).toBe(
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
          translator: async ({ section_id }) => englishBySection[section_id] ?? "",
          now,
        },
        options,
      )
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
