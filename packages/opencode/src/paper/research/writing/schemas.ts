export type CitationRef = {
  citation_id: string
  source_id: string
  locator?: {
    uri?: string
    page?: number
    selector?: string
  }
}

export type ClaimEvidenceInput = {
  text: string
  section_id: string
  confidence: number
  source_ids: string[]
  artifact_ids: string[]
}

export type ClaimLedgerEntry = ClaimEvidenceInput & {
  claim_id: string
  status: "supported" | "needs_evidence" | "contradicted"
  risk_level: "low" | "medium" | "high"
  required_action: "none" | "add_evidence" | "revise_or_remove"
  citations: CitationRef[]
}

export type ClaimLedger = {
  schema_version: "ClaimLedger.v1"
  topic: string
  created_at: string
  entries: ClaimLedgerEntry[]
  unsupported_claim_ids: string[]
}

export type DraftSourceRange = {
  claim_id: string
  section_id: string
  start: number
  end: number
  source_ids: string[]
}

export type DraftSection = {
  section_id: string
  title: string
  level: number
  markdown: string
  claim_ids: string[]
  source_ranges: DraftSourceRange[]
}

export type DraftPaper = {
  schema_version: "DraftPaper.v1"
  draft_id: string
  title: string
  created_at: string
  version: number
  sections: DraftSection[]
  markdown: string
  claim_ids: string[]
  applied_guidance_ids: string[]
}

export type CheckpointGuidance = {
  guidance_id: string
  target_section_id: string
  instruction: string
  replacement_markdown: string
  created_at: string
}

export type DraftRevision = {
  schema_version: "DraftRevision.v1"
  created_at: string
  previous_markdown: string
  next_markdown: string
  diff: string
  rollback_token: string
}
