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
  | "missing_section_content"
  | "abstract_length"
  | "missing_keywords"
  | "placeholder_text"
  | "missing_statement"
  | "insufficient_references"
  | "stale_references"
  | "missing_statistics"
  | "missing_effect_size"
  | "missing_author_metadata"
  | "insufficient_baselines"
  | "missing_ablation"
  | "insufficient_trials"
  | "novelty_not_clear"
  | "missing_table"
  | "missing_figure"
  | "manuscript_language"

/** One statement a submission must carry, and whether its absence blocks the final export. */
export type ManuscriptStatementRequirement = {
  id: string
  severity: "warning" | "blocker"
}

/**
 * What a target venue expects of the manuscript itself, as opposed to the evidence behind it. The
 * integrity checks (references resolve, claims are supported, experiments reproduce) say the paper is
 * honest; these say whether the result is submission-grade.
 */
export type ManuscriptRequirements = {
  profile: string
  language: "zh" | "en" | "any"
  /** Section ids that must carry real prose rather than only a heading. */
  required_sections: string[]
  abstract_words: { min: number; max: number }
  min_keywords: number
  /** References that must appear in the formatted reference list. */
  min_references: number
  /** Share of dated references published within `recency_years`. Ignored when no reference is dated. */
  recent_reference_ratio: number
  recency_years: number
  required_statements: ManuscriptStatementRequirement[]
  /** Whether a comparison against a baseline has to report dispersion and a significance test. */
  require_statistics: "off" | "warning" | "blocker"
  /** Whether a baseline comparison also has to report an effect size (Cohen's d / Cliff's delta). */
  require_effect_size: boolean
  /** Whether the manuscript has to name its authors instead of the anonymous placeholder. */
  require_authors: "off" | "warning" | "blocker"
  /** How many independent baselines the experiment design has to compare against. */
  min_baselines: number
  /** How many ablation experiments the design has to include. */
  min_ablations: number
  /** Minimum trials behind a reported statistic (multiple seeds). */
  min_trials: number
  /** Whether the novelty checkpoint has to be clear before final export. */
  require_novelty: "off" | "warning" | "blocker"
  min_tables: number
  min_figures: number
}

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
  /** Omitted by callers that only want the integrity checks (tests, preview). */
  manuscript_requirements?: ManuscriptRequirements
  /** Baseline and ablation counts from the run records; absent skips the design checks. */
  experiment_design?: { baselines: number; ablations: number }
  /** Latest novelty decision from the orchestrator's checkpoints; absent skips the novelty check. */
  novelty_status?: "clear" | "needs_review" | "redirect_required" | "blocked"
  now?: string
}

export type VerificationGateResult = {
  blocking_report: BlockingReport
  review_report: ReviewReport
  findings: VerificationFinding[]
}
