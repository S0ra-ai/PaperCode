import { RESEARCH_SCHEMA_VERSION } from "../contracts"
import {
  appendResearchEvent,
  appendResearchFact,
  loadResearchRun,
  writeResearchArtifact,
  type ResearchRuntimeOptions,
} from "../runtime"
import { withSpan } from "../telemetry"
import { buildExportFiles } from "./bundle"
import type { ExportBundle, RecordExportBundleInput } from "./schemas"

export class FinalExportBlockedError extends Error {
  constructor(readonly blockers: string[]) {
    super(`Final export is blocked by failed authenticity checks: ${blockers.join(", ") || "unknown"}.`)
    this.name = "FinalExportBlockedError"
  }
}

function nowIso(options?: ResearchRuntimeOptions, override?: string) {
  return override ?? (options?.clock?.() ?? new Date()).toISOString()
}

function bundleId(input: RecordExportBundleInput) {
  const safeDraft = input.draft.draft_id.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "draft"
  return `bundle-${input.mode}-${safeDraft}`
}

function failedChecks(input: RecordExportBundleInput) {
  return input.final_gate.status === "passed" ? [] : input.final_gate.blockers
}

function toolDiagnostics(files: ExportBundle["files"]) {
  return files.flatMap((file) => file.diagnostics.map((diagnostic) => `${file.format}: ${diagnostic}`))
}

export async function recordExportBundle(
  runDir: string,
  input: RecordExportBundleInput,
  options?: ResearchRuntimeOptions,
) {
  const failures = failedChecks(input)
  if (input.mode === "final" && input.final_gate.status !== "passed") throw new FinalExportBlockedError(failures)

  return withSpan(
    "research.export.record_bundle",
    {
      "paper_fucker.research.export.mode": input.mode,
      "paper_fucker.research.draft.id": input.draft.draft_id,
    },
    async (span) => {
      const run = await loadResearchRun(runDir)
      const createdAt = nowIso(options, input.now)
      const id = bundleId(input)
      const files = await buildExportFiles({
        runDir,
        bundleId: id,
        draft: input.draft,
        forcedChecks: input.mode === "forced_draft" ? failures : [],
        renderers: input.renderers,
      })
      const bundle: ExportBundle = {
        schema_version: "ExportBundle.v1",
        bundle_id: id,
        created_at: createdAt,
        status: input.mode === "final" ? "final" : "forced_draft",
        draft_id: input.draft.draft_id,
        final_gate: input.final_gate,
        verification_summary: {
          final_gate_status: input.final_gate.status,
          failed_checks: failures,
          forced: input.mode === "forced_draft",
        },
        files,
        manifest: {
          bundle_id: id,
          files: files.map((file) => ({
            format: file.format,
            path: file.path,
            sha256: file.sha256,
            bytes: file.bytes,
            status: file.status,
          })),
          source_artifact_ids: input.source_artifact_ids,
          tool_diagnostics: toolDiagnostics(files),
        },
      }
      const artifact = await writeResearchArtifact(
        runDir,
        {
          kind: "export",
          logical_path: "exports/export-bundle.json",
          data: bundle,
          metadata: { artifact_schema: "ExportBundle.v1", bundle_id: id },
        },
        options,
      )
      for (const file of files.filter((item) => item.status === "written")) {
        await appendResearchFact(runDir, "export", {
          schema_version: RESEARCH_SCHEMA_VERSION,
          export_id: `export:${id}:${file.format}`,
          run_id: run.run_id,
          draft_id: input.draft.draft_id,
          format: file.format === "docx" ? "docx" : file.format === "latex" ? "latex" : file.format === "markdown" ? "markdown" : "pdf",
          path: file.path,
          artifact_ids: [artifact.artifact_id, ...input.source_artifact_ids],
          created_at: createdAt,
        })
      }
      await appendResearchEvent(
        runDir,
        {
          type: "export.bundle.completed",
          actor: "agent",
          payload: {
            bundle_id: id,
            status: bundle.status,
            artifact_id: artifact.artifact_id,
            final_export_eligible: input.final_gate.status === "passed" && input.mode === "final",
            diagnostics: bundle.manifest.tool_diagnostics,
          },
        },
        options,
      )
      span.setAttribute("paper_fucker.research.export.files", files.length)
      span.setAttribute("paper_fucker.research.export.diagnostics", bundle.manifest.tool_diagnostics.length)
      return { bundle, artifact }
    },
  )
}
