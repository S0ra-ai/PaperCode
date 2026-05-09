import type { ResearchSourceKind } from "../contracts"

export type SourceLicenseStatus = "clear" | "unclear" | "restricted" | "conflict"

export type SourceLicense = {
  status: SourceLicenseStatus
  expression?: string
  url?: string
}

export type SourceVersion = {
  value?: string
  retrieved_at: string
  published_at?: string
  hash?: string
}

export type SourceVerification = {
  status: "verified" | "failed" | "unverified"
  method: string
  checked_at: string
  diagnostics?: string[]
}

export type SourceCandidate = {
  source_id: string
  kind: ResearchSourceKind
  title: string
  url: string
  provider: string
  license: SourceLicense
  version: SourceVersion
  verification: SourceVerification
  topics?: string[]
  abstract?: string
  doi?: string
  arxiv_id?: string
  sha256?: string
}

export type SourceRecord = SourceCandidate & {
  schema_version: "SourceRecord.v1"
  retrieved_at: string
}

export type LiteratureCluster = {
  cluster_id: string
  label: string
  keywords: string[]
  source_ids: string[]
  confidence: number
}

export type LiteratureMap = {
  schema_version: "LiteratureMap.v1"
  topic: string
  created_at: string
  sources: SourceRecord[]
  clusters: LiteratureCluster[]
  summary: {
    total_sources: number
    verified_sources: number
    open_license_sources: number
  }
  diagnostics: {
    verification_failures: Array<{ source_id: string; reason: string }>
    gaps: string[]
  }
}

export type DatasetAccess = "open" | "registration_required" | "restricted" | "unavailable"

export type DatasetCandidate = {
  dataset_id: string
  title: string
  url: string
  provider: string
  license: SourceLicense
  version: SourceVersion
  verification: SourceVerification
  topics?: string[]
  access: DatasetAccess
  task_fit: number
  source_id?: string
  sha256?: string
}

export type DatasetCard = DatasetCandidate & {
  schema_version: "DatasetCard.v1"
  source_id: string
  created_at: string
}

export type DataPlan = {
  schema_version: "DataPlan.v1"
  topic: string
  created_at: string
  datasets: DatasetCard[]
  license_conflicts: Array<{ dataset_id: string; license: SourceLicense }>
  access_constraints: Array<{ dataset_id: string; access: DatasetAccess }>
  diagnostics: {
    verification_failures: Array<{ dataset_id: string; reason: string }>
    gaps: string[]
  }
  recommendation: "use" | "turn" | "pause"
}

export type NearbyDirection = {
  topic: string
  rationale: string
  dataset_candidates: DatasetCandidate[]
}

export type DirectionFeasibility = {
  schema_version: "DirectionFeasibility.v1"
  topic: string
  selected_direction: string
  status: "feasible" | "turned" | "pause"
  confidence: number
  rationale: string
  blockers: string[]
  rollback: {
    original_topic: string
    previous_direction?: string
    reason?: string
  }
  candidate_dataset_ids: string[]
  created_at: string
}

export type DiscoveryInput = {
  topic: string
  full_access?: boolean
  literature_candidates?: SourceCandidate[]
  dataset_candidates?: DatasetCandidate[]
  nearby_directions?: NearbyDirection[]
  min_verified_sources?: number
  now?: string
}

export const CLEAR_LICENSE_STATUSES: SourceLicenseStatus[] = ["clear"]
