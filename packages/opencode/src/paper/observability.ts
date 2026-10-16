import { RESEARCH_SCHEMA_VERSION, type ResearchEvent, type ResearchMetadata } from "./research/contracts"
import {
  appendResearchEvent,
  appendResearchFact,
  loadResearchRun,
  nextResearchId,
  updateRuntimeState,
  type ResearchRuntimeOptions,
} from "./research/runtime"
import { applyCostUsage, type ResearchCostUsage } from "./research/runtime/policy"
import { evaluateDataEgressPolicy, type DataEgressEvaluationResult, type DataEgressPolicy } from "./data-egress"
import type { ResearchCapability } from "./capabilities"
import type { PaperModelRef } from "./model-router"

export const PAPER_OBSERVABILITY_REQUIRED_KINDS = [
  "stage",
  "capability",
  "model_role",
  "subagent",
  "tool",
  "data_egress",
  "export_renderer",
  "cost",
] as const

export type PaperObservabilityAuditKind = (typeof PAPER_OBSERVABILITY_REQUIRED_KINDS)[number]

export type PaperObservabilityStatus = "queued" | "running" | "succeeded" | "failed" | "blocked" | "skipped"

export interface PaperObservabilityAuditEntry {
  schema_version: "PaperObservabilityAudit.v1"
  audit_id: string
  run_id: string
  kind: PaperObservabilityAuditKind
  name: string
  status: PaperObservabilityStatus
  span_name: string
  attributes: ResearchMetadata
  created_at: string
}

export interface PaperObservabilityAuditSummary {
  schema_version: "PaperObservabilityAuditSummary.v1"
  required_kinds: PaperObservabilityAuditKind[]
  missing_kinds: PaperObservabilityAuditKind[]
  counts: Record<PaperObservabilityAuditKind, number>
  coverage: {
    required_kinds: PaperObservabilityAuditKind[]
    missing_kinds: PaperObservabilityAuditKind[]
    counts: Record<PaperObservabilityAuditKind, number>
  }
  entries: PaperObservabilityAuditEntry[]
}

export interface RecordPaperObservabilityAuditInput {
  kind: PaperObservabilityAuditKind
  name: string
  status: PaperObservabilityStatus
  span_name: string
  attributes?: ResearchMetadata
}

export interface RecordPaperToolTraceInput {
  tool_name: string
  status: "queued" | "running" | "succeeded" | "failed"
  input?: ResearchMetadata
  output?: ResearchMetadata
  error?: string
  started_at?: string
  ended_at?: string
}

export interface RecordPaperDataEgressAuditInput {
  policy: DataEgressPolicy
  candidates: string[]
  stage?: string
}

export interface RecordPaperCostUsageInput extends ResearchCostUsage {
  reason?: string
}

export interface RecordDefaultPaperRunObservabilityInput {
  model_roles: Record<string, PaperModelRef>
  capabilities: ResearchCapability[]
  data_egress_policy: DataEgressPolicy
  data_egress_candidates: string[]
  budget_tier: string
  quality_mode: string
}

function nowIso(options?: ResearchRuntimeOptions) {
  return (options?.clock?.() ?? new Date()).toISOString()
}

function auditID(kind: PaperObservabilityAuditKind, options?: ResearchRuntimeOptions) {
  return nextResearchId("event", options).replace(/^event/, `audit:${kind}`)
}

function eventAuditEntry(event: ResearchEvent): PaperObservabilityAuditEntry | undefined {
  const payload = event.payload?.audit
  if (!payload || typeof payload !== "object") return undefined
  const entry = payload as Partial<PaperObservabilityAuditEntry>
  if (
    entry.schema_version !== "PaperObservabilityAudit.v1" ||
    typeof entry.audit_id !== "string" ||
    typeof entry.run_id !== "string" ||
    typeof entry.kind !== "string" ||
    typeof entry.name !== "string" ||
    typeof entry.status !== "string" ||
    typeof entry.span_name !== "string" ||
    typeof entry.created_at !== "string"
  ) {
    return undefined
  }
  return {
    schema_version: "PaperObservabilityAudit.v1",
    audit_id: entry.audit_id,
    run_id: entry.run_id,
    kind: entry.kind as PaperObservabilityAuditKind,
    name: entry.name,
    status: entry.status as PaperObservabilityStatus,
    span_name: entry.span_name,
    attributes: (entry.attributes ?? {}) as ResearchMetadata,
    created_at: entry.created_at,
  }
}

