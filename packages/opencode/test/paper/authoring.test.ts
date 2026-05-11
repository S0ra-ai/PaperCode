import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import {
  createRunBoundPreviewSnapshot,
  runPaperAuthoringLoop,
  type PaperAvailabilityBundle,
  type PaperSupplementaryBundle,
} from "@/paper"
import { type ExportRenderer } from "@/paper/research/export"
import { createResearchRun, type ResearchRuntimeOptions } from "@/paper/research/runtime"
import { type DataPlan } from "@/paper/research/sources"
import { type ResultReport } from "@/paper/research/experiments"
import { composeClaimLedger, composeDraftPaper } from "@/paper/research/writing"

const now = "2026-05-09T00:00:00Z"

async function clean(dir: string, attempts = 80): Promise<void> {
  Bun.gc(true)
  await sleep(150)
  return rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch((error) => {
    const retryable =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "EBUSY" || error.code === "EACCES" || error.code === "EPERM")
    if (!retryable) throw error
    if (attempts <= 1) {
      console.warn(`Could not remove temporary authoring test directory ${dir}: ${String(error)}`)
      return
    }
    return clean(dir, attempts - 1)
  })
}

function runtimeOptions(workspace: string, home: string): ResearchRuntimeOptions {
  let index = 0
  return {
    workspace,
    home,
    clock: () => new Date(now),
    idFactory: (kind) => `${kind}-${++index}`,
  }
}

function dataPlan(): DataPlan {
  return {
    schema_version: "DataPlan.v1",
    topic: "Claim-aware retrieval",
    created_at: now,
    datasets: [
      {
        schema_version: "DatasetCard.v1",
        dataset_id: "dataset-open-retrieval",
        source_id: "source-dataset-open-retrieval",
        title: "Open Retrieval Dataset",
        url: "https://example.org/dataset",
        provider: "fixture",
        license: { status: "clear", expression: "CC-BY-4.0" },
        version: { value: "v1", retrieved_at: now },
        verification: { status: "verified", method: "fixture", checked_at: now },
        access: "open",
        task_fit: 0.9,
        created_at: now,
      },
    ],
    license_conflicts: [],
    access_constraints: [],
    diagnostics: { verification_failures: [], gaps: [] },
    recommendation: "use",
  }
}

function resultReport(): ResultReport {
  return {
    schema_version: "ResultReport.v1",
    plan_id: "plan-1",
    created_at: now,
    primary_metric: "accuracy",
    best_baseline: { experiment_id: "baseline", value: 0.71 },
    proposed: { experiment_id: "proposed", value: 0.83 },
    findings: [],
    blockers: [],
    recommendation: "accept",
    reproduction: { status: "passed", container_run_ids: ["run-container-1"] },
    final_claims_allowed: true,
  }
}

const renderers: ExportRenderer = {
  pdf: async () => ({ status: "written", bytes: new TextEncoder().encode("%PDF authoring fixture"), diagnostics: [] }),
  docx: async () => ({ status: "written", bytes: new TextEncoder().encode("DOCX authoring fixture"), diagnostics: [] }),
}

