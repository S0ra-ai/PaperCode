import { withSpan } from "../telemetry"
import type { DataPlan, DatasetCandidate, DatasetCard } from "./schemas"

export type DatasetDiscoveryInput = {
  topic: string
  candidates?: DatasetCandidate[]
  now?: string
}

function nowIso(override?: string) {
  return override ?? new Date().toISOString()
}

function datasetSourceId(candidate: DatasetCandidate) {
  return candidate.source_id ?? `dataset:${candidate.dataset_id}`
}

function normalizeDataset(candidate: DatasetCandidate, now: string): DatasetCard {
  return {
    schema_version: "DatasetCard.v1",
    ...candidate,
    source_id: datasetSourceId(candidate),
    created_at: now,
  }
}

function verificationFailure(dataset: DatasetCard) {
  if (dataset.verification.status !== "failed") return undefined
  return {
    dataset_id: dataset.dataset_id,
    reason: dataset.verification.diagnostics?.[0] ?? "dataset verification failed",
  }
}

export function discoverDatasets(input: DatasetDiscoveryInput): DataPlan {
  const createdAt = nowIso(input.now)
  return withSpan(
    "research.sources.dataset_discover",
    {
      "paper_fucker.research.topic": input.topic,
      "paper_fucker.research.datasets.candidates": input.candidates?.length ?? 0,
    },
    (span) => {
      const datasets = (input.candidates ?? []).map((candidate) => normalizeDataset(candidate, createdAt))
      const licenseConflicts = datasets
        .filter((dataset) => dataset.license.status !== "clear")
        .map((dataset) => ({ dataset_id: dataset.dataset_id, license: dataset.license }))
      const accessConstraints = datasets
        .filter((dataset) => dataset.access !== "open")
        .map((dataset) => ({ dataset_id: dataset.dataset_id, access: dataset.access }))
      const failures = datasets
        .map(verificationFailure)
        .filter((item): item is { dataset_id: string; reason: string } => Boolean(item))
      const openVerified = datasets.filter(
        (dataset) => dataset.license.status === "clear" && dataset.verification.status === "verified" && dataset.access === "open",
      )
      const gaps: string[] = []
      if (datasets.length === 0) gaps.push("missing_dataset_candidates")
      if (datasets.length > 0 && openVerified.length === 0) gaps.push("no_open_verified_dataset")

      span.setAttribute("paper_fucker.research.datasets.open_verified", openVerified.length)
      span.setAttribute("paper_fucker.research.datasets.license_conflicts", licenseConflicts.length)
      return {
        schema_version: "DataPlan.v1",
        topic: input.topic,
        created_at: createdAt,
        datasets,
        license_conflicts: licenseConflicts,
        access_constraints: accessConstraints,
        diagnostics: {
          verification_failures: failures,
          gaps,
        },
        recommendation: licenseConflicts.length > 0 ? "pause" : openVerified.length > 0 ? "use" : "turn",
      }
    },
  )
}

export function openVerifiedDatasets(dataPlan: DataPlan) {
  return dataPlan.datasets.filter(
    (dataset) => dataset.license.status === "clear" && dataset.verification.status === "verified" && dataset.access === "open",
  )
}
