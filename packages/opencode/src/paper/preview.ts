import type {
  PreviewAnnotation,
  PreviewArtifactRef,
  PreviewDiagnostics,
  PreviewSnapshot,
} from "../../../preview/src/protocol"
import type { ExportBundle, ExportFile } from "./research/export"
import type { BlockingReport, ReviewReport, VerificationFinding } from "./research/verification"
import type { ClaimLedger, ClaimLedgerEntry, DraftPaper, DraftSourceRange } from "./research/writing"

export type CreateRunBoundPreviewSnapshotInput = {
  run_id: string
  title: string
  draft: DraftPaper
  ledger: ClaimLedger
  blocking_report?: BlockingReport
  review_report?: ReviewReport
  export_bundle?: ExportBundle
  tools?: PreviewDiagnostics["tools"]
  costs?: PreviewDiagnostics["costs"]
  agents?: PreviewDiagnostics["agents"]
  now?: string
}

function nowIso(override?: string) {
  return override ?? new Date().toISOString()
}

function lineForOffset(markdown: string, offset: number) {
  return markdown.slice(0, Math.max(0, offset)).split(/\r?\n/).length
}

function rangeForClaim(draft: DraftPaper, entry: ClaimLedgerEntry): DraftSourceRange | undefined {
  for (const section of draft.sections) {
    const range = section.source_ranges.find((item) => item.claim_id === entry.claim_id)
    if (range) return range
  }
  return undefined
}

function severityForClaim(entry: ClaimLedgerEntry): PreviewAnnotation["severity"] {
  if (entry.status === "supported") return entry.risk_level === "medium" ? "warning" : "info"
  return "blocker"
}

function findingSeverity(finding: VerificationFinding): PreviewAnnotation["severity"] {
  return finding.severity === "blocker" ? "blocker" : "warning"
}

function annotationForClaim(draft: DraftPaper, entry: ClaimLedgerEntry): PreviewAnnotation {
  const range = rangeForClaim(draft, entry)
  return {
    id: `claim:${entry.claim_id}`,
    kind: "claim",
    severity: severityForClaim(entry),
    message: `${entry.claim_id}: ${entry.text}`,
    source: range
      ? {
          label: entry.claim_id,
          line_start: lineForOffset(draft.markdown, range.start),
          line_end: lineForOffset(draft.markdown, range.end),
        }
      : { label: entry.claim_id },
    tui_ref: `claim-ledger:${entry.claim_id}`,
  }
}

function annotationsForCitations(entry: ClaimLedgerEntry): PreviewAnnotation[] {
  return entry.citations.map((citation) => ({
    id: `citation:${entry.claim_id}:${citation.citation_id}`,
    kind: "citation",
    severity: "info",
    message: `${citation.citation_id} -> ${citation.source_id}`,
    source: {
      label: citation.source_id,
      path: citation.locator?.uri,
      line_start: citation.locator?.page,
    },
    tui_ref: `source-ledger:${citation.source_id}`,
  }))
}

function annotationsForFindings(report?: BlockingReport): PreviewAnnotation[] {
  if (!report) return []
  return [...report.blockers, ...report.warnings].map((finding) => ({
    id: `gate:${finding.finding_id}`,
    kind: finding.category === "reproduction_failure" ? "experiment" : "reviewer",
    severity: findingSeverity(finding),
    message: finding.message,
    source: {
      label: finding.finding_id,
    },
    tui_ref: `verification:${finding.finding_id}`,
  }))
}

