import { minimatch } from "minimatch"

export interface DataEgressPolicy {
  mode: "private_first" | "allow_summaries" | "allow_authorized_paths"
  allowed_paths: string[]
  denied_patterns: string[]
  external_model_full_text: boolean
}

export interface DataEgressCandidateEvaluation {
  path: string
  decision: "allowed" | "blocked"
  reason: "allowed_path" | "not_authorized" | "denied_pattern" | "secret" | "large_binary"
}

export interface DataEgressEvaluationResult {
  allowed: string[]
  blocked: DataEgressCandidateEvaluation[]
  audit_events: DataEgressCandidateEvaluation[]
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/")
}

function isSecretPath(value: string) {
  const lower = value.toLowerCase()
  return lower.includes(".env") || lower.includes("secret") || lower.includes("token") || lower.includes("key.")
}

function isBinaryPath(value: string) {
  return /\.(bin|exe|dll|so|dylib|zip|tar|gz|7z|png|jpg|jpeg|pdf|parquet|pt|pth|onnx)$/i.test(value)
}

function matchesAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => minimatch(value, pattern, { dot: true, nocase: true }))
}

function isAllowed(value: string, allowedPaths: string[]) {
  if (allowedPaths.length === 0) return false
  return allowedPaths.some(
    (allowed) => value === normalizePath(allowed) || value.startsWith(`${normalizePath(allowed)}/`),
  )
}

export function evaluateDataEgressPolicy(input: {
  policy: DataEgressPolicy
  candidates: string[]
}): DataEgressEvaluationResult {
  const allowed: string[] = []
  const blocked: DataEgressCandidateEvaluation[] = []
  const audit_events: DataEgressCandidateEvaluation[] = []

  for (const raw of input.candidates) {
    const path = normalizePath(raw)
    let event: DataEgressCandidateEvaluation
    if (matchesAny(path, input.policy.denied_patterns)) {
      event = { path, decision: "blocked", reason: "denied_pattern" }
    } else if (isSecretPath(path)) {
      event = { path, decision: "blocked", reason: "secret" }
    } else if (isBinaryPath(path)) {
      event = { path, decision: "blocked", reason: "large_binary" }
    } else if (input.policy.mode === "private_first" && !isAllowed(path, input.policy.allowed_paths)) {
      event = { path, decision: "blocked", reason: "not_authorized" }
    } else {
      event = { path, decision: "allowed", reason: "allowed_path" }
      allowed.push(path)
    }
    if (event.decision === "blocked") blocked.push(event)
    audit_events.push(event)
  }

  return { allowed, blocked, audit_events }
}
