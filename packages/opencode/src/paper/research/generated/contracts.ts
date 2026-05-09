// Generated from schemas/research/v1.schema.json. Do not edit by hand.

export const RESEARCH_SCHEMA_VERSION = "research.v1" as const

export type ResearchSchemaVersion = typeof RESEARCH_SCHEMA_VERSION

export type ResearchActor = "system" | "user" | "agent" | "tool"
export type ResearchRunStatus = "initialized" | "running" | "succeeded" | "failed" | "cancelled"
export type ResearchArtifactKind = "source_snapshot" | "outline" | "draft" | "review" | "export" | "table" | "figure" | "log"
export type ResearchSourceKind = "paper" | "code" | "web" | "dataset" | "user_note" | "tool_output"
export type ResearchToolStatus = "queued" | "running" | "succeeded" | "failed"
export type ResearchClaimStatus = "proposed" | "supported" | "contradicted" | "needs_evidence"
export type ResearchDraftFormat = "markdown" | "latex" | "docx" | "pdf" | "html"
export type ResearchReviewTargetKind = "draft" | "export" | "artifact" | "claim"
export type ResearchReviewStatus = "open" | "resolved"
export type ResearchFindingSeverity = "info" | "warning" | "error" | "blocker"
export type ResearchExportFormat = "pdf" | "docx" | "html" | "latex" | "markdown"
export type ResearchCheckpointStage = "ingest" | "analyze" | "outline" | "draft" | "review" | "export"
export type ResearchCheckpointStatus = "pending" | "running" | "succeeded" | "failed"

export type ResearchMetadata = Record<string, unknown>

export interface ResearchLocator {
  uri?: string
  path?: string
  line_start?: number
  line_end?: number
  page?: number
  selector?: string
}

export interface ResearchStorageLayout {
  facts: {
    run: "run.json"
    events: "events.jsonl"
    artifacts: "artifacts.jsonl"
    sources: "sources.jsonl"
    tool_traces: "tool-traces.jsonl"
    claims: "claims.jsonl"
    drafts: "drafts.jsonl"
    reviews: "reviews.jsonl"
    exports: "exports.jsonl"
    checkpoints: "checkpoints.jsonl"
  }
  run_index: "index.sqlite"
  global_index: "~/.paper_fucker/index.sqlite"
  index_rebuildable: true
}

export interface ResearchRun {
  schema_version: ResearchSchemaVersion
  run_id: string
  topic: string
  workspace: string
  status: ResearchRunStatus
  created_at: string
  updated_at: string
  storage: ResearchStorageLayout
  metadata?: ResearchMetadata
}

export interface ResearchEvent {
  schema_version: ResearchSchemaVersion
  event_id: string
  run_id: string
  type: string
  created_at: string
  actor: ResearchActor
  payload: ResearchMetadata
}

export interface ResearchArtifact {
  schema_version: ResearchSchemaVersion
  artifact_id: string
  run_id: string
  kind: ResearchArtifactKind
  path: string
  mime_type: string
  sha256?: string
  source_ids: string[]
  created_at: string
  metadata?: ResearchMetadata
}

export interface ResearchSource {
  schema_version: ResearchSchemaVersion
  source_id: string
  run_id: string
  kind: ResearchSourceKind
  title: string
  locator: ResearchLocator
  created_at: string
  metadata?: ResearchMetadata
}

export interface ResearchToolTrace {
  schema_version: ResearchSchemaVersion
  trace_id: string
  run_id: string
  tool_name: string
  status: ResearchToolStatus
  started_at: string
  ended_at?: string
  input: ResearchMetadata
  output?: ResearchMetadata
  error?: string
}

export interface ResearchClaim {
  schema_version: ResearchSchemaVersion
  claim_id: string
  run_id: string
  text: string
  status: ResearchClaimStatus
  confidence: number
  source_ids: string[]
  artifact_ids: string[]
  created_at: string
}

export interface ResearchDraft {
  schema_version: ResearchSchemaVersion
  draft_id: string
  run_id: string
  title: string
  format: ResearchDraftFormat
  path: string
  claim_ids: string[]
  artifact_ids: string[]
  created_at: string
}

export interface ResearchReviewFinding {
  severity: ResearchFindingSeverity
  message: string
  source_ids: string[]
}

export interface ResearchReview {
  schema_version: ResearchSchemaVersion
  review_id: string
  run_id: string
  target_id: string
  target_kind: ResearchReviewTargetKind
  status: ResearchReviewStatus
  findings: ResearchReviewFinding[]
  created_at: string
}

export interface ResearchExport {
  schema_version: ResearchSchemaVersion
  export_id: string
  run_id: string
  draft_id: string
  format: ResearchExportFormat
  path: string
  artifact_ids: string[]
  created_at: string
}

export interface ResearchCheckpoint {
  schema_version: ResearchSchemaVersion
  checkpoint_id: string
  run_id: string
  stage: ResearchCheckpointStage
  status: ResearchCheckpointStatus
  summary: string
  event_ids: string[]
  artifact_ids: string[]
  created_at: string
}

export type ResearchContract =
  | ResearchRun
  | ResearchEvent
  | ResearchArtifact
  | ResearchSource
  | ResearchToolTrace
  | ResearchClaim
  | ResearchDraft
  | ResearchReview
  | ResearchExport
  | ResearchCheckpoint

export type ResearchContractKind =
  | "run"
  | "event"
  | "artifact"
  | "source"
  | "tool_trace"
  | "claim"
  | "draft"
  | "review"
  | "export"
  | "checkpoint"

export interface ResearchContractByKind {
  run: ResearchRun
  event: ResearchEvent
  artifact: ResearchArtifact
  source: ResearchSource
  tool_trace: ResearchToolTrace
  claim: ResearchClaim
  draft: ResearchDraft
  review: ResearchReview
  export: ResearchExport
  checkpoint: ResearchCheckpoint
}
