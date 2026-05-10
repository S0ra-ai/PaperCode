import { createHash } from "crypto"
import {
  createResearchCapabilityRegistry,
  type PaperCapabilityStage,
  type ResearchCapabilityRegistry,
  type ResearchCapabilityTrace,
} from "./capabilities"
import { builtinResearchCapabilities } from "./capability-pack"

export type PaperHarnessCallStatus =
  | "queued"
  | "approval_required"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "blocked"

export interface PaperHarnessPolicy {
  schema_version: "PaperHarnessPolicy.v1"
  max_parallel: number
  max_retries: number
  duplicate_window: number
  doom_loop_threshold: number
  approval_required_capabilities: string[]
}

export interface PaperHarnessCall {
  call_id: string
  run_id: string
  stage: PaperCapabilityStage
  capability_name: string
  priority: "critical" | "high" | "medium" | "low"
  status: PaperHarnessCallStatus
  input: Record<string, unknown>
  input_hash: string
  attempts: number
  requires_approval: boolean
  diagnostics: string[]
  trace?: ResearchCapabilityTrace
  queued_at: string
  updated_at: string
}

export interface PaperHarnessEvent {
  type:
    | "harness.call_queued"
    | "harness.call_started"
    | "harness.call_completed"
    | "harness.call_failed"
    | "harness.call_skipped"
    | "harness.approval_required"
    | "harness.doom_loop_detected"
  call_id: string
  created_at: string
  detail?: string
}

export interface PaperHarnessState {
  schema_version: "PaperHarness.v1"
  run_id: string
  policy: PaperHarnessPolicy
  calls: PaperHarnessCall[]
  events: PaperHarnessEvent[]
}

export interface PaperHarnessNextDecision {
  action: "run" | "wait_for_approval" | "wait_for_capacity" | "idle" | "blocked"
  call?: PaperHarnessCall
  message: string
}

function now(input?: string) {
  return input ?? new Date().toISOString()
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function inputHash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function priorityRank(priority: PaperHarnessCall["priority"]) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[priority]
}

export function defaultPaperHarnessPolicy(input?: Partial<PaperHarnessPolicy>): PaperHarnessPolicy {
  return {
    schema_version: "PaperHarnessPolicy.v1",
    max_parallel: input?.max_parallel ?? 4,
    max_retries: input?.max_retries ?? 2,
    duplicate_window: input?.duplicate_window ?? 3,
    doom_loop_threshold: input?.doom_loop_threshold ?? 3,
    approval_required_capabilities: input?.approval_required_capabilities ?? [
      "hf.jobs",
      "python.web-crawler.scrapling",
      "mcp.scrapling",
      "opencode.shell",
    ],
  }
}

export function createPaperHarness(input: {
  run_id: string
  policy?: Partial<PaperHarnessPolicy>
}): PaperHarnessState {
  return {
    schema_version: "PaperHarness.v1",
    run_id: input.run_id,
    policy: defaultPaperHarnessPolicy(input.policy),
    calls: [],
    events: [],
  }
}

function duplicateCount(harness: PaperHarnessState, capabilityName: string, hash: string) {
  return harness.calls
    .slice(-harness.policy.duplicate_window)
    .filter((call) => call.capability_name === capabilityName && call.input_hash === hash).length
}

