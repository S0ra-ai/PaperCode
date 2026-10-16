import { withSpan } from "../telemetry"
import type { ModelReviewInput, ReviewReport, VerificationFinding } from "./schemas"

function warning(review: ModelReviewInput, index: number): VerificationFinding {
  return {
    finding_id: `reviewer_warning:${index + 1}`,
    category: "reviewer_warning",
    severity: "warning",
    message: review.message ?? `${review.model} returned a warning.`,
    claim_ids: [],
    source_ids: [],
    artifact_ids: [],
    required_action: "Revise wording when practical; does not block authenticity.",
  }
}

function failure(review: ModelReviewInput, index: number): VerificationFinding {
  return {
    finding_id: `reviewer_authenticity_failure:${index + 1}`,
    category: "reviewer_authenticity_failure",
    severity: "blocker",
    message: review.message ?? `${review.model} rejected authenticity.`,
    claim_ids: [],
    source_ids: [],
    artifact_ids: [],
    required_action: "Resolve reviewer authenticity failure before final export.",
  }
}

function missingModelReview(): VerificationFinding {
  return {
    finding_id: "missing_model_review:models",
    category: "missing_model_review",
    severity: "blocker",
    message: "No model review result is available for final export.",
    claim_ids: [],
    source_ids: [],
    artifact_ids: [],
    required_action: "Run at least one configured review model before final export.",
  }
}

function conflict(reviewers: ModelReviewInput[]): VerificationFinding {
  return {
    finding_id: "review_conflict:models",
    category: "review_conflict",
    severity: "blocker",
    message: `Model reviewers disagreed: ${reviewers.map((review) => `${review.model}=${review.verdict}`).join(", ")}.`,
    claim_ids: [],
    source_ids: [],
    artifact_ids: [],
    required_action: "Escalate to a third review model or pause for user decision.",
  }
}

export function runMultiModelReview(reviews: ModelReviewInput[], now: string): ReviewReport {
  return withSpan(
    "research.verification.multi_model_review",
    {
      "papercode.research.reviewers": reviews.length,
    },
    (span) => {
      const findings: VerificationFinding[] = []
      if (reviews.length === 0) findings.push(missingModelReview())
      reviews.forEach((review, index) => {
        if (review.verdict === "warn") findings.push(warning(review, index))
        if (review.verdict === "fail") findings.push(failure(review, index))
      })
      const primary = reviews.slice(0, 2)
      const hasPass = primary.some((review) => review.verdict === "pass" || review.verdict === "warn")
      const hasFail = primary.some((review) => review.verdict === "fail")
      const escalated = hasPass && hasFail
      if (escalated && reviews.length < 3) findings.push(conflict(primary))

      const blockers = findings.filter((finding) => finding.severity === "blocker")
      const consensus =
        blockers.some((finding) => finding.category === "review_conflict")
          ? "conflict"
          : blockers.length > 0
            ? "fail"
            : findings.some((finding) => finding.category === "reviewer_warning")
              ? "warn"
              : "pass"
      span.setAttribute("papercode.research.review.consensus", consensus)
      return {
        schema_version: "ReviewReport.v1",
        created_at: now,
        reviewers: reviews,
        findings,
        consensus,
        escalated,
      }
    },
  )
}
