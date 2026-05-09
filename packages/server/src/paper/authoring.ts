import type { PreviewDiagnostics, PreviewSnapshot } from "../../../preview/src/protocol"
import { recordExportBundle, type ExportBundle, type ExportRenderer } from "../research/export"
import type { ResearchArtifact } from "../research/contracts"
import type { ResultReport } from "../research/experiments"
import {
  appendResearchEvent,
  loadResearchRun,
  type ResearchFinalGateState,
  type ResearchRuntimeOptions,
  writeResearchArtifact,
} from "../research/runtime"
import type { DataPlan } from "../research/sources"
import { withSpan } from "../research/telemetry"
import {
  composeDraftPaper,
  createDraftRevision,
  recordDraftWriting,
  streamMarkdownDraft,
  type ClaimLedger,
  type DraftPaper,
  type DraftRevision,
} from "../research/writing"
import { recordVerificationGate, type ModelReviewInput, type VerificationGateResult } from "../research/verification"
import { createRunBoundPreviewSnapshot } from "./preview"

export type PaperSupplementaryBundle = {
  schema_version: "PaperSupplementaryBundle.v1"
  bundle_id: string
  created_at: string
  items: Array<{
    kind: "claim_ledger" | "review_report" | "export_manifest"
    artifact_id?: string
    path?: string
    required: boolean
  }>
}

export type PaperAvailabilityBundle = {
  schema_version: "PaperAvailabilityBundle.v1"
  created_at: string
  data: {
    dataset_ids: string[]
    source_ids: string[]
    license_status: Array<{ dataset_id: string; status: string; expression?: string }>
  }
  code: {
    artifact_ids: string[]
  }
  experiments: {
    reproduction_status: ResultReport["reproduction"]["status"]
    container_run_ids: string[]
    final_claims_allowed: boolean
  }
  notes: string[]
}

export type RunPaperAuthoringLoopInput = {
  title: string
  ledger: ClaimLedger
  data_plan: DataPlan
  result_report: ResultReport
  available_source_ids: string[]
  model_reviews: ModelReviewInput[]
  target_profile?: string
  code_artifact_ids?: string[]
  source_artifact_ids?: string[]
  renderers?: ExportRenderer
  tools?: PreviewDiagnostics["tools"]
  costs?: PreviewDiagnostics["costs"]
  agents?: PreviewDiagnostics["agents"]
  now?: string
}

export type PaperAuthoringLoopResult = {
  schema_version: "PaperAuthoringLoop.v1"
  final_export_blocked: boolean
  ledger: ClaimLedger
  draft: DraftPaper
  revision: DraftRevision
  verification: VerificationGateResult
  export: {
    bundle: ExportBundle
    artifact: ResearchArtifact
  }
  supplementary_bundle: PaperSupplementaryBundle
  availability_bundle: PaperAvailabilityBundle
  preview: PreviewSnapshot
  artifacts: {
    ledger: ResearchArtifact
    draft: ResearchArtifact
    chunks: ResearchArtifact
    blocking_report: ResearchArtifact
    review_report: ResearchArtifact
    availability_bundle: ResearchArtifact
    supplementary_bundle: ResearchArtifact
    preview_snapshot: ResearchArtifact
  }
}

function nowIso(override?: string) {
  return override ?? new Date().toISOString()
}

function appendProfileAppendix(markdown: string, input: RunPaperAuthoringLoopInput) {
  const profile = input.target_profile ?? "generic-preprint"
  const datasetIds = input.data_plan.datasets.map((dataset) => dataset.dataset_id)
  const failedChecks = [
    ...input.ledger.unsupported_claim_ids.map((claimId) => `unsupported claim ${claimId}`),
    ...input.data_plan.license_conflicts.map((conflict) => `dataset license ${conflict.dataset_id}`),
    ...(input.result_report.final_claims_allowed ? [] : ["experiment reproduction gate"]),
  ]
  return [
    markdown,
    "",
    "## Submission Checklist",
    "",
    `Submission profile: ${profile}`,
    `Data availability: ${datasetIds.length > 0 ? datasetIds.join(", ") : "no dataset recorded"}`,
    `Code availability: ${(input.code_artifact_ids ?? []).length > 0 ? input.code_artifact_ids!.join(", ") : "no code artifact recorded"}`,
    `Final gate precheck: ${failedChecks.length === 0 ? "ready" : failedChecks.join("; ")}`,
  ].join("\n")
}