function annotationsForReview(report?: ReviewReport): PreviewAnnotation[] {
  if (!report) return []
  const findingAnnotations: PreviewAnnotation[] = report.findings.map((finding) => ({
    id: `review:${finding.finding_id}`,
    kind: "reviewer",
    severity: findingSeverity(finding),
    message: finding.message,
    source: {
      label: finding.finding_id,
    },
    tui_ref: `review:${finding.finding_id}`,
  }))
  const reviewerAnnotations: PreviewAnnotation[] = report.reviewers
    .filter((reviewer) => reviewer.message)
    .map((reviewer, index) => ({
      id: `reviewer:${index + 1}:${reviewer.model}`,
      kind: "reviewer",
      severity: reviewer.verdict === "fail" ? "blocker" : reviewer.verdict === "warn" ? "warning" : "info",
      message: `${reviewer.model}: ${reviewer.message}`,
      source: { label: reviewer.model },
      tui_ref: `reviewer:${reviewer.model}`,
    }))
  return [...findingAnnotations, ...reviewerAnnotations]
}

function diagnostics(input: CreateRunBoundPreviewSnapshotInput): PreviewDiagnostics {
  return {
    tools: input.tools ?? {},
    costs: input.costs ?? { llm_usd: 0, api_usd: 0, total_usd: 0 },
    agents: input.agents ?? [],
  }
}

function fileArtifact(file: ExportFile, updatedAt: string): PreviewArtifactRef {
  return {
    kind: file.format,
    path: file.path,
    mime_type: file.mime_type,
    content: file.format === "markdown" ? file.preview : undefined,
    updated_at: updatedAt,
  }
}

function fallbackMarkdownArtifact(draft: DraftPaper, updatedAt: string): PreviewArtifactRef {
  return {
    kind: "markdown",
    mime_type: "text/markdown",
    content: draft.markdown,
    updated_at: updatedAt,
  }
}

function exportArtifacts(bundle: ExportBundle | undefined, draft: DraftPaper, updatedAt: string): PreviewSnapshot["artifacts"] {
  const files = bundle?.files ?? []
  const byFormat = new Map(files.map((file) => [file.format, file]))
  return {
    markdown: byFormat.has("markdown") ? fileArtifact(byFormat.get("markdown")!, updatedAt) : fallbackMarkdownArtifact(draft, updatedAt),
    latex: byFormat.has("latex") ? fileArtifact(byFormat.get("latex")!, updatedAt) : undefined,
    pdf: byFormat.has("pdf") ? fileArtifact(byFormat.get("pdf")!, updatedAt) : undefined,
    docx: byFormat.has("docx") ? fileArtifact(byFormat.get("docx")!, updatedAt) : undefined,
  }
}

export function createRunBoundPreviewSnapshot(input: CreateRunBoundPreviewSnapshotInput): PreviewSnapshot {
  const updatedAt = nowIso(input.now)
  const annotations: PreviewAnnotation[] = [
    ...input.ledger.entries.flatMap((entry) => [annotationForClaim(input.draft, entry), ...annotationsForCitations(entry)]),
    ...annotationsForFindings(input.blocking_report),
    ...annotationsForReview(input.review_report),
    {
      id: "cost:current",
      kind: "cost",
      severity: input.costs && input.costs.total_usd > 0 ? "info" : "info",
      message: `Total cost: ${input.costs?.total_usd ?? 0} USD`,
      tui_ref: "diagnostics:cost",
    },
    ...(input.agents ?? []).map((agent: PreviewDiagnostics["agents"][number]) => ({
      id: `agent:${agent.name}`,
      kind: "agent" as const,
      severity: agent.status === "failed" ? ("error" as const) : ("info" as const),
      message: `${agent.name}: ${agent.status}${agent.detail ? ` - ${agent.detail}` : ""}`,
      tui_ref: `diagnostics:agent:${agent.name}`,
    })),
  ]

  return {
    schema_version: "preview.v1",
    run_id: input.run_id,
    title: input.title,
    readonly: true,
    updated_at: updatedAt,
    artifacts: exportArtifacts(input.export_bundle, input.draft, updatedAt),
    annotations,
    diagnostics: diagnostics(input),
    render: {
      state: "ready",
      stage: "authoring",
      message: input.export_bundle ? `${input.export_bundle.status} bundle ready` : "draft preview ready",
      updated_at: updatedAt,
    },
  }
}
