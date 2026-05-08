import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import { recordExperimentLoop, planExperiments, type ExperimentRunner } from "@/research/experiments"
import { recordExportBundle, FinalExportBlockedError, type ExportRenderer } from "@/research/export"
import { createResearchRun, getResearchRunStatus, type ResearchRuntimeOptions } from "@/research/runtime"
import { discoverAndRecordLiteratureData, type DatasetCandidate, type SourceCandidate } from "@/research/sources"
import { resolveAndRecordTemplate } from "@/research/templates"
import { recordVerificationGate } from "@/research/verification"
import { composeClaimLedger, composeDraftPaper, recordDraftWriting, streamMarkdownDraft } from "@/research/writing"

const now = "2026-05-09T00:00:00Z"

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true }).catch((error) => {
    if (attempts <= 1) throw error
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

function paper(id: string, title: string): SourceCandidate {
  return {
    source_id: id,
    kind: "paper",
    title,
    url: `https://example.org/${id}`,
    provider: "fixture-openalex",
    license: { status: "clear", expression: "CC-BY-4.0" },
    version: { value: "v1", retrieved_at: now },
    verification: { status: "verified", method: "fixture", checked_at: now },
    topics: ["retrieval", "llm"],
  }
}

function dataset(): DatasetCandidate {
  return {
    dataset_id: "open-retrieval-fixture",
    title: "Open Retrieval Fixture",
    url: "https://huggingface.co/datasets/open-retrieval-fixture",
    provider: "fixture-huggingface",
    license: { status: "clear", expression: "apache-2.0" },
    version: { value: "2026-05-09", retrieved_at: now },
    verification: { status: "verified", method: "fixture", checked_at: now },
    topics: ["retrieval", "llm"],
    access: "open",
    task_fit: 0.86,
  }
}

const runner: ExperimentRunner = async (spec, environment) => {
  const scores: Record<string, number> = {
    proposed: environment.mode === "container" ? 0.83 : 0.84,
    "baseline-bm25": environment.mode === "container" ? 0.65 : 0.66,
    "baseline-dense": environment.mode === "container" ? 0.73 : 0.74,
    "baseline-rag": environment.mode === "container" ? 0.77 : 0.78,
    "ablation-no-claim-ledger": environment.mode === "container" ? 0.78 : 0.79,
  }
  return {
    status: "succeeded",
    metrics: [{ name: "accuracy", value: scores[spec.experiment_id] ?? 0.7, direction: "higher_better" }],
    stdout: `${environment.mode}:${spec.experiment_id}`,
    stderr: "",
    exit_code: 0,
    resource_usage: { wall_time_seconds: 1, peak_memory_mb: 512 },
  }
}

const renderers: ExportRenderer = {
  pdf: async () => ({ status: "written", bytes: new TextEncoder().encode("%PDF e2e fixture"), diagnostics: [] }),
  docx: async () => ({ status: "written", bytes: new TextEncoder().encode("DOCX e2e fixture"), diagnostics: [] }),
}

describe("research pipeline end-to-end acceptance", () => {
  test("runs a fixture topic through implemented stages and produces a final export", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-e2e-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "Claim-aware LLM retrieval evaluation" }, options)

      const template = await resolveAndRecordTemplate(handle.run_dir, { run_id: handle.run.run_id, venue: "IEEE" }, options)
      expect(template.resolution.action).toBe("adopt")

      const discovery = await discoverAndRecordLiteratureData(
        handle.run_dir,
        {
          topic: "Claim-aware LLM retrieval evaluation",
          full_access: true,
          literature_candidates: [
            paper("paper-rag-eval", "Retrieval augmented generation evaluation"),
            paper("paper-citation-grounding", "Citation grounded answer verification"),
            paper("paper-open-benchmarks", "Open benchmarks for retrieval evaluation"),
          ],
          dataset_candidates: [dataset()],
        },
        options,
      )
      expect(discovery.feasibility.status).toBe("feasible")

      const experimentPlan = planExperiments({
        topic: "Claim-aware LLM retrieval evaluation",
        method_name: "claim-aware reranker",
        dataset_ids: discovery.data_plan.datasets.map((item) => item.dataset_id),
        now,
      })
      const experiments = await recordExperimentLoop(handle.run_dir, { plan: experimentPlan, host_runner: runner, container_runner: runner }, options)
      expect(experiments.report.final_claims_allowed).toBe(true)

      const ledger = composeClaimLedger({
        topic: "Claim-aware LLM retrieval evaluation",
        claims: [
          {
            text: "The claim-aware reranker improves retrieval accuracy over all recorded baselines on the open fixture benchmark.",
            section_id: "results",
            confidence: 0.83,
            source_ids: ["paper-rag-eval", discovery.data_plan.datasets[0]!.source_id],
            artifact_ids: [experiments.artifacts.result_report.artifact_id],
          },
        ],
        now,
      })
      const draft = composeDraftPaper({ title: "Claim-aware LLM Retrieval Evaluation", ledger, now })
      const writing = await recordDraftWriting(handle.run_dir, { ledger, draft, chunks: [...streamMarkdownDraft(draft)] }, options)
      expect(writing.ledger.unsupported_claim_ids).toEqual([])

      const verification = await recordVerificationGate(
        handle.run_dir,
        {
          ledger,
          draft,
          data_plan: discovery.data_plan,
          result_report: experiments.report,
          available_source_ids: [...discovery.literature.sources.map((item) => item.source_id), ...discovery.data_plan.datasets.map((item) => item.source_id)],
          model_reviews: [
            { model: "deepseek-v4-pro", verdict: "pass" },
            { model: "deepseek-v4-pro-review", verdict: "pass" },
          ],
          now,
        },
        options,
      )
      expect(verification.blocking_report.final_export_eligible).toBe(true)

      const exported = await recordExportBundle(
        handle.run_dir,
        {
          mode: "final",
          draft,
          final_gate: { status: "passed", blockers: [], updated_at: now },
          source_artifact_ids: [
            template.artifact.artifact_id,
            discovery.artifacts.literature.artifact_id,
            discovery.artifacts.data_plan.artifact_id,
            experiments.artifacts.result_report.artifact_id,
            writing.artifacts.draft.artifact_id,
            verification.artifacts.blocking_report.artifact_id,
          ],
          renderers,
          now,
        },
        options,
      )
      expect(exported.bundle.status).toBe("final")
      expect(exported.bundle.files.map((file) => file.format).sort()).toEqual(["docx", "latex", "markdown", "pdf"])

      const status = await getResearchRunStatus(handle.run_dir)
      expect(status.state.final_gate.status).toBe("passed")
      expect(status.counts.sources).toBe(4)
      expect(status.counts.claims).toBe(1)
      expect(status.counts.drafts).toBe(1)
      expect(status.counts.reviews).toBe(1)
      expect(status.counts.exports).toBe(4)
      expect(status.artifact_versions.map((item) => item.logical_path)).toContain("exports/export-bundle.json")
    } finally {
      await clean(dir)
    }
  })

  test("blocks final export on failed gate and produces a forced draft bundle", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-e2e-forced-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "Unsafe final export fixture" }, options)

      const ledger = composeClaimLedger({
        topic: "Unsafe final export fixture",
        claims: [{ text: "Unsupported claim.", section_id: "discussion", confidence: 0.2, source_ids: [], artifact_ids: [] }],
        now,
      })
      const draft = composeDraftPaper({ title: "Unsafe Final Export Fixture", ledger, now })
      const finalGate = { status: "blocked" as const, blockers: ["unsupported_claim"], updated_at: now }

      await expect(
        recordExportBundle(handle.run_dir, {
          mode: "final",
          draft,
          final_gate: finalGate,
          source_artifact_ids: [],
          renderers,
          now,
        }),
      ).rejects.toThrow(FinalExportBlockedError)

      const forced = await recordExportBundle(
        handle.run_dir,
        {
          mode: "forced_draft",
          draft,
          final_gate: finalGate,
          source_artifact_ids: [],
          renderers,
          now,
        },
        options,
      )
      expect(forced.bundle.status).toBe("forced_draft")
      expect(forced.bundle.verification_summary.failed_checks).toEqual(["unsupported_claim"])
      expect(forced.bundle.files.find((file) => file.format === "markdown")?.preview).toContain("FORCED DRAFT")
    } finally {
      await clean(dir)
    }
  })
})