function applyRevision(draft: DraftPaper, revision: DraftRevision): DraftPaper {
  return {
    ...draft,
    version: draft.version + 1,
    markdown: revision.next_markdown,
    applied_guidance_ids: [...draft.applied_guidance_ids, "profile-aware-authoring-loop"],
  }
}

export function createProfileAwareDraftRevision(input: {
  draft: DraftPaper
  authoring: RunPaperAuthoringLoopInput
  now?: string
}) {
  return createDraftRevision({
    previous_markdown: input.draft.markdown,
    next_markdown: appendProfileAppendix(input.draft.markdown, input.authoring),
    now: input.now,
  })
}

export function buildPaperAvailabilityBundle(
  input: Pick<RunPaperAuthoringLoopInput, "data_plan" | "result_report" | "code_artifact_ids" | "now">,
): PaperAvailabilityBundle {
  return {
    schema_version: "PaperAvailabilityBundle.v1",
    created_at: nowIso(input.now),
    data: {
      dataset_ids: input.data_plan.datasets.map((dataset) => dataset.dataset_id),
      source_ids: input.data_plan.datasets.map((dataset) => dataset.source_id),
      license_status: input.data_plan.datasets.map((dataset) => ({
        dataset_id: dataset.dataset_id,
        status: dataset.license.status,
        expression: dataset.license.expression,
      })),
    },
    code: {
      artifact_ids: input.code_artifact_ids ?? [],
    },
    experiments: {
      reproduction_status: input.result_report.reproduction.status,
      container_run_ids: input.result_report.reproduction.container_run_ids,
      final_claims_allowed: input.result_report.final_claims_allowed,
    },
    notes: [
      "Final claims may only use reproduced results or explicitly exploratory results.",
      "Dataset and code availability are generated from run artifacts, not free-form prose.",
    ],
  }
}

export function buildPaperSupplementaryBundle(input: {
  created_at?: string
  ledger_artifact_id?: string
  review_artifact_id?: string
  export_bundle: ExportBundle
}): PaperSupplementaryBundle {
  return {
    schema_version: "PaperSupplementaryBundle.v1",
    bundle_id: `supplementary:${input.export_bundle.bundle_id}`,
    created_at: nowIso(input.created_at),
    items: [
      {
        kind: "claim_ledger",
        artifact_id: input.ledger_artifact_id,
        path: "writing/claim-ledger.json",
        required: true,
      },
      {
        kind: "review_report",
        artifact_id: input.review_artifact_id,
        path: "verification/review-report.json",
        required: true,
      },
      {
        kind: "export_manifest",
        path: "exports/export-bundle.json",
        required: true,
      },
    ],
  }
}

function finalGateFromVerification(verification: VerificationGateResult): ResearchFinalGateState {
  return {
    status: verification.blocking_report.status === "passed" ? "passed" : "blocked",
    blockers: verification.blocking_report.blockers.map((finding) => finding.category),
    updated_at: verification.blocking_report.created_at,
  }
}

async function writeAvailabilityBundle(
  runDir: string,
  availability: PaperAvailabilityBundle,
  options?: ResearchRuntimeOptions,
) {
  return writeResearchArtifact(
    runDir,
    {
      kind: "export",
      logical_path: "exports/availability-bundle.json",
      data: availability,
      metadata: { artifact_schema: "PaperAvailabilityBundle.v1" },
    },
    options,
  )
}

async function writeSupplementaryBundle(
  runDir: string,
  supplementary: PaperSupplementaryBundle,
  options?: ResearchRuntimeOptions,
) {
  return writeResearchArtifact(
    runDir,
    {
      kind: "export",
      logical_path: "exports/supplementary-bundle.json",
      data: supplementary,
      metadata: { artifact_schema: "PaperSupplementaryBundle.v1" },
    },
    options,
  )
}

async function writePreviewSnapshot(runDir: string, preview: PreviewSnapshot, options?: ResearchRuntimeOptions) {
  return writeResearchArtifact(
    runDir,
    {
      kind: "export",
      logical_path: "preview/preview-snapshot.json",
      data: preview,
      metadata: { artifact_schema: "PreviewSnapshot.v1", readonly: true },
    },
    options,
  )
}