function stageAuditEntry(event: ResearchEvent): PaperObservabilityAuditEntry | undefined {
  if (!event.type.startsWith("paperorchestrator.stage.")) return undefined
  const stage = typeof event.payload?.stage === "string" ? event.payload.stage : "unknown"
  const status = event.type.endsWith(".started")
    ? "running"
    : event.type.endsWith(".blocked")
      ? "blocked"
      : event.type.endsWith(".completed")
        ? "succeeded"
        : "running"
  return {
    schema_version: "PaperObservabilityAudit.v1",
    audit_id: `${event.event_id}:stage`,
    run_id: event.run_id,
    kind: "stage",
    name: stage,
    status,
    span_name: `papercode.stage.${stage}`,
    attributes: {
      event_type: event.type,
      ...event.payload,
    },
    created_at: event.created_at,
  }
}

export function paperObservabilityAuditFromEvents(events: ResearchEvent[]): PaperObservabilityAuditSummary {
  const entries = events.flatMap((event) => {
    const explicit = eventAuditEntry(event)
    const stage = stageAuditEntry(event)
    return [explicit, stage].filter((item): item is PaperObservabilityAuditEntry => Boolean(item))
  })
  const counts = Object.fromEntries(PAPER_OBSERVABILITY_REQUIRED_KINDS.map((kind) => [kind, 0])) as Record<
    PaperObservabilityAuditKind,
    number
  >
  for (const entry of entries) counts[entry.kind] += 1
  const missing = PAPER_OBSERVABILITY_REQUIRED_KINDS.filter((kind) => counts[kind] === 0)
  return {
    schema_version: "PaperObservabilityAuditSummary.v1",
    required_kinds: [...PAPER_OBSERVABILITY_REQUIRED_KINDS],
    missing_kinds: missing,
    counts,
    coverage: {
      required_kinds: [...PAPER_OBSERVABILITY_REQUIRED_KINDS],
      missing_kinds: missing,
      counts,
    },
    entries,
  }
}

export async function recordPaperObservabilityAudit(
  runDir: string,
  input: RecordPaperObservabilityAuditInput,
  options?: ResearchRuntimeOptions,
) {
  const run = await loadResearchRun(runDir)
  const createdAt = nowIso(options)
  const audit: PaperObservabilityAuditEntry = {
    schema_version: "PaperObservabilityAudit.v1",
    audit_id: auditID(input.kind, options),
    run_id: run.run_id,
    kind: input.kind,
    name: input.name,
    status: input.status,
    span_name: input.span_name,
    attributes: input.attributes ?? {},
    created_at: createdAt,
  }
  await appendResearchEvent(
    runDir,
    {
      type: "paper.observability.audit",
      actor: "system",
      created_at: createdAt,
      payload: { audit },
    },
    options,
  )
  return audit
}

export async function recordPaperToolTrace(
  runDir: string,
  input: RecordPaperToolTraceInput,
  options?: ResearchRuntimeOptions,
) {
  const run = await loadResearchRun(runDir)
  const startedAt = input.started_at ?? nowIso(options)
  const endedAt = input.ended_at ?? (input.status === "running" || input.status === "queued" ? undefined : nowIso(options))
  const trace = await appendResearchFact(runDir, "tool_trace", {
    schema_version: RESEARCH_SCHEMA_VERSION,
    trace_id: nextResearchId("event", options).replace(/^event/, "trace"),
    run_id: run.run_id,
    tool_name: input.tool_name,
    status: input.status,
    started_at: startedAt,
    ended_at: endedAt,
    input: input.input ?? {},
    output: input.output,
    error: input.error,
  })
  await recordPaperObservabilityAudit(
    runDir,
    {
      kind: "tool",
      name: input.tool_name,
      status: input.status,
      span_name: `papercode.tool.${input.tool_name}`,
      attributes: {
        trace_id: trace.trace_id,
        has_error: Boolean(input.error),
      },
    },
    options,
  )
  return trace
}

