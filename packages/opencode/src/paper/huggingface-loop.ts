import { createHash } from "crypto"
import { RESEARCH_SCHEMA_VERSION, type ResearchSource, type ResearchToolTrace } from "./research/contracts"
import type { ExperimentRun } from "./research/experiments"

export type HFResearchKind = "docs" | "papers" | "datasets" | "models" | "spaces" | "jobs" | "trackio"
export type HFResearchTrust = "hf_official" | "community" | "test_record" | "user_provided_trackio_export"

export interface HFResearchLoopCapability {
  schema_version: "HFResearchLoopCapability.v1"
  name: string
  kind: HFResearchKind
  title: string
  output_schema: string
  requires_network: boolean
  requires_approval: boolean
  allowed_stages: string[]
}

export interface HFResearchLoopPlan {
  schema_version: "HFResearchLoopPlan.v1"
  plan_id: string
  topic: string
  query: string
  capabilities: HFResearchLoopCapability[]
  approval_policy: {
    network_default: "network_blocked_without_authorization" | "explicit_allow_network"
    remote_jobs_require_approval: true
    upload_requires_approval: true
  }
  trace_policy: {
    replayable: true
    persist_tool_trace: true
    persist_source_records: true
  }
}

export interface HFPaperRecord {
  schema_version: "HFPaperRecord.v1"
  paper_id: string
  title: string
  url: string
  summary?: string
  published_at?: string
  authors: string[]
  source_verified: boolean
  trust: HFResearchTrust
}

export interface HFDatasetRecord {
  schema_version: "HFDatasetRecord.v1"
  dataset_id: string
  title: string
  url: string
  license?: string
  version?: string
  splits: string[]
  task_categories: string[]
  source_verified: boolean
  trust: HFResearchTrust
}

export interface HFModelRecord {
  schema_version: "HFModelRecord.v1"
  model_id: string
  title: string
  url: string
  pipeline_tag?: string
  license?: string
  source_verified: boolean
  trust: HFResearchTrust
}

export interface HFSpaceRecord {
  schema_version: "HFSpaceRecord.v1"
  space_id: string
  title: string
  url: string
  sdk?: string
  source_verified: boolean
  trust: HFResearchTrust
}

export interface HFJobRecord {
  schema_version: "HFJobRecord.v1"
  job_id: string
  title: string
  url?: string
  status: "planned" | "queued" | "running" | "succeeded" | "failed" | "approval_required"
  command: string[]
  metrics: Array<{ name: string; value: number; direction: "higher_better" | "lower_better"; unit?: string }>
  logs_uri?: string
  cost_usd?: number
  runtime_image?: string
  runtime_digest?: string
  source_verified: boolean
  trust: HFResearchTrust
}

export interface HFTrackioRecord {
  schema_version: "HFTrackioRecord.v1"
  run_id: string
  title: string
  metrics: Array<{ name: string; value: number; step?: number }>
  url?: string
  source_verified: boolean
  trust: HFResearchTrust
}

export type HFResearchRecord =
  | HFPaperRecord
  | HFDatasetRecord
  | HFModelRecord
  | HFSpaceRecord
  | HFJobRecord
  | HFTrackioRecord

export interface HFLoopDiagnostics {
  records: number
  verified_sources: number
  datasets: number
  jobs: number
  jobs_requiring_approval: number
  failed_jobs: number
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
}

function nowIso(override?: string) {
  return override ?? new Date().toISOString()
}