describe("paper authoring loop", () => {
  test("creates a run-bound preview snapshot with claim, citation, reviewer, cost, and agent annotations", () => {
    const ledger = composeClaimLedger({
      topic: "Claim-aware retrieval",
      claims: [
        {
          text: "The method improves retrieval accuracy on the open benchmark.",
          section_id: "results",
          confidence: 0.82,
          source_ids: ["paper-a"],
          artifact_ids: ["artifact-result-report"],
        },
      ],
      now,
    })
    const draft = composeDraftPaper({ title: "Claim-aware Retrieval", ledger, now })

    const snapshot = createRunBoundPreviewSnapshot({
      run_id: "run-1",
      title: draft.title,
      draft,
      ledger,
      review_report: {
        schema_version: "ReviewReport.v1",
        created_at: now,
        reviewers: [{ model: "deepseek-v4-pro", verdict: "warn", message: "Needs clearer limitation." }],
        findings: [
          {
            finding_id: "reviewer_warning:limitations",
            category: "reviewer_warning",
            severity: "warning",
            message: "Clarify limitations.",
            claim_ids: [],
            source_ids: [],
            artifact_ids: [],
            required_action: "Add limitations paragraph.",
          },
        ],
        consensus: "warn",
        escalated: false,
      },
      costs: { llm_usd: 0.12, api_usd: 0.03, total_usd: 0.15 },
      agents: [{ name: "writer", status: "ready", detail: "deepseek/deepseek-v4-pro" }],
      now,
    })

    expect(snapshot.readonly).toBe(true)
    expect(snapshot.artifacts.markdown?.content).toContain("Claim-aware Retrieval")
    expect(snapshot.annotations.map((annotation) => annotation.kind)).toContain("claim")
    expect(snapshot.annotations.map((annotation) => annotation.kind)).toContain("citation")
    expect(snapshot.annotations.map((annotation) => annotation.kind)).toContain("reviewer")
    expect(snapshot.annotations.map((annotation) => annotation.kind)).toContain("cost")
    expect(snapshot.annotations.map((annotation) => annotation.kind)).toContain("agent")
    expect(snapshot.diagnostics.costs.total_usd).toBe(0.15)
  })

  test("runs ClaimLedger-first authoring through final export and supplementary bundles", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-authoring-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "Claim-aware retrieval" }, options)
      const ledger = composeClaimLedger({
        topic: "Claim-aware retrieval",
        claims: [
          {
            text: "The method improves retrieval accuracy on the open benchmark.",
            section_id: "results",
            confidence: 0.82,
            source_ids: ["paper-a", "source-dataset-open-retrieval"],
            artifact_ids: ["artifact-result-report"],
          },
        ],
        now,
      })

      const result = await runPaperAuthoringLoop(
        handle.run_dir,
        {
          title: "Claim-aware Retrieval",
          ledger,
          data_plan: dataPlan(),
          result_report: resultReport(),
          available_source_ids: ["paper-a", "source-dataset-open-retrieval"],
          model_reviews: [
            { model: "deepseek-v4-pro", verdict: "pass" },
            { model: "reviewer-model", verdict: "pass" },
          ],
          target_profile: "nature-paper",
          code_artifact_ids: ["artifact-codebase-map"],
          renderers,
          now,
        },
        options,
      )

      expect(result.final_export_blocked).toBe(false)
      expect(result.export.bundle.status).toBe("final")
      expect(result.preview.readonly).toBe(true)
      expect(result.revision.next_markdown).toContain("Submission profile: nature-paper")
      expect((result.supplementary_bundle satisfies PaperSupplementaryBundle).items.map((item) => item.kind)).toEqual([
        "claim_ledger",
        "review_report",
        "export_manifest",
      ])
      expect((result.availability_bundle satisfies PaperAvailabilityBundle).data.dataset_ids).toEqual([
        "dataset-open-retrieval",
      ])
      expect(result.availability_bundle.code.artifact_ids).toEqual(["artifact-codebase-map"])
    } finally {
      await clean(dir)
    }
  })

  test("blocks final export and produces a clearly marked forced draft", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-authoring-forced-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "Unsafe draft" }, options)
      const ledger = composeClaimLedger({
        topic: "Unsafe draft",
        claims: [{ text: "Unsupported claim.", section_id: "discussion", confidence: 0.2, source_ids: [], artifact_ids: [] }],
        now,
      })

      const result = await runPaperAuthoringLoop(
        handle.run_dir,
        {
          title: "Unsafe Draft",
          ledger,
          data_plan: dataPlan(),
          result_report: resultReport(),
          available_source_ids: [],
          model_reviews: [{ model: "reviewer-model", verdict: "fail", message: "Unsupported claims remain." }],
          target_profile: "generic-preprint",
          renderers,
          now,
        },
        options,
      )

      expect(result.final_export_blocked).toBe(true)
      expect(result.export.bundle.status).toBe("forced_draft")
      expect(result.export.bundle.verification_summary.failed_checks).toContain("unsupported_claim")
      expect(result.preview.artifacts.markdown?.content).toContain("FORCED DRAFT")
      expect(result.preview.annotations.some((annotation) => annotation.severity === "blocker")).toBe(true)
    } finally {
      await clean(dir)
    }
  })
})
