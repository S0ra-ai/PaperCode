import { RESEARCH_SCHEMA_VERSION } from "../contracts"
import {
  appendResearchEvent,
  appendResearchFact,
  loadResearchRun,
  setResearchFinalGate,
  writeResearchArtifact,
  type ResearchRuntimeOptions,
} from "../runtime"
import { withSpan } from "../telemetry"
import { evaluateVerificationGate } from "./gate"
import type { VerificationGateInput } from "./schemas"

export async function recordVerificationGate(
  runDir: string,
  input: VerificationGateInput,
  options?: ResearchRuntimeOptions,
) {
  return withSpan(
    "research.verification.record_gate",
    {
      "papercode.research.draft.id": input.draft.draft_id,
    },
    async (span) => {
      const run = await loadResearchRun(runDir)
      const result = evaluateVerificationGate(input)
      const blockingArtifact = await writeResearchArtifact(
        runDir,
        {
          kind: "review",
          logical_path: "verification/blocking-report.json",
          data: result.blocking_report,
          metadata: { artifact_schema: "BlockingReport.v1" },
        },
        options,
      )
      const reviewArtifact = await writeResearchArtifact(
        runDir,
        {
          kind: "review",
          logical_path: "verification/review-report.json",
          data: result.review_report,
          metadata: { artifact_schema: "ReviewReport.v1" },
        },
        options,
      )
      await appendResearchFact(runDir, "review", {
        schema_version: RESEARCH_SCHEMA_VERSION,
        review_id: "review:final-authenticity",
        run_id: run.run_id,
        target_id: input.draft.draft_id,
        target_kind: "draft",
        status: result.blocking_report.status === "passed" ? "resolved" : "open",
        findings: result.findings.map((finding) => ({
          severity: finding.severity === "blocker" ? "blocker" : "warning",
          message: finding.message,
          source_ids: finding.source_ids,
        })),
        created_at: result.blocking_report.created_at,
      })
      const finalGate = await setResearchFinalGate(
        runDir,
        {
          status: result.blocking_report.status === "passed" ? "passed" : "blocked",
          blockers: result.blocking_report.blockers.map((finding) => finding.category),
        },
        options,
      )
      await appendResearchEvent(
        runDir,
        {
          type: "verification.finalgate.completed",
          actor: "agent",
          payload: {
            status: finalGate.status,
            blocking_report_artifact_id: blockingArtifact.artifact_id,
            review_report_artifact_id: reviewArtifact.artifact_id,
          },
        },
        options,
      )
      span.setAttribute("papercode.research.final_gate.status", finalGate.status)
      return {
        ...result,
        artifacts: {
          blocking_report: blockingArtifact,
          review_report: reviewArtifact,
        },
      }
    },
  )
}
