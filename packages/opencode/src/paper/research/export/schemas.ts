import type { ResearchFinalGateState } from "../runtime"
import type { DraftPaper } from "../writing"
import type { PaperFigureSpec } from "./figure"

export type ExportFormat = "markdown" | "latex" | "pdf" | "docx"

export type ExportRenderResult = {
  status: "written" | "failed"
  bytes: Uint8Array
  diagnostics: string[]
}

export type ExportRenderer = Partial<Record<Exclude<ExportFormat, "markdown">, (input: ExportRenderInput) => Promise<ExportRenderResult> | ExportRenderResult>>

export type ExportRenderInput = {
  draft: DraftPaper
  markdown: string
  latex: string
  output_name: string
}

export type ExportFile = {
  format: ExportFormat
  path: string
  mime_type: string
  sha256: string
  bytes: number
  status: "written" | "failed"
  diagnostics: string[]
  preview?: string
}

export type ExportManifest = {
  schema_version: "PaperExportManifest.v1"
  bundle_id: string
  status: "final" | "forced_draft"
  final_gate_status: ResearchFinalGateState["status"]
  forced: boolean
  failed_checks: string[]
  path: string
  files: Array<Pick<ExportFile, "format" | "path" | "sha256" | "bytes" | "status">>
  source_artifact_ids: string[]
  tool_diagnostics: string[]
}

export type ExportBundle = {
  schema_version: "ExportBundle.v1"
  bundle_id: string
  created_at: string
  status: "final" | "forced_draft"
  draft_id: string
  final_gate: ResearchFinalGateState
  verification_summary: {
    final_gate_status: ResearchFinalGateState["status"]
    failed_checks: string[]
    forced: boolean
  }
  files: ExportFile[]
  manifest: ExportManifest
}

export type RecordExportBundleInput = {
  mode: "final" | "forced_draft"
  draft: DraftPaper
  final_gate: ResearchFinalGateState
  source_artifact_ids: string[]
  /** Primary-metric chart written next to the bundle; the draft references it when present. */
  figure?: PaperFigureSpec
  /** Ablation chart, written as figures/ablation.png. */
  ablation_figure?: PaperFigureSpec
  /** Venue LaTeX class; the pipeline falls back when the class is not installed. */
  documentclass?: string
  /** Blocking findings and their required actions; appended to a forced draft. */
  readiness?: Array<{ category: string; message: string; action: string }>
  renderers?: ExportRenderer
  now?: string
}
