import { RESEARCH_SCHEMA_VERSION } from "../contracts"
import {
  appendResearchEvent,
  appendResearchFact,
  loadResearchRun,
  writeResearchArtifact,
  type ResearchRuntimeOptions,
} from "../runtime"
import { withSpan } from "../telemetry"
import { renderPaperExportPipeline } from "../../export-pipeline"
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
      "papercode.research.export.mode": input.mode,
      "papercode.research.draft.id": input.draft.draft_id,
    },
    async (span) => {
      const run = await loadResearchRun(runDir)
      const createdAt = nowIso(options, input.now)
      const id = bundleId(input)
      const rendered = await renderPaperExportPipeline(
        runDir,
        {
          mode: input.mode,
          bundle_id: id,
          draft: input.draft,
          final_gate: input.final_gate,
          source_artifact_ids: input.source_artifact_ids,
          figure: input.figure,
          ablation_figure: input.ablation_figure,
          documentclass: input.documentclass,
          readiness: input.readiness,
          renderers: input.renderers,
          now: input.now,
        },
        options,
      )
      const files = rendered.bundle.files
      const bundle: ExportBundle = {
        ...rendered.bundle,
        created_at: createdAt,
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
      span.setAttribute("papercode.research.export.files", files.length)
      span.setAttribute("papercode.research.export.diagnostics", bundle.manifest.tool_diagnostics.length)
      return { bundle, artifact }
    },
  )
}
