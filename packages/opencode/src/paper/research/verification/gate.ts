import { withSpan } from "../telemetry"
import { checkClaimSupport, checkDataAndExperiments, checkReferences, checkSourceAuthenticity } from "./checks"
import { runMultiModelReview } from "./review"
import type { BlockingReport, VerificationGateInput, VerificationGateResult, VerificationFinding } from "./schemas"

function nowIso(override?: string) {
  return override ?? new Date().toISOString()
}

function blockingReport(findings: VerificationFinding[], createdAt: string): BlockingReport {
  const blockers = findings.filter((finding) => finding.severity === "blocker")
  const warnings = findings.filter((finding) => finding.severity === "warning")
  const passed = blockers.length === 0
  return {
    schema_version: "BlockingReport.v1",
    created_at: createdAt,
    status: passed ? "passed" : "blocked",
    final_grade: passed ? "pass" : "blocked",
    draft_export_eligible: true,
    final_export_eligible: passed,
    blockers,
    warnings,
  }
}

export function evaluateVerificationGate(input: VerificationGateInput): VerificationGateResult {
  const createdAt = nowIso(input.now)
  return withSpan(
    "research.verification.evaluate_gate",
    {
      "papercode.research.draft.id": input.draft.draft_id,
    },
    (span) => {
      const reviewReport = runMultiModelReview(input.model_reviews, createdAt)
      const findings = [
        ...checkReferences(input),
        ...checkSourceAuthenticity(input),
        ...checkClaimSupport(input),
        ...checkDataAndExperiments(input),
        ...reviewReport.findings,
      ]
      const report = blockingReport(findings, createdAt)
      span.setAttribute("papercode.research.final_gate.status", report.status)
      span.setAttribute("papercode.research.final_gate.blockers", report.blockers.length)
      return {
        blocking_report: report,
        review_report: reviewReport,
        findings,
      }
    },
  )
}
