import type { DataPlan } from "../sources"
import type { ResultReport } from "../experiments"
import type { ClaimLedger, DraftPaper } from "../writing"
import type { SourceRecord } from "../sources/schemas"

export type VerificationFindingCategory =
  | "invalid_reference"
  | "missing_verified_reference"
  | "missing_source_record"
  | "unverified_source"
  | "source_license_failure"
  | "unsupported_claim"
  | "dataset_license_failure"
  | "missing_open_dataset"
  | "reproduction_failure"
  | "reviewer_warning"
  | "missing_model_review"
  | "review_conflict"
  | "reviewer_authenticity_failure"

export type VerificationFinding = {
  finding_id: string
  category: VerificationFindingCategory
  severity: "warning" | "blocker"
  message: string
  claim_ids: string[]
  source_ids: string[]
  artifact_ids: string[]
  required_action: string
}

export type BlockingReport = {
  schema_version: "BlockingReport.v1"
  created_at: string
  status: "passed" | "blocked"
  final_grade: "pass" | "blocked"
  draft_export_eligible: boolean
  final_export_eligible: boolean
  blockers: VerificationFinding[]
  warnings: VerificationFinding[]
}

export type ModelReviewInput = {
  model: string
  verdict: "pass" | "warn" | "fail"
  message?: string
}

export type ReviewReport = {
  schema_version: "ReviewReport.v1"
  created_at: string
  reviewers: ModelReviewInput[]
  findings: VerificationFinding[]
  consensus: "pass" | "warn" | "fail" | "conflict"
  escalated: boolean
}

export type VerificationGateInput = {
  ledger: ClaimLedger
  draft: DraftPaper
  data_plan: DataPlan
  result_report: ResultReport
  available_source_ids: string[]
  source_records?: SourceRecord[]
  model_reviews: ModelReviewInput[]
  now?: string
}

export type VerificationGateResult = {
  blocking_report: BlockingReport
  review_report: ReviewReport
  findings: VerificationFinding[]
}