export function enqueueHarnessCall(
  harness: PaperHarnessState,
  input: {
    call_id: string
    stage: PaperCapabilityStage
    capability_name: string
    payload?: Record<string, unknown>
    priority?: PaperHarnessCall["priority"]
    requires_approval?: boolean
    queued_at?: string
  },
): PaperHarnessCall {
  const queuedAt = now(input.queued_at)
  const payload = input.payload ?? {}
  const hash = inputHash(payload)
  const requiresApproval =
    input.requires_approval ?? harness.policy.approval_required_capabilities.includes(input.capability_name)
  const call: PaperHarnessCall = {
    call_id: input.call_id,
    run_id: harness.run_id,
    stage: input.stage,
    capability_name: input.capability_name,
    priority: input.priority ?? "medium",
    status: requiresApproval ? "approval_required" : "queued",
    input: payload,
    input_hash: hash,
    attempts: 0,
    requires_approval: requiresApproval,
    diagnostics: [],
    queued_at: queuedAt,
    updated_at: queuedAt,
  }
  if (duplicateCount(harness, input.capability_name, hash) >= harness.policy.doom_loop_threshold) {
    call.status = "skipped"
    call.diagnostics.push("Doom-loop detector skipped repeated capability call with identical input.")
    harness.events.push({ type: "harness.doom_loop_detected", call_id: call.call_id, created_at: queuedAt })
  }
  harness.calls.push(call)
  harness.events.push({
    type: call.status === "approval_required" ? "harness.approval_required" : "harness.call_queued",
    call_id: call.call_id,
    created_at: queuedAt,
  })
  return call
}

export function approveHarnessCall(harness: PaperHarnessState, callID: string, input?: { updated_at?: string }) {
  const call = harness.calls.find((item) => item.call_id === callID)
  if (!call) throw new Error(`Harness call not found: ${callID}`)
  if (call.status !== "approval_required") return call
  call.status = "queued"
  call.updated_at = now(input?.updated_at)
  call.diagnostics.push("Approval granted.")
  harness.events.push({ type: "harness.call_queued", call_id: call.call_id, created_at: call.updated_at })
  return call
}

export function nextHarnessCall(
  harness: PaperHarnessState,
  registry: ResearchCapabilityRegistry = createResearchCapabilityRegistry(builtinResearchCapabilities()),
): PaperHarnessNextDecision {
  const running = harness.calls.filter((call) => call.status === "running").length
  if (running >= harness.policy.max_parallel) {
    return { action: "wait_for_capacity", message: `Harness parallel cap reached: ${running}/${harness.policy.max_parallel}.` }
  }
  const approval = harness.calls.find((call) => call.status === "approval_required")
  if (approval) return { action: "wait_for_approval", call: approval, message: "Harness is waiting for approval." }
  const call = harness.calls
    .filter((item) => item.status === "queued")
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))[0]
  if (!call) return { action: "idle", message: "No queued harness calls." }
  try {
    call.trace = registry.traceFor(call.capability_name, { run_id: call.run_id, stage: call.stage })
  } catch (error) {
    call.status = "blocked"
    call.diagnostics.push(error instanceof Error ? error.message : String(error))
    call.updated_at = now()
    return { action: "blocked", call, message: call.diagnostics.at(-1) ?? "Capability is blocked." }
  }
  call.status = "running"
  call.attempts += 1
  call.updated_at = now()
  harness.events.push({ type: "harness.call_started", call_id: call.call_id, created_at: call.updated_at })
  return { action: "run", call, message: "Harness call started." }
}

export function completeHarnessCall(
  harness: PaperHarnessState,
  callID: string,
  input?: { diagnostics?: string[]; updated_at?: string },
) {
  const call = harness.calls.find((item) => item.call_id === callID)
  if (!call) throw new Error(`Harness call not found: ${callID}`)
  call.status = "succeeded"
  call.diagnostics.push(...(input?.diagnostics ?? []))
  call.updated_at = now(input?.updated_at)
  harness.events.push({ type: "harness.call_completed", call_id: call.call_id, created_at: call.updated_at })
  return call
}

export function failHarnessCall(
  harness: PaperHarnessState,
  callID: string,
  diagnostic: string,
  input?: { updated_at?: string },
) {
  const call = harness.calls.find((item) => item.call_id === callID)
  if (!call) throw new Error(`Harness call not found: ${callID}`)
  call.diagnostics.push(diagnostic)
  call.updated_at = now(input?.updated_at)
  if (call.attempts <= harness.policy.max_retries) {
    call.status = "queued"
    harness.events.push({ type: "harness.call_failed", call_id: call.call_id, created_at: call.updated_at, detail: diagnostic })
    return call
  }
  call.status = "failed"
  harness.events.push({ type: "harness.call_failed", call_id: call.call_id, created_at: call.updated_at, detail: diagnostic })
  return call
}
