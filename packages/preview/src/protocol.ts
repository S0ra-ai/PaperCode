import { randomBytes } from "crypto"

export type PreviewArtifactRef = {
  kind: "markdown" | "latex" | "pdf" | "docx"
  path?: string
  mime_type: string
  content?: string
  url?: string
  updated_at: string
}

export type PreviewAnnotation = {
  id: string
  kind: "claim" | "citation" | "template" | "experiment" | "reviewer" | "cost" | "agent"
  severity: "info" | "warning" | "error" | "blocker"
  message: string
  source?: {
    label: string
    path?: string
    line_start?: number
    line_end?: number
  }
  tui_ref?: string
}

export type PreviewDiagnostics = {
  tools: Record<string, { status: string; path?: string; message?: string }>
  costs: {
    llm_usd: number
    api_usd: number
    total_usd: number
  }
  agents: Array<{ name: string; status: string; detail?: string }>
}

export type PreviewRenderStatus = {
  state: "idle" | "queued" | "rendering" | "ready" | "failed" | "cancelled"
  job_id?: string
  stage?: string
  message?: string
  updated_at: string
}

export type PreviewSnapshot = {
  schema_version: "preview.v1"
  run_id: string
  title: string
  readonly: true
  updated_at: string
  artifacts: {
    markdown?: PreviewArtifactRef
    latex?: PreviewArtifactRef
    pdf?: PreviewArtifactRef
    docx?: PreviewArtifactRef
  }
  annotations: PreviewAnnotation[]
  diagnostics: PreviewDiagnostics
  render: PreviewRenderStatus
}

export type PreviewStreamEvent =
  | { type: "snapshot"; snapshot: PreviewSnapshot }
  | { type: "render"; render: PreviewRenderStatus }
  | { type: "annotation"; annotation: PreviewAnnotation }

export function createPreviewToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url")
}

export function isWriteMethod(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())
}
