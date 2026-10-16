import { withSpan } from "../telemetry"
import type { ClaimEvidenceInput, ClaimLedger, ClaimLedgerEntry } from "./schemas"

export type ComposeClaimLedgerInput = {
  topic: string
  claims: ClaimEvidenceInput[]
  now?: string
}

function nowIso(override?: string) {
  return override ?? new Date().toISOString()
}

function claimStatus(input: ClaimEvidenceInput): ClaimLedgerEntry["status"] {
  if (input.source_ids.length === 0 || input.artifact_ids.length === 0 || input.confidence < 0.5) return "needs_evidence"
  return "supported"
}

function riskLevel(status: ClaimLedgerEntry["status"], confidence: number): ClaimLedgerEntry["risk_level"] {
  if (status !== "supported" || confidence < 0.5) return "high"
  if (confidence < 0.75) return "medium"
  return "low"
}

function requiredAction(status: ClaimLedgerEntry["status"]): ClaimLedgerEntry["required_action"] {
  return status === "supported" ? "none" : "add_evidence"
}

export function composeClaimLedger(input: ComposeClaimLedgerInput): ClaimLedger {
  const createdAt = nowIso(input.now)
  return withSpan(
    "research.writing.claim_ledger",
    {
      "papercode.research.topic": input.topic,
      "papercode.research.claims": input.claims.length,
    },
    (span) => {
      const sectionCounts = new Map<string, number>()
      const entries = input.claims.map((claim) => {
        const next = (sectionCounts.get(claim.section_id) ?? 0) + 1
        sectionCounts.set(claim.section_id, next)
        const status = claimStatus(claim)
        const entry: ClaimLedgerEntry = {
          ...claim,
          claim_id: `claim:${claim.section_id}:${next}`,
          status,
          risk_level: riskLevel(status, claim.confidence),
          required_action: requiredAction(status),
          citations: claim.source_ids.map((sourceId) => ({
            citation_id: `cite:${sourceId}`,
            source_id: sourceId,
          })),
        }
        return entry
      })
      const unsupported = entries.filter((entry) => entry.status !== "supported").map((entry) => entry.claim_id)
      span.setAttribute("papercode.research.claims.unsupported", unsupported.length)
      return {
        schema_version: "ClaimLedger.v1",
        topic: input.topic,
        created_at: createdAt,
        entries,
        unsupported_claim_ids: unsupported,
      }
    },
  )
}