export function builtinHFResearchLoopCapabilities(): HFResearchLoopCapability[] {
  return [
    {
      schema_version: "HFResearchLoopCapability.v1",
      name: "hf.docs",
      kind: "docs",
      title: "Hugging Face docs search",
      output_schema: "HFDocRecord.v1",
      requires_network: true,
      requires_approval: false,
      allowed_stages: ["literature", "experiment_design", "verification"],
    },
    {
      schema_version: "HFResearchLoopCapability.v1",
      name: "hf.papers",
      kind: "papers",
      title: "Hugging Face papers",
      output_schema: "HFPaperRecord.v1",
      requires_network: true,
      requires_approval: false,
      allowed_stages: ["literature", "verification"],
    },
    {
      schema_version: "HFResearchLoopCapability.v1",
      name: "hf.datasets",
      kind: "datasets",
      title: "Hugging Face datasets",
      output_schema: "HFDatasetRecord.v1",
      requires_network: true,
      requires_approval: false,
      allowed_stages: ["data", "experiment_design", "verification"],
    },
    {
      schema_version: "HFResearchLoopCapability.v1",
      name: "hf.models",
      kind: "models",
      title: "Hugging Face models",
      output_schema: "HFModelRecord.v1",
      requires_network: true,
      requires_approval: false,
      allowed_stages: ["literature", "experiment_design", "verification"],
    },
    {
      schema_version: "HFResearchLoopCapability.v1",
      name: "hf.spaces",
      kind: "spaces",
      title: "Hugging Face Spaces",
      output_schema: "HFSpaceRecord.v1",
      requires_network: true,
      requires_approval: false,
      allowed_stages: ["literature", "experiment_design", "verification"],
    },
    {
      schema_version: "HFResearchLoopCapability.v1",
      name: "hf.jobs",
      kind: "jobs",
      title: "Hugging Face Jobs",
      output_schema: "HFJobRecord.v1",
      requires_network: true,
      requires_approval: true,
      allowed_stages: ["experiment_execution", "reproduction"],
    },
    {
      schema_version: "HFResearchLoopCapability.v1",
      name: "hf.trackio",
      kind: "trackio",
      title: "Hugging Face Trackio",
      output_schema: "HFTrackioRecord.v1",
      requires_network: true,
      requires_approval: true,
      allowed_stages: ["experiment_execution", "reproduction", "verification"],
    },
  ]
}

export function createHFResearchLoopPlan(input: {
  topic: string
  query?: string
  plan_id?: string
  include_remote_jobs?: boolean
}): HFResearchLoopPlan {
  const capabilities = builtinHFResearchLoopCapabilities().filter((capability) => {
    return input.include_remote_jobs ? true : capability.kind !== "jobs" && capability.kind !== "trackio"
  })
  return {
    schema_version: "HFResearchLoopPlan.v1",
    plan_id: input.plan_id ?? `hf-loop:${slug(input.topic) || "topic"}`,
    topic: input.topic,
    query: input.query ?? input.topic,
    capabilities,
    approval_policy: {
      network_default: "explicit_allow_network",
      remote_jobs_require_approval: true,
      upload_requires_approval: true,
    },
    trace_policy: {
      replayable: true,
      persist_tool_trace: true,
      persist_source_records: true,
    },
  }
}

export function createHFPaperRecord(input: Omit<HFPaperRecord, "schema_version" | "trust" | "source_verified"> & Partial<Pick<HFPaperRecord, "trust" | "source_verified">>): HFPaperRecord {
  return {
    schema_version: "HFPaperRecord.v1",
    trust: input.trust ?? "hf_official",
    source_verified: input.source_verified ?? true,
    ...input,
  }
}

export function createHFDatasetRecord(input: Omit<HFDatasetRecord, "schema_version" | "trust" | "source_verified"> & Partial<Pick<HFDatasetRecord, "trust" | "source_verified">>): HFDatasetRecord {
  return {
    schema_version: "HFDatasetRecord.v1",
    trust: input.trust ?? "hf_official",
    source_verified: input.source_verified ?? true,
    ...input,
  }
}

export function createHFJobRecord(input: Omit<HFJobRecord, "schema_version" | "trust" | "source_verified"> & Partial<Pick<HFJobRecord, "trust" | "source_verified">>): HFJobRecord {
  return {
    schema_version: "HFJobRecord.v1",
    trust: input.trust ?? "hf_official",
    source_verified: input.source_verified ?? true,
    ...input,
  }
}

function recordURL(record: HFResearchRecord) {
  if ("url" in record && typeof record.url === "string") return record.url
  return undefined
}

function recordTitle(record: HFResearchRecord) {
  return record.title
}

function recordKind(record: HFResearchRecord): ResearchSource["kind"] {
  if (record.schema_version === "HFPaperRecord.v1") return "paper"
  if (record.schema_version === "HFDatasetRecord.v1") return "dataset"
  if (record.schema_version === "HFJobRecord.v1" || record.schema_version === "HFTrackioRecord.v1") return "tool_output"
  return "web"
}