export async function runPaperAuthoringLoop(
  runDir: string,
  input: RunPaperAuthoringLoopInput,
  options?: ResearchRuntimeOptions,
): Promise<PaperAuthoringLoopResult> {
  return withSpan(
    "paper.authoring.loop",
    {
      "paper_fucker.paper.authoring.title": input.title,
      "paper_fucker.paper.authoring.profile": input.target_profile ?? "generic-preprint",
    },
    async (span) => {
      const run = await loadResearchRun(runDir)
      const baseDraft = composeDraftPaper({ title: input.title, ledger: input.ledger, now: input.now })
      const revision = createProfileAwareDraftRevision({ draft: baseDraft, authoring: input, now: input.now })
      const draft = applyRevision(baseDraft, revision)
      const writing = await recordDraftWriting(
        runDir,
        {
          ledger: input.ledger,
          draft,
          chunks: [...streamMarkdownDraft(draft)],
        },
        options,
      )
      const verification = await recordVerificationGate(
        runDir,
        {
          ledger: input.ledger,
          draft,
          data_plan: input.data_plan,
          result_report: input.result_report,
          available_source_ids: input.available_source_ids,
          model_reviews: input.model_reviews,
          now: input.now,
        },
        options,
      )
      const finalGate = finalGateFromVerification(verification)
      const availabilityBundle = buildPaperAvailabilityBundle(input)
      const availabilityArtifact = await writeAvailabilityBundle(runDir, availabilityBundle, options)
      const sourceArtifactIds = Array.from(
        new Set([
          ...(input.source_artifact_ids ?? []),
          ...(input.code_artifact_ids ?? []),
          writing.artifacts.ledger.artifact_id,
          writing.artifacts.draft.artifact_id,
          writing.artifacts.chunks.artifact_id,
          verification.artifacts.blocking_report.artifact_id,
          verification.artifacts.review_report.artifact_id,
          availabilityArtifact.artifact_id,
        ]),
      )

      let finalExportBlocked = false
      let exported: Awaited<ReturnType<typeof recordExportBundle>>
      if (finalGate.status === "passed") {
        exported = await recordExportBundle(
          runDir,
          {
            mode: "final",
            draft,
            final_gate: finalGate,
            source_artifact_ids: sourceArtifactIds,
            renderers: input.renderers,
            now: input.now,
          },
          options,
        )
      } else {
        finalExportBlocked = true
        exported = await recordExportBundle(
          runDir,
          {
            mode: "forced_draft",
            draft,
            final_gate: finalGate,
            source_artifact_ids: sourceArtifactIds,
            renderers: input.renderers,
            now: input.now,
          },
          options,
        )
      }

      const supplementaryBundle = buildPaperSupplementaryBundle({
        created_at: input.now,
        ledger_artifact_id: writing.artifacts.ledger.artifact_id,
        review_artifact_id: verification.artifacts.review_report.artifact_id,
        export_bundle: exported.bundle,
      })
      const supplementaryArtifact = await writeSupplementaryBundle(runDir, supplementaryBundle, options)
      const preview = createRunBoundPreviewSnapshot({
        run_id: run.run_id,
        title: draft.title,
        draft,
        ledger: input.ledger,
        blocking_report: verification.blocking_report,
        review_report: verification.review_report,
        export_bundle: exported.bundle,
        tools: input.tools,
        costs: input.costs,
        agents: input.agents,
        now: input.now,
      })
      const previewArtifact = await writePreviewSnapshot(runDir, preview, options)
      await appendResearchEvent(
        runDir,
        {
          type: "paper.authoring.completed",
          actor: "agent",
          payload: {
            draft_id: draft.draft_id,
            export_bundle_id: exported.bundle.bundle_id,
            final_export_blocked: finalExportBlocked,
            preview_artifact_id: previewArtifact.artifact_id,
            supplementary_artifact_id: supplementaryArtifact.artifact_id,
            availability_artifact_id: availabilityArtifact.artifact_id,
          },
        },
        options,
      )
      span.setAttribute("paper_fucker.paper.authoring.final_blocked", finalExportBlocked)
      span.setAttribute("paper_fucker.paper.authoring.export_status", exported.bundle.status)

      return {
        schema_version: "PaperAuthoringLoop.v1",
        final_export_blocked: finalExportBlocked,
        ledger: input.ledger,
        draft,
        revision,
        verification,
        export: exported,
        supplementary_bundle: supplementaryBundle,
        availability_bundle: availabilityBundle,
        preview,
        artifacts: {
          ledger: writing.artifacts.ledger,
          draft: writing.artifacts.draft,
          chunks: writing.artifacts.chunks,
          blocking_report: verification.artifacts.blocking_report,
          review_report: verification.artifacts.review_report,
          availability_bundle: availabilityArtifact,
          supplementary_bundle: supplementaryArtifact,
          preview_snapshot: previewArtifact,
        },
      }
    },
  )
}
