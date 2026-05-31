import { mkdir, readFile, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import type { ModelDiscoveryResult } from "./model-discovery"
import {
  PAPER_MODEL_ROLES,
  parsePaperModelId,
  type PaperModelRef,
  type PaperModelRole,
} from "./model-router"

export type PaperModelCapability =
  | "general"
  | "planning"
  | "literature"
  | "code"
  | "experiment"
  | "writing"
  | "review"
  | "citation"
  | "summarization"
  | "tool_use"

export type PaperModelSmokeStatus = "untested" | "passed" | "failed"

export interface PaperModelCandidate {
  provider_id: string
  provider_name?: string
  model_id: string
  model_ref: string
  display_name: string
  owned_by?: string
  source: "paper_builtin" | "openai_compatible" | "manual"
  capabilities: PaperModelCapability[]
  cost_hint: "unknown" | "cheap" | "standard" | "expensive"
  context_hint: "unknown" | "short" | "standard" | "long"
  smoke_status: PaperModelSmokeStatus
  allowed: boolean
  discovered_at: string
  last_smoke_at?: string
}

export type PaperProviderRegistrationKind =
  | "builtin"
  | "chatgpt_subscription"
  | "copilot_subscription"
  | "openai_compatible"
  | "manual"
export type PaperProviderRegistrationStatus = "registered" | "disabled" | "needs_auth"

export interface PaperProviderRegistration {
  provider_id: string
  provider_name?: string
  kind: PaperProviderRegistrationKind
  status: PaperProviderRegistrationStatus
  model_count: number
  allowed_count: number
  last_refreshed_at?: string
  diagnostics?: string[]
}

export type PaperStageModelPolicyMode = "auto" | "dynamic" | "forced"

export interface PaperStageModelPolicy {
  role: PaperModelRole
  mode: PaperStageModelPolicyMode
  model_ref?: string
}

export interface PaperModelInventory {
  schema_version: "PaperModelInventory.v1"
  updated_at: string
  decision_model?: string
  backup_decision_model?: string
  allowlist: string[]
  role_overrides: Partial<Record<PaperModelRole, string>>
  provider_registrations: Record<string, PaperProviderRegistration>
  stage_model_policies: Partial<Record<PaperModelRole, PaperStageModelPolicy>>
  candidates: PaperModelCandidate[]
}

export type ModelRoutingSource = "user_override" | "decision_model" | "default" | "blocked"

export interface ModelRoutingDecision {
  schema_version: "ModelRoutingDecision.v1"
  decision_id: string
  created_at: string
  role: PaperModelRole
  stage?: string
  source: ModelRoutingSource
  decision_model?: string
  selected_model?: string
  provider_id?: string
  model_id?: string
  candidate_count: number
  allowed_models: string[]
  reason: string
  diagnostics: string[]
}

export interface ModelRoutingInput {
  role: PaperModelRole
  stage?: string
  difficulty?: "low" | "medium" | "high"
  task_scale?: "small" | "medium" | "large"
  budget_tier?: "quick" | "standard" | "deep" | "submission" | "custom"
  required_capabilities?: PaperModelCapability[]
  forced_model?: string
}

export interface PaperModelInventoryStorageOptions {
  home?: string
}

export type BuiltinProviderCatalog = Record<
  string,
  {
    id?: string
    name?: string
    models?: Record<string, { id?: string; name?: string } | unknown>
  }
>

function now() {
  return new Date().toISOString()
}

function paperHome(home = os.homedir()) {
  return path.join(home, ".paper_fucker")
}

export function modelInventoryPath(home = os.homedir()) {
  return path.join(paperHome(home), "model-inventory.json")
}

export function modelRef(input: PaperModelRef) {
  return `${input.provider_id}/${input.model_id}`
}

function emptyInventory(): PaperModelInventory {
  return {
    schema_version: "PaperModelInventory.v1",
    updated_at: now(),
    allowlist: [],
    role_overrides: {},
    provider_registrations: {},
    stage_model_policies: {},
    candidates: [],
  }
}

function providerKindFromSource(source: PaperModelCandidate["source"]): PaperProviderRegistrationKind {
  if (source === "paper_builtin") return "builtin"
  if (source === "openai_compatible") return "openai_compatible"
  return "manual"
}

type PaperProviderCandidateSource = { provider_id: string; source?: PaperModelCandidate["source"] }

function hasCustomCandidate(providerID: string, candidates: ReadonlyArray<PaperProviderCandidateSource>) {
  return candidates.some(
    (candidate) =>
      candidate.provider_id === providerID &&
      (candidate.source === "openai_compatible" || candidate.source === "manual"),
  )
}

export function isConfiguredPaperProviderRegistration(
  providerID: string,
  registration: PaperProviderRegistration,
  candidates: ReadonlyArray<PaperProviderCandidateSource>,
  connectedProviderIDs: ReadonlySet<string> = new Set<string>(),
) {
  if (registration.status !== "registered") return false
  if (registration.kind === "openai_compatible") return true
  if (registration.kind === "manual") return hasCustomCandidate(providerID, candidates)
  if (providerID === "openai" || providerID === "github-copilot") return connectedProviderIDs.has(providerID)
  return false
}

function isSupportedUserProviderRegistration(
  providerID: string,
  registration: PaperProviderRegistration,
  candidates: ReadonlyArray<PaperProviderCandidateSource>,
) {
  if (registration.kind === "openai_compatible") return true
  if (registration.kind === "manual") return hasCustomCandidate(providerID, candidates)
  return providerID === "openai" || providerID === "github-copilot"
}

function summarizeProviderRegistration(
  providerID: string,
  candidates: PaperModelCandidate[],
  allowlist: Set<string>,
  previous?: PaperProviderRegistration,
): PaperProviderRegistration {
  const providerCandidates = candidates.filter((candidate) => candidate.provider_id === providerID)
  const first = providerCandidates[0]
  return {
    provider_id: providerID,
    provider_name: previous?.provider_name ?? first?.provider_name ?? providerID,
    kind: previous?.kind ?? (first ? providerKindFromSource(first.source) : "manual"),
    status: previous?.status ?? "registered",
    model_count: providerCandidates.length,
    allowed_count: providerCandidates.filter((candidate) => allowlist.has(candidate.model_ref)).length,
    last_refreshed_at: previous?.last_refreshed_at ?? first?.discovered_at,
    diagnostics: previous?.diagnostics,
  }
}

function normalizeInventory(input: unknown): PaperModelInventory {
  if (!input || typeof input !== "object") return emptyInventory()
  const record = input as Partial<PaperModelInventory>
  const candidates = Array.isArray(record.candidates) ? record.candidates.filter(isCandidate) : []
  const allowlist = Array.isArray(record.allowlist)
    ? record.allowlist.filter((item): item is string => typeof item === "string" && item.includes("/"))
    : []
  const role_overrides =
    record.role_overrides && typeof record.role_overrides === "object"
      ? Object.fromEntries(
          Object.entries(record.role_overrides).filter(([role, value]) => {
            return PAPER_MODEL_ROLES.includes(role as PaperModelRole) && typeof value === "string"
          }),
        )
      : {}
  const stage_model_policies =
    record.stage_model_policies && typeof record.stage_model_policies === "object"
      ? Object.fromEntries(
          Object.entries(record.stage_model_policies).filter(([role, value]) => {
            if (!PAPER_MODEL_ROLES.includes(role as PaperModelRole)) return false
            if (!value || typeof value !== "object") return false
            const mode = (value as Partial<PaperStageModelPolicy>).mode
            return mode === "auto" || mode === "dynamic" || mode === "forced"
          }),
        )
      : {}
  const mergedCandidates = candidates
  const mergedAllowlist = new Set(allowlist)
  const decisionModel =
    typeof record.decision_model === "string" && record.decision_model.includes("/")
      ? record.decision_model
      : undefined
  const validDecisionModel = decisionModel && mergedAllowlist.has(decisionModel) ? decisionModel : undefined
  const backupDecisionModel =
    typeof record.backup_decision_model === "string" && mergedAllowlist.has(record.backup_decision_model)
      ? record.backup_decision_model
      : undefined
  const rawRegistrations =
    record.provider_registrations && typeof record.provider_registrations === "object"
      ? (Object.fromEntries(
          Object.entries(record.provider_registrations as Record<string, PaperProviderRegistration>).filter(
            ([providerID, registration]) => isSupportedUserProviderRegistration(providerID, registration, mergedCandidates),
          ),
        ) as Record<string, PaperProviderRegistration>)
      : {}
  const providerRegistrations = Object.fromEntries(
    Object.keys(rawRegistrations)
      .sort()
      .map((providerID) => [
        providerID,
        summarizeProviderRegistration(providerID, mergedCandidates, mergedAllowlist, rawRegistrations[providerID]),
      ]),
  )
  return {
    schema_version: "PaperModelInventory.v1",
    updated_at: typeof record.updated_at === "string" ? record.updated_at : now(),
    decision_model: validDecisionModel,
    backup_decision_model: backupDecisionModel,
    allowlist: Array.from(mergedAllowlist),
    role_overrides,
    provider_registrations: providerRegistrations,
    stage_model_policies: stage_model_policies as Partial<Record<PaperModelRole, PaperStageModelPolicy>>,
    candidates: mergedCandidates.map((candidate) => ({
      ...candidate,
      allowed: mergedAllowlist.has(candidate.model_ref),
    })),
  }
}

function isCandidate(input: unknown): input is PaperModelCandidate {
  if (!input || typeof input !== "object") return false
  const record = input as Partial<PaperModelCandidate>
  return typeof record.provider_id === "string" && typeof record.model_id === "string" && typeof record.model_ref === "string"
}

export async function loadPaperModelInventory(
  options: PaperModelInventoryStorageOptions = {},
): Promise<PaperModelInventory> {
  const file = modelInventoryPath(options.home)
  const text = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (!text) return emptyInventory()
  return normalizeInventory(JSON.parse(text))
}

export async function savePaperModelInventory(
  inventory: PaperModelInventory,
  options: PaperModelInventoryStorageOptions = {},
) {
  const file = modelInventoryPath(options.home)
  await mkdir(path.dirname(file), { recursive: true })
  const normalized = normalizeInventory({
    ...inventory,
    updated_at: now(),
  })
  await writeFile(file, `${JSON.stringify(normalized, null, 2)}\n`, "utf8")
  return normalized
}

function inferCapabilities(modelID: string): PaperModelCapability[] {
  const id = modelID.toLowerCase()
  const capabilities = new Set<PaperModelCapability>(["general", "tool_use"])
  if (id.includes("code") || id.includes("coder")) capabilities.add("code")
  if (id.includes("reason") || id.includes("r1") || id.includes("pro") || id.includes("opus")) {
    capabilities.add("planning")
    capabilities.add("review")
  }
  if (id.includes("mini") || id.includes("small") || id.includes("nano") || id.includes("lite")) {
    capabilities.add("summarization")
  }
  if (id.includes("writer") || id.includes("chat") || id.includes("gpt") || id.includes("claude") || id.includes("deepseek")) {
    capabilities.add("writing")
  }
  if (id.includes("cite") || id.includes("citation")) capabilities.add("citation")
  return Array.from(capabilities)
}

function costHint(modelID: string): PaperModelCandidate["cost_hint"] {
  const id = modelID.toLowerCase()
  if (id.includes("nano") || id.includes("mini") || id.includes("small") || id.includes("lite")) return "cheap"
  if (id.includes("opus") || id.includes("pro") || id.includes("large")) return "expensive"
  return "unknown"
}

function contextHint(modelID: string): PaperModelCandidate["context_hint"] {
  const id = modelID.toLowerCase()
  if (id.includes("128k") || id.includes("200k") || id.includes("long") || id.includes("pro")) return "long"
  if (id.includes("mini") || id.includes("small")) return "standard"
  return "unknown"
}

export function candidatesFromDiscovery(discovery: ModelDiscoveryResult): PaperModelCandidate[] {
  const timestamp = now()
  return discovery.models.map((model) => {
    const ref = `${discovery.provider_id}/${model.id}`
    return {
      provider_id: discovery.provider_id,
      provider_name: discovery.provider_name,
      model_id: model.id,
      model_ref: ref,
      display_name: model.name ?? model.id,
      owned_by: model.owned_by,
      source: "openai_compatible",
      capabilities: inferCapabilities(model.id),
      cost_hint: costHint(model.id),
      context_hint: contextHint(model.id),
      smoke_status: "untested",
      allowed: false,
      discovered_at: timestamp,
    }
  })
}

export function candidatesFromBuiltinProviders(providers: BuiltinProviderCatalog): PaperModelCandidate[] {
  const timestamp = now()
  return Object.entries(providers).flatMap(([providerID, provider]) => {
    return Object.entries(provider.models ?? {}).map(([modelID, rawModel]) => {
      const model = rawModel && typeof rawModel === "object" ? (rawModel as { id?: string; name?: string }) : {}
      const normalizedModelID = model.id ?? modelID
      const ref = `${providerID}/${normalizedModelID}`
      return {
        provider_id: providerID,
        provider_name: provider.name,
        model_id: normalizedModelID,
        model_ref: ref,
        display_name: model.name ?? normalizedModelID,
        source: "paper_builtin" as const,
        capabilities: inferCapabilities(normalizedModelID),
        cost_hint: costHint(normalizedModelID),
        context_hint: contextHint(normalizedModelID),
        smoke_status: "untested" as const,
        allowed: false,
        discovered_at: timestamp,
      }
    })
  })
}

export function mergeModelCandidates(
  inventory: PaperModelInventory,
  candidates: PaperModelCandidate[],
): PaperModelInventory {
  const allowlist = new Set(inventory.allowlist)
  const registeredProviderIDs = new Set(Object.keys(inventory.provider_registrations))
  const incomingProviderIDs = new Set(candidates.map((candidate) => candidate.provider_id))
  const next = new Map(
    inventory.candidates
      .filter((candidate) => registeredProviderIDs.has(candidate.provider_id) || incomingProviderIDs.has(candidate.provider_id))
      .map((candidate) => [candidate.model_ref, candidate]),
  )
  for (const candidate of candidates) {
    const previous = next.get(candidate.model_ref)
    next.set(candidate.model_ref, {
      ...candidate,
      allowed: allowlist.has(candidate.model_ref),
      smoke_status: previous?.smoke_status ?? candidate.smoke_status,
      last_smoke_at: previous?.last_smoke_at,
      discovered_at: previous?.discovered_at ?? candidate.discovered_at,
    })
  }
  return {
    ...inventory,
    allowlist: Array.from(allowlist),
    candidates: Array.from(next.values()).map((candidate) => ({
      ...candidate,
      allowed: allowlist.has(candidate.model_ref),
    })),
    provider_registrations: Object.fromEntries(
      Object.keys(inventory.provider_registrations)
        .sort()
        .map((providerID) => [
          providerID,
          summarizeProviderRegistration(providerID, Array.from(next.values()), allowlist, inventory.provider_registrations[providerID]),
        ]),
    ),
  }
}

export async function upsertDiscoveredModels(
  discovery: ModelDiscoveryResult,
  options: PaperModelInventoryStorageOptions & { allow?: string[]; decision_model?: string } = {},
) {
  const inventory = await loadPaperModelInventory(options)
  const allowlist = new Set(inventory.allowlist)
  for (const ref of options.allow ?? []) allowlist.add(ref)
  const decisionModel = options.decision_model ?? inventory.decision_model
  if (decisionModel) allowlist.add(decisionModel)
  const nextCandidates = new Map(inventory.candidates.map((candidate) => [candidate.model_ref, candidate]))
  for (const candidate of candidatesFromDiscovery(discovery)) {
    const previous = nextCandidates.get(candidate.model_ref)
    nextCandidates.set(candidate.model_ref, {
      ...candidate,
      allowed: allowlist.has(candidate.model_ref),
      smoke_status: previous?.smoke_status ?? candidate.smoke_status,
      last_smoke_at: previous?.last_smoke_at,
    })
  }
  return savePaperModelInventory(
    {
      ...inventory,
      decision_model: decisionModel,
      allowlist: Array.from(allowlist),
      provider_registrations: {
        ...inventory.provider_registrations,
        [discovery.provider_id]: {
          provider_id: discovery.provider_id,
          provider_name: discovery.provider_name,
          kind: "openai_compatible",
          status: "registered",
          model_count: discovery.models.length,
          allowed_count: Array.from(allowlist).filter((ref) => ref.startsWith(`${discovery.provider_id}/`)).length,
          last_refreshed_at: now(),
          diagnostics: discovery.diagnostics.map((item) => `${item.level}: ${item.message}`),
        },
      },
      candidates: Array.from(nextCandidates.values()).map((candidate) => ({
        ...candidate,
        allowed: allowlist.has(candidate.model_ref),
      })),
    },
    options,
  )
}

export async function updatePaperModelAllowlist(
  modelRefs: string[],
  options: PaperModelInventoryStorageOptions & {
    decision_model?: string
    backup_decision_model?: string
    role_overrides?: Partial<Record<PaperModelRole, string>>
    provider_registrations?: Record<string, PaperProviderRegistration>
    stage_model_policies?: Partial<Record<PaperModelRole, PaperStageModelPolicy>>
    candidates?: PaperModelCandidate[]
  } = {},
) {
  const stored = await loadPaperModelInventory(options)
  const inventory = options.candidates?.length ? mergeModelCandidates(stored, options.candidates) : stored
  const explicitRegistrations = options.provider_registrations !== undefined
  const providerRegistrations = explicitRegistrations
    ? { ...(options.provider_registrations ?? {}) }
    : inventory.provider_registrations
  const registeredProviderIDs = new Set(
    Object.values(providerRegistrations)
      .filter((registration) => registration.status === "registered")
      .map((registration) => registration.provider_id),
  )
  const isRegisteredRef = (ref: string) => !explicitRegistrations || registeredProviderIDs.has(ref.split("/")[0] ?? "")
  const scopedCandidates = explicitRegistrations
    ? inventory.candidates.filter((candidate) => registeredProviderIDs.has(candidate.provider_id))
    : inventory.candidates
  const allowlist = new Set(modelRefs.filter((ref) => ref.includes("/") && isRegisteredRef(ref)))
  const decisionModelCandidate =
    options.decision_model ??
    (inventory.decision_model && modelRefs.includes(inventory.decision_model) ? inventory.decision_model : undefined)
  const decisionModel = decisionModelCandidate && isRegisteredRef(decisionModelCandidate) ? decisionModelCandidate : undefined
  if (decisionModel) allowlist.add(decisionModel)
  const backupDecisionModelCandidate =
    options.backup_decision_model ??
    (inventory.backup_decision_model && modelRefs.includes(inventory.backup_decision_model)
      ? inventory.backup_decision_model
      : undefined)
  const backupDecisionModel =
    backupDecisionModelCandidate &&
    backupDecisionModelCandidate !== decisionModel &&
    isRegisteredRef(backupDecisionModelCandidate)
      ? backupDecisionModelCandidate
      : undefined
  if (backupDecisionModel) allowlist.add(backupDecisionModel)
  const roleOverrides = options.role_overrides ?? inventory.role_overrides
  for (const value of Object.values(roleOverrides)) {
    if (value && isRegisteredRef(value)) allowlist.add(value)
  }
  const rawStageModelPolicies = options.stage_model_policies ?? inventory.stage_model_policies
  const stageModelPolicies = Object.fromEntries(
    Object.entries(rawStageModelPolicies).map(([role, policy]) => {
      if (policy?.mode === "forced" && policy.model_ref && !isRegisteredRef(policy.model_ref)) {
        return [role, { role: role as PaperModelRole, mode: "auto" satisfies PaperStageModelPolicyMode }]
      }
      return [role, policy]
    }),
  ) as Partial<Record<PaperModelRole, PaperStageModelPolicy>>
  for (const policy of Object.values(stageModelPolicies)) {
    if (policy?.mode === "forced" && policy.model_ref && isRegisteredRef(policy.model_ref)) allowlist.add(policy.model_ref)
  }
  return savePaperModelInventory(
    {
      ...inventory,
      decision_model: decisionModel,
      backup_decision_model: backupDecisionModel,
      allowlist: Array.from(allowlist),
      role_overrides: roleOverrides,
      provider_registrations: providerRegistrations,
      stage_model_policies: stageModelPolicies,
      candidates: scopedCandidates.map((candidate) => ({
        ...candidate,
        allowed: allowlist.has(candidate.model_ref),
      })),
    },
    options,
  )
}

function scoreCandidate(candidate: PaperModelCandidate, input: ModelRoutingInput) {
  let score = 0
  const required = input.required_capabilities ?? []
  for (const capability of required) {
    if (candidate.capabilities.includes(capability)) score += 8
  }
  const roleCapability: Partial<Record<PaperModelRole, PaperModelCapability>> = {
    planner: "planning",
    literature_researcher: "literature",
    code_analyst: "code",
    experiment_designer: "experiment",
    writer: "writing",
    reviewer: "review",
    citation_checker: "citation",
    cheap_summarizer: "summarization",
  }
  const roleMatch = roleCapability[input.role]
  if (roleMatch && candidate.capabilities.includes(roleMatch)) score += 6
  if (input.task_scale === "large" || input.difficulty === "high") {
    if (candidate.context_hint === "long") score += 4
    if (candidate.cost_hint === "cheap") score -= 2
  }
  if (input.budget_tier === "quick" && candidate.cost_hint === "cheap") score += 4
  if (input.budget_tier === "quick" && candidate.cost_hint === "expensive") score -= 5
  if (candidate.smoke_status === "passed") score += 3
  if (candidate.smoke_status === "failed") score -= 20
  return score
}

export function routePaperModel(inventory: PaperModelInventory, input: ModelRoutingInput): ModelRoutingDecision {
  const createdAt = now()
  const allowedModels = inventory.allowlist.filter((ref) => ref.includes("/"))
  const allowedCandidates = inventory.candidates.filter((candidate) => allowedModels.includes(candidate.model_ref))
  const policy = inventory.stage_model_policies[input.role]
  const forced =
    input.forced_model ??
    (policy?.mode === "forced" ? policy.model_ref : undefined) ??
    inventory.role_overrides[input.role]
  const decisionModel =
    inventory.decision_model && allowedModels.includes(inventory.decision_model)
      ? inventory.decision_model
      : inventory.backup_decision_model && allowedModels.includes(inventory.backup_decision_model)
        ? inventory.backup_decision_model
        : inventory.decision_model

  const block = (reason: string, diagnostics: string[]): ModelRoutingDecision => ({
    schema_version: "ModelRoutingDecision.v1",
    decision_id: `${createdAt}:${input.role}:blocked`,
    created_at: createdAt,
    role: input.role,
    stage: input.stage,
    source: "blocked",
    decision_model: decisionModel,
    candidate_count: allowedCandidates.length,
    allowed_models: allowedModels,
    reason,
    diagnostics,
  })

  if (forced) {
    if (!allowedModels.includes(forced)) {
      return block(`用户强制模型 ${forced} 不在允许列表内。`, ["forced_model_not_allowed"])
    }
    const parsed = parsePaperModelId(forced, input.role)
    return {
      schema_version: "ModelRoutingDecision.v1",
      decision_id: `${createdAt}:${input.role}:forced`,
      created_at: createdAt,
      role: input.role,
      stage: input.stage,
      source: "user_override",
      decision_model: decisionModel,
      selected_model: forced,
      provider_id: parsed.provider_id,
      model_id: parsed.model_id,
      candidate_count: allowedCandidates.length,
      allowed_models: allowedModels,
      reason: `用户强制 ${input.role} 使用 ${forced}。`,
      diagnostics: [],
    }
  }

  if (allowedModels.length === 0) {
    return block("没有可用模型。请先在模型工作台勾选允许模型。", ["model_allowlist_empty"])
  }

  if (!decisionModel) {
    return block("未配置主决策模型。请先在模型工作台选择主决策模型。", ["decision_model_missing"])
  }
  if (!allowedModels.includes(decisionModel)) {
    return block("主决策模型不在允许模型列表内。请在模型工作台重新选择。", ["decision_model_not_allowed"])
  }

  if (allowedCandidates.length === 0) {
    const parsed = parsePaperModelId(decisionModel, input.role)
    return {
      schema_version: "ModelRoutingDecision.v1",
      decision_id: `${createdAt}:${input.role}:decision`,
      created_at: createdAt,
      role: input.role,
      stage: input.stage,
      source: "decision_model",
      decision_model: decisionModel,
      selected_model: decisionModel,
      provider_id: parsed.provider_id,
      model_id: parsed.model_id,
      candidate_count: 0,
      allowed_models: allowedModels,
      reason: "主决策模型已配置，但候选模型元数据暂不可用；按历史可用模型配置继续。",
      diagnostics: ["model_candidate_metadata_missing"],
    }
  }

  const chosen = [...allowedCandidates].sort((left, right) => scoreCandidate(right, input) - scoreCandidate(left, input))[0]
  if (!chosen) return block("模型候选池为空。", ["model_inventory_empty"])
  return {
    schema_version: "ModelRoutingDecision.v1",
    decision_id: `${createdAt}:${input.role}:decision`,
    created_at: createdAt,
    role: input.role,
    stage: input.stage,
    source: "decision_model",
    decision_model: decisionModel,
    selected_model: chosen.model_ref,
    provider_id: chosen.provider_id,
    model_id: chosen.model_id,
    candidate_count: allowedCandidates.length,
    allowed_models: allowedModels,
    reason: `主决策模型 ${decisionModel} 在允许模型池中为 ${input.role} 选择 ${chosen.model_ref}。`,
    diagnostics: [],
  }
}

export function modelRolesFromInventory(inventory: PaperModelInventory): Partial<Record<PaperModelRole, PaperModelRef>> {
  const result: Partial<Record<PaperModelRole, PaperModelRef>> = {}
  for (const role of PAPER_MODEL_ROLES) {
    const decision = routePaperModel(inventory, { role })
    if (!decision.selected_model) continue
    result[role] = parsePaperModelId(decision.selected_model, role)
  }
  return result
}
