import { withSpan } from "../telemetry"
import type { VerificationFinding, VerificationGateInput } from "./schemas"

function finding(input: Omit<VerificationFinding, "finding_id">): VerificationFinding {
  return {
    finding_id: `${input.category}:${input.claim_ids[0] ?? input.source_ids[0] ?? input.artifact_ids[0] ?? "global"}`,
    ...input,
  }
}

export function checkReferences(input: VerificationGateInput): VerificationFinding[] {
  return withSpan(
    "research.verification.references",
    {
      "paper_fucker.research.references.available": input.available_source_ids.length,
    },
    () => {
      const available = new Set(input.available_source_ids)
      return input.ledger.entries.flatMap((entry) =>
        entry.citations
          .filter((citation) => !available.has(citation.source_id))
          .map((citation) =>
            finding({
              category: "invalid_reference",
              severity: "blocker",
              message: `Citation ${citation.citation_id} points to missing source ${citation.source_id}.`,
              claim_ids: [entry.claim_id],
              source_ids: [citation.source_id],
              artifact_ids: entry.artifact_ids,
              required_action: "Add verified source record or remove the citation.",
            }),
          ),
      )
    },
  )
}

export function checkClaimSupport(input: VerificationGateInput): VerificationFinding[] {
  return withSpan(
    "research.verification.claims",
    {
      "paper_fucker.research.claims": input.ledger.entries.length,
    },
    () =>
      input.ledger.entries
        .filter((entry) => entry.status !== "supported")
        .map((entry) =>
          finding({
            category: "unsupported_claim",
            severity: "blocker",
            message: `Claim ${entry.claim_id} is ${entry.status}.`,
            claim_ids: [entry.claim_id],
            source_ids: entry.source_ids,
            artifact_ids: entry.artifact_ids,
            required_action: "Bind the claim to verified evidence or remove it from the final draft.",
          }),
        ),
  )
}

export function checkDataAndExperiments(input: VerificationGateInput): VerificationFinding[] {
  return withSpan(
    "research.verification.data_experiments",
    {
      "paper_fucker.research.datasets": input.data_plan.datasets.length,
    },
    () => {
      const licenseFindings = input.data_plan.license_conflicts.map((conflict) =>
        finding({
          category: "dataset_license_failure",
          severity: "blocker",
          message: `Dataset ${conflict.dataset_id} license is ${conflict.license.status}.`,
          claim_ids: [],
          source_ids: [conflict.dataset_id],
          artifact_ids: [],
          required_action: "Replace dataset with clear license data or pause for user approval.",
        }),
      )
      const reproductionFindings =
        input.result_report.reproduction.status === "passed" && input.result_report.final_claims_allowed
          ? []
          : [
              finding({
                category: "reproduction_failure",
                severity: "blocker",
                message: "Experiment result report does not have passed container reproduction.",
                claim_ids: input.ledger.entries
                  .filter((entry) => entry.artifact_ids.some((artifactId) => artifactId.includes("result")))
                  .map((entry) => entry.claim_id),
                source_ids: [],
                artifact_ids: [],
                required_action: "Re-run final experiments in container and regenerate the result report.",
              }),
            ]
      return [...licenseFindings, ...reproductionFindings]
    },
  )
}
