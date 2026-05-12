import { mkdir, readFile, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import type { ModelDiscoveryResult } from "./model-discovery"
import {
  PAPER_MODEL_ROLES,
  parseOpenCodeModelId,
  type OpenCodeModelRef,
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
  source: "opencode_builtin" | "openai_compatible" | "manual"
  capabilities: PaperModelCapability[]
  cost_hint: "unknown" | "cheap" | "standard" | "expensive"
  context_hint: "unknown" | "short" | "standard" | "long"
  smoke_status: PaperModelSmokeStatus
  allowed: boolean
  discovered_at: string
  last_smoke_at?: string
}

export interface PaperModelInventory {
  schema_version: "PaperModelInventory.v1"
  updated_at: string
  decision_model?: string
  allowlist: string[]
  role_overrides: Partial<Record<PaperModelRole, string>>
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

export function modelRef(input: OpenCodeModelRef) {
  return `${input.provider_id}/${input.model_id}`
}

function emptyInventory(): PaperModelInventory {
  return {
    schema_version: "PaperModelInventory.v1",
    updated_at: now(),
    allowlist: [],
    role_overrides: {},
    candidates: [],
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
  const mergedCandidates = candidates
  const mergedAllowlist = new Set(allowlist)
  const decisionModel =
    typeof record.decision_model === "string" && record.decision_model.includes("/")
      ? record.decision_model
      : undefined
  const validDecisionModel = decisionModel && mergedAllowlist.has(decisionModel) ? decisionModel : undefined
  return {
    schema_version: "PaperModelInventory.v1",
    updated_at: typeof record.updated_at === "string" ? record.updated_at : now(),
    decision_model: validDecisionModel,
    allowlist: Array.from(mergedAllowlist),
    role_overrides,
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
        source: "opencode_builtin" as const,
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
  const next = new Map(inventory.candidates.map((candidate) => [candidate.model_ref, candidate]))
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
    role_overrides?: Partial<Record<PaperModelRole, string>>
    candidates?: PaperModelCandidate[]
  } = {},
) {
  const stored = await loadPaperModelInventory(options)
  const inventory = options.candidates?.length ? mergeModelCandidates(stored, options.candidates) : stored
  const allowlist = new Set(modelRefs)
  const decisionModel =
    options.decision_model ??
    (inventory.decision_model && modelRefs.includes(inventory.decision_model) ? inventory.decision_model : undefined)
  if (decisionModel) allowlist.add(decisionModel)
  const roleOverrides = options.role_overrides ?? inventory.role_overrides
  for (const value of Object.values(roleOverrides)) {
    if (value) allowlist.add(value)
  }
  return savePaperModelInventory(
    {
      ...inventory,
      decision_model: decisionModel,
      allowlist: Array.from(allowlist),
      role_overrides: roleOverrides,
      candidates: inventory.candidates.map((candidate) => ({
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
  const forced = input.forced_model ?? inventory.role_overrides[input.role]
  const decisionModel = inventory.decision_model

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
    const parsed = parseOpenCodeModelId(forced, input.role)
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
    const parsed = parseOpenCodeModelId(decisionModel, input.role)
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

export function modelRolesFromInventory(inventory: PaperModelInventory): Partial<Record<PaperModelRole, OpenCodeModelRef>> {
  const result: Partial<Record<PaperModelRole, OpenCodeModelRef>> = {}
  for (const role of PAPER_MODEL_ROLES) {
    const decision = routePaperModel(inventory, { role })
    if (!decision.selected_model) continue
    result[role] = parseOpenCodeModelId(decision.selected_model, role)
  }
  return result
}