export async function recordPaperCostUsage(
  runDir: string,
  input: RecordPaperCostUsageInput,
  options?: ResearchRuntimeOptions,
) {
  const updatedAt = nowIso(options)
  const state = await updateRuntimeState(runDir, (current) => ({
    ...current,
    cost: applyCostUsage(current.cost, input, updatedAt),
    updated_at: updatedAt,
  }))
  await recordPaperObservabilityAudit(
    runDir,
    {
      kind: "cost",
      name: input.reason ?? "cost_usage",
      status: "succeeded",
      span_name: "papercode.cost.usage",
      attributes: {
        llm_usd: input.llm_usd ?? 0,
        api_usd: input.api_usd ?? 0,
        total_usd: state.cost.total_usd,
        alerts: state.cost.alerts.length,
      },
    },
    options,
  )
  return state.cost
}

export async function recordPaperDataEgressAudit(
  runDir: string,
  input: RecordPaperDataEgressAuditInput,
  options?: ResearchRuntimeOptions,
): Promise<DataEgressEvaluationResult> {
  const result = evaluateDataEgressPolicy({
    policy: input.policy,
    candidates: input.candidates,
  })
  await recordPaperObservabilityAudit(
    runDir,
    {
      kind: "data_egress",
      name: input.stage ?? "data_egress",
      status: result.blocked.length > 0 ? "blocked" : "succeeded",
      span_name: "papercode.data_egress.evaluate",
      attributes: {
        stage: input.stage,
        candidates: input.candidates.length,
        allowed: result.allowed.length,
        blocked: result.blocked.length,
        blocked_reasons: result.blocked.map((item) => item.reason),
      },
    },
    options,
  )
  return result
}

export async function recordDefaultPaperRunObservability(
  runDir: string,
  input: RecordDefaultPaperRunObservabilityInput,
  options?: ResearchRuntimeOptions,
) {
  const run = await loadResearchRun(runDir)
  for (const [role, model] of Object.entries(input.model_roles)) {
    await recordPaperObservabilityAudit(
      runDir,
      {
        kind: "model_role",
        name: role,
        status: "succeeded",
        span_name: `papercode.model_role.${role}`,
        attributes: {
          provider_id: model.provider_id,
          model_id: model.model_id,
        },
      },
      options,
    )
  }

  for (const capability of input.capabilities) {
    await recordPaperObservabilityAudit(
      runDir,
      {
        kind: "capability",
        name: capability.name,
        status: "succeeded",
        span_name: `papercode.capability.${capability.name}`,
        attributes: {
          type: capability.type,
          stage_count: capability.allowed_stages.length,
          trust: capability.trust,
          network: capability.network,
        },
      },
      options,
    )
  }

  await recordPaperObservabilityAudit(
    runDir,
    {
      kind: "subagent",
      name: "root_run_agent",
      status: "succeeded",
      span_name: "papercode.agent.root_run_agent",
      attributes: {
        agent_id: `${run.run_id}:root`,
        depth: 0,
        budget_tier: input.budget_tier,
      },
    },
    options,
  )
  await appendResearchEvent(
    runDir,
    {
      event_id: `${run.run_id}:agent-root-spawned`,
      type: "agent.spawned",
      actor: "system",
      payload: {
        agent_id: `${run.run_id}:root`,
        depth: 0,
        role: "root_run_agent",
        budget_tier: input.budget_tier,
        recursive_depth_policy: "unbounded",
      },
    },
    options,
  )

  await recordPaperToolTrace(
    runDir,
    {
      tool_name: "paper.default_engine",
      status: "succeeded",
      input: {
        capability_count: input.capabilities.length,
        budget_tier: input.budget_tier,
        quality_mode: input.quality_mode,
      },
      output: {
        run_id: run.run_id,
      },
    },
    options,
  )

  await recordPaperDataEgressAudit(
    runDir,
    {
      policy: input.data_egress_policy,
      candidates: input.data_egress_candidates,
      stage: "intake",
    },
    options,
  )

  await recordPaperCostUsage(runDir, { llm_usd: 0, api_usd: 0, reason: "default_engine_baseline" }, options)
}
