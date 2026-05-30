import { withSpan } from "../telemetry"
import { openVerifiedDatasets } from "../sources"
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
      const invalidReferences = input.ledger.entries.flatMap((entry) =>
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
      const verifiedPaperReferences = (input.source_records ?? []).filter(
        (source) => source.kind === "paper" && source.verification.status === "verified" && source.license.status === "clear",
      )
      const referenceReadiness =
        verifiedPaperReferences.length > 0
          ? []
          : [
              finding({
                category: "missing_verified_reference",
                severity: "warning",
                message: "No verified paper reference is available for the formal References section.",
                claim_ids: [],
                source_ids: [],
                artifact_ids: [],
                required_action: "Complete DOI/arXiv/publisher verification before treating the draft as submission-ready.",
              }),
            ]
      return [...invalidReferences, ...referenceReadiness]
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

export function checkSourceAuthenticity(input: VerificationGateInput): VerificationFinding[] {
  return withSpan(
    "research.verification.source_authenticity",
    {
      "paper_fucker.research.sources.records": input.source_records?.length ?? 0,
    },
    () => {
      if (!input.source_records) return []
      const records = new Map(input.source_records.map((source) => [source.source_id, source]))
      const citedSourceIds = Array.from(new Set(input.ledger.entries.flatMap((entry) => entry.source_ids)))
      return citedSourceIds.flatMap((sourceId) => {
        const source = records.get(sourceId)
        if (!source) return []
        const findings: VerificationFinding[] = []
        if (source.verification.status !== "verified") {
          findings.push(
            finding({
              category: "unverified_source",
              severity: "blocker",
              message: `Source ${sourceId} is ${source.verification.status}; final export requires verified sources.`,
              claim_ids: input.ledger.entries
                .filter((entry) => entry.source_ids.includes(sourceId))
                .map((entry) => entry.claim_id),
              source_ids: [sourceId],
              artifact_ids: [],
              required_action: "Verify the source through an approved live source/MCP check or provide SourceEvidenceManifest.v1.",
            }),
          )
        }
        if (source.license.status !== "clear") {
          findings.push(
            finding({
              category: "source_license_failure",
              severity: "blocker",
              message: `Source ${sourceId} has ${source.license.status} license status.`,
              claim_ids: input.ledger.entries
                .filter((entry) => entry.source_ids.includes(sourceId))
                .map((entry) => entry.claim_id),
              source_ids: [sourceId],
              artifact_ids: [],
              required_action: "Replace the source with clear-license evidence or pause for user approval.",
            }),
          )
        }
        return findings
      })
    },
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
      const openDatasets = openVerifiedDatasets(input.data_plan)
      const datasetFindings =
        input.data_plan.datasets.length === 0 || openDatasets.length > 0
          ? []
          : [
              finding({
                category: "missing_open_dataset",
                severity: "blocker",
                message: "Dataset candidates were provided, but none are open verified or workspace-authorized for final experimental claims.",
                claim_ids: [],
                source_ids: input.data_plan.datasets.map((dataset) => dataset.dataset_id),
                artifact_ids: [],
                required_action: "Attach a verified open dataset or workspace-authorized local dataset before final export.",
              }),
            ]
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
      return [...licenseFindings, ...datasetFindings, ...reproductionFindings]
    },
  )
}