function recordId(record: HFResearchRecord) {
  if (record.schema_version === "HFPaperRecord.v1") return record.paper_id
  if (record.schema_version === "HFDatasetRecord.v1") return record.dataset_id
  if (record.schema_version === "HFModelRecord.v1") return record.model_id
  if (record.schema_version === "HFSpaceRecord.v1") return record.space_id
  if (record.schema_version === "HFJobRecord.v1") return record.job_id
  return record.run_id
}

export function hfRecordsToResearchSources(input: {
  run_id: string
  records: HFResearchRecord[]
  created_at?: string
}): ResearchSource[] {
  const createdAt = nowIso(input.created_at)
  return input.records.map((record) => ({
    schema_version: RESEARCH_SCHEMA_VERSION,
    source_id: `hf:${record.schema_version}:${hash(recordId(record)).slice(0, 12)}`,
    run_id: input.run_id,
    kind: recordKind(record),
    title: recordTitle(record),
    locator: {
      uri: recordURL(record),
    },
    created_at: createdAt,
    metadata: {
      artifact_schema: record.schema_version,
      hf_record_id: recordId(record),
      source_verified: record.source_verified,
      trust: record.trust,
      record,
    },
  }))
}

export function hfJobToExperimentRun(input: {
  plan_id: string
  job: HFJobRecord
  started_at?: string
  finished_at?: string
}): ExperimentRun {
  const status = input.job.status === "succeeded" ? "succeeded" : input.job.status === "failed" ? "failed" : "environment_failed"
  return {
    schema_version: "ExperimentRun.v1",
    experiment_run_id: `hf-job:${input.job.job_id}`,
    plan_id: input.plan_id,
    experiment_id: input.job.job_id,
    role: "proposed",
    status,
    environment: {
      mode: "container",
      platform: "container",
      image: input.job.runtime_image,
      digest: input.job.runtime_digest,
    },
    command: {
      argv: input.job.command,
    },
    metrics: input.job.metrics,
    stdout: input.job.logs_uri ?? "",
    stderr: status === "succeeded" ? "" : "HF job did not complete successfully.",
    exit_code: status === "succeeded" ? 0 : 1,
    resource_usage: {
      wall_time_seconds: 0,
      cost_usd: input.job.cost_usd,
    },
    failure_category: status === "succeeded" ? undefined : "environment_failed",
    started_at: nowIso(input.started_at),
    finished_at: nowIso(input.finished_at ?? input.started_at),
    reproduction: {
      container_reproduced: status === "succeeded",
      image: input.job.runtime_image,
      digest: input.job.runtime_digest,
    },
  }
}

export function hfLoopToolTrace(input: {
  run_id: string
  trace_id: string
  capability: HFResearchLoopCapability
  payload: Record<string, unknown>
  records: HFResearchRecord[]
  started_at: string
  ended_at?: string
  error?: string
}): ResearchToolTrace {
  return {
    schema_version: RESEARCH_SCHEMA_VERSION,
    trace_id: input.trace_id,
    run_id: input.run_id,
    tool_name: input.capability.name,
    status: input.error ? "failed" : "succeeded",
    started_at: input.started_at,
    ended_at: input.ended_at,
    input: {
      payload: input.payload,
      capability: input.capability,
    },
    output: {
      records: input.records,
      record_count: input.records.length,
    },
    error: input.error,
  }
}

export function hfLoopDiagnostics(input: { sources: ResearchSource[] }): HFLoopDiagnostics {
  const records = input.sources.filter((source) => {
    const schema = source.metadata?.artifact_schema
    return typeof schema === "string" && schema.startsWith("HF") && schema.endsWith(".v1")
  })
  return {
    records: records.length,
    verified_sources: records.filter((source) => source.metadata?.source_verified === true).length,
    datasets: records.filter((source) => source.metadata?.artifact_schema === "HFDatasetRecord.v1").length,
    jobs: records.filter((source) => source.metadata?.artifact_schema === "HFJobRecord.v1").length,
    jobs_requiring_approval: records.filter((source) => {
      const record = source.metadata?.record
      return Boolean(record && typeof record === "object" && "status" in record && record.status === "approval_required")
    }).length,
    failed_jobs: records.filter((source) => {
      const record = source.metadata?.record
      return Boolean(record && typeof record === "object" && "status" in record && record.status === "failed")
    }).length,
  }
}
