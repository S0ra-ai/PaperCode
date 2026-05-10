export type PaperMemoryScope = "local" | "project" | "user"
export type PaperMemorySharePolicy = "local_only" | "summarizable" | "exportable"

export interface PaperMemoryPolicy {
  schema_version: "PaperMemoryPolicy.v1"
  default_scope: PaperMemoryScope
  default_share_policy: PaperMemorySharePolicy
  denied_patterns: string[]
  max_entries: number
  redact_secrets: true
}

export interface PaperMemoryEntry {
  memory_id: string
  scope: PaperMemoryScope
  share_policy: PaperMemorySharePolicy
  kind:
    | "architecture"
    | "codepath"
    | "experiment"
    | "source"
    | "writing"
    | "review"
    | "decision"
    | "risk"
    | "agent_learning"
  title: string
  summary: string
  tags: string[]
  source_refs: Array<{
    path?: string
    source_range?: string
    artifact_id?: string
    tool_trace_id?: string
  }>
  provenance: {
    run_id: string
    agent_id?: string
    task_id?: string
    created_at: string
  }
  redacted: boolean
}

export interface PaperMemoryBank {
  schema_version: "MemoryBank.v1"
  run_id: string
  policy: PaperMemoryPolicy
  entries: PaperMemoryEntry[]
}

export interface PaperMemoryQuery {
  tags?: string[]
  kind?: PaperMemoryEntry["kind"]
  scope?: PaperMemoryScope
  share_policy?: PaperMemorySharePolicy
  path_prefix?: string
}

function now(input?: string) {
  return input ?? new Date().toISOString()
}

function normalizePath(value?: string) {
  return value?.replace(/\\/g, "/")
}

function globLike(pattern: string, value: string) {
  const normalized = normalizePath(value) ?? ""
  const clean = pattern.replace(/\\/g, "/")
  if (clean.includes("**/.env")) return normalized.includes("/.env") || normalized.endsWith(".env")
  if (clean.includes("**/.git/**")) return normalized.includes("/.git/")
  if (clean.includes("node_modules")) return normalized.includes("/node_modules/")
  if (clean.includes("*secret*")) return normalized.toLowerCase().includes("secret")
  return normalized.includes(clean.replace(/\*/g, ""))
}

function containsSecretText(value: string) {
  return /(sk-[A-Za-z0-9]{16,}|api[_-]?key\s*[:=]|token\s*[:=]|password\s*[:=])/i.test(value)
}

export function defaultPaperMemoryPolicy(input?: Partial<PaperMemoryPolicy>): PaperMemoryPolicy {
  return {
    schema_version: "PaperMemoryPolicy.v1",
    default_scope: input?.default_scope ?? "local",
    default_share_policy: input?.default_share_policy ?? "local_only",
    denied_patterns: input?.denied_patterns ?? ["**/.env*", "**/.git/**", "**/node_modules/**", "**/*secret*"],
    max_entries: input?.max_entries ?? 500,
    redact_secrets: true,
  }
}

export function createPaperMemoryBank(input: { run_id: string; policy?: Partial<PaperMemoryPolicy> }): PaperMemoryBank {
  return {
    schema_version: "MemoryBank.v1",
    run_id: input.run_id,
    policy: defaultPaperMemoryPolicy(input.policy),
    entries: [],
  }
}

function shouldRedact(bank: PaperMemoryBank, entry: Pick<PaperMemoryEntry, "summary" | "source_refs">) {
  if (containsSecretText(entry.summary)) return true
  return entry.source_refs.some((ref) => {
    const path = normalizePath(ref.path)
    return path ? bank.policy.denied_patterns.some((pattern) => globLike(pattern, path)) : false
  })
}

export function addPaperMemoryEntry(
  bank: PaperMemoryBank,
  input: Omit<PaperMemoryEntry, "scope" | "share_policy" | "redacted" | "provenance"> & {
    scope?: PaperMemoryScope
    share_policy?: PaperMemorySharePolicy
    run_id?: string
    agent_id?: string
    task_id?: string
    created_at?: string
  },
): PaperMemoryEntry {
  const entry: PaperMemoryEntry = {
    memory_id: input.memory_id,
    scope: input.scope ?? bank.policy.default_scope,
    share_policy: input.share_policy ?? bank.policy.default_share_policy,
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    tags: Array.from(new Set(input.tags)),
    source_refs: input.source_refs.map((ref) => ({ ...ref, path: normalizePath(ref.path) })),
    provenance: {
      run_id: input.run_id ?? bank.run_id,
      agent_id: input.agent_id,
      task_id: input.task_id,
      created_at: now(input.created_at),
    },
    redacted: false,
  }
  entry.redacted = shouldRedact(bank, entry)
  if (entry.redacted) {
    entry.share_policy = "local_only"
    entry.summary = "[redacted by MemoryBank policy]"
  }
  bank.entries.push(entry)
  if (bank.entries.length > bank.policy.max_entries) bank.entries.splice(0, bank.entries.length - bank.policy.max_entries)
  return entry
}

export function queryPaperMemory(bank: PaperMemoryBank, query: PaperMemoryQuery = {}) {
  return bank.entries.filter((entry) => {
    if (query.kind && entry.kind !== query.kind) return false
    if (query.scope && entry.scope !== query.scope) return false
    if (query.share_policy && entry.share_policy !== query.share_policy) return false
    if (query.tags?.length && !query.tags.every((tag) => entry.tags.includes(tag))) return false
    if (query.path_prefix) {
      const prefix = normalizePath(query.path_prefix) ?? query.path_prefix
      if (!entry.source_refs.some((ref) => normalizePath(ref.path)?.startsWith(prefix))) return false
    }
    return true
  })
}

export function memoryBankSummary(bank: PaperMemoryBank) {
  return {
    total_entries: bank.entries.length,
    local_only: bank.entries.filter((entry) => entry.share_policy === "local_only").length,
    summarizable: bank.entries.filter((entry) => entry.share_policy === "summarizable").length,
    exportable: bank.entries.filter((entry) => entry.share_policy === "exportable").length,
    redacted: bank.entries.filter((entry) => entry.redacted).length,
    scopes: {
      local: bank.entries.filter((entry) => entry.scope === "local").length,
      project: bank.entries.filter((entry) => entry.scope === "project").length,
      user: bank.entries.filter((entry) => entry.scope === "user").length,
    },
  }
}
