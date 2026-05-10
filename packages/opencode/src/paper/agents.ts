import { budgetTierPolicy, type BudgetTier } from "./budget"
import { resolveModelRoleAssignment, type ModelRoleAssignment, type ResolvedModelRoleAssignment } from "./model-roles"
import type { PaperModelRole } from "./model-router"

export type RecursiveAgentStopCondition =
  | "cost_cap"
  | "time_cap"
  | "concurrency_cap"
  | "context_token_cap"
  | "user_cancelled"
  | "coverage_complete"
  | "repeated_low_value_expansion"
  | "permission_block"
  | "data_egress_block"
  | "license_block"
  | "authenticity_gate_block"
  | "cycle_prevention"

export interface AgentPermissionEnvelope {
  allowed_tool_names: string[]
  allowed_paths: string[]
  data_egress: "private_first" | "allow_summaries" | "allow_authorized_paths"
  network_allowed: boolean
}

export interface RecursiveAgentPolicy {
  schema_version: "RecursiveAgentPolicy.v1"
  depth_policy: "unbounded"
  stop_conditions: RecursiveAgentStopCondition[]
  cost_cap_usd: number
  max_parallel: number
  context_token_cap?: number
  time_cap_ms?: number
}

export interface AgentExpansionRuntimeState {
  spent_usd?: number
  elapsed_ms?: number
  active_agents?: number
  context_tokens?: number
  user_cancelled?: boolean
  coverage_complete?: boolean
  repeated_low_value_expansion?: boolean
  permission_blocked?: boolean
  data_egress_blocked?: boolean
  license_blocked?: boolean
  authenticity_blocked?: boolean
}

export interface AgentExpansionDecision {
  allowed: boolean
  reason?: RecursiveAgentStopCondition
  message: string
  parent_agent_id: string
  requested_agent_id: string
  requested_depth: number
}

export interface PaperAgentNode {
  agent_id: string
  parent_agent_id?: string
  depth: number
  role: PaperModelRole
  subagent_role?: string
  provider_id: string
  model_id: string
  model_source: ResolvedModelRoleAssignment["source"]
  capabilities: string[]
  budget: {
    tier: BudgetTier
    usd_cap: number
  }
  input_artifacts: string[]
  output_artifacts: string[]
  tool_traces: string[]
  children: string[]
  permissions: AgentPermissionEnvelope
  status: "planned" | "running" | "succeeded" | "blocked" | "failed"
}

export interface PaperAgentTree {
  schema_version: "AgentTree.v1"
  run_id: string
  root_agent_id: string
  max_depth: null
  max_parallel: number
  recursive_policy: RecursiveAgentPolicy
  router: AgentRoleRouter
  nodes: PaperAgentNode[]
  events: Array<{
    type: "agent.spawned" | "agent.completed" | "agent.blocked" | "agent.expansion_skipped"
    agent_id: string
    parent_agent_id?: string
    reason?: RecursiveAgentStopCondition
  }>
}

export interface PaperArtifactProvenance {
  artifact_id: string
  agent_id: string
  parent_agent_id?: string
  depth: number
  provider_id: string
  model_id: string
  input_artifacts: string[]
  tool_traces: string[]
}

export function createAgentRoleRouter(assignment: ModelRoleAssignment) {
  return {
    assignment,
    resolve(role: PaperModelRole, subagentRole?: string) {
      return resolveModelRoleAssignment(assignment, role, subagentRole)
    },
  }
}

export type AgentRoleRouter = ReturnType<typeof createAgentRoleRouter>

function nodeFromResolved(input: {
  agent_id: string
  parent_agent_id?: string
  depth: number
  role: PaperModelRole
  subagent_role?: string
  resolved: ResolvedModelRoleAssignment
  budget_tier: BudgetTier
  capabilities?: string[]
  input_artifacts?: string[]
  permissions?: Partial<AgentPermissionEnvelope>
}): PaperAgentNode {
  const policy = budgetTierPolicy(input.budget_tier)
  return {
    agent_id: input.agent_id,
    parent_agent_id: input.parent_agent_id,
    depth: input.depth,
    role: input.role,
    subagent_role: input.subagent_role,
    provider_id: input.resolved.provider_id,
    model_id: input.resolved.model_id,
    model_source: input.resolved.source,
    capabilities: input.capabilities ?? [],
    budget: {
      tier: input.budget_tier,
      usd_cap: policy.cost_cap_usd,
    },
    input_artifacts: input.input_artifacts ?? [],
    output_artifacts: [],
    tool_traces: [],
    children: [],
    permissions: normalizePermissions(input.permissions),
    status: "planned",
  }
}

function normalizePermissions(input?: Partial<AgentPermissionEnvelope>): AgentPermissionEnvelope {
  return {
    allowed_tool_names: input?.allowed_tool_names ?? [],
    allowed_paths: input?.allowed_paths ?? [],
    data_egress: input?.data_egress ?? "private_first",
    network_allowed: input?.network_allowed ?? false,
  }
}

function dataEgressRank(mode: AgentPermissionEnvelope["data_egress"]) {
  if (mode === "private_first") return 0
  if (mode === "allow_summaries") return 1
  return 2
}

function stricterDataEgress(
  parent: AgentPermissionEnvelope["data_egress"],
  requested: AgentPermissionEnvelope["data_egress"],
) {
  return dataEgressRank(requested) < dataEgressRank(parent) ? requested : parent
}

function intersectIfParentConstrained(parent: string[], requested?: string[]) {
  if (!requested) return [...parent]
  if (parent.length === 0) return [...requested]
  const parentSet = new Set(parent)
  return requested.filter((item) => parentSet.has(item))
}

export function narrowChildAgentPermissions(
  parent: AgentPermissionEnvelope,
  requested?: Partial<AgentPermissionEnvelope>,
): AgentPermissionEnvelope {
  const normalized = normalizePermissions(requested)
  return {
    allowed_tool_names: intersectIfParentConstrained(parent.allowed_tool_names, requested?.allowed_tool_names),
    allowed_paths: intersectIfParentConstrained(parent.allowed_paths, requested?.allowed_paths),
    data_egress: stricterDataEgress(parent.data_egress, normalized.data_egress),
    network_allowed: parent.network_allowed && normalized.network_allowed,
  }
}

export function recursiveAgentPolicyForBudget(
  tier: BudgetTier,
  custom?: Partial<RecursiveAgentPolicy>,
): RecursiveAgentPolicy {
  const policy = budgetTierPolicy(tier)
  return {
    schema_version: "RecursiveAgentPolicy.v1",
    depth_policy: "unbounded",
    stop_conditions: [
      "cost_cap",
      "time_cap",
      "concurrency_cap",
      "context_token_cap",
      "user_cancelled",
      "coverage_complete",
      "repeated_low_value_expansion",
      "permission_block",
      "data_egress_block",
      "license_block",
      "authenticity_gate_block",
      "cycle_prevention",
    ],
    cost_cap_usd: policy.cost_cap_usd,
    max_parallel: policy.max_parallel,
    ...custom,
  }
}

export function createPaperAgentTree(input: {
  run_id: string
  budget_tier: BudgetTier
  router: AgentRoleRouter
  root_role: PaperModelRole
  capabilities?: string[]
  policy?: Partial<RecursiveAgentPolicy>
  permissions?: Partial<AgentPermissionEnvelope>
}): PaperAgentTree {
  const policy = budgetTierPolicy(input.budget_tier)
  const recursivePolicy = recursiveAgentPolicyForBudget(input.budget_tier, input.policy)
  const root = nodeFromResolved({
    agent_id: `${input.run_id}:root`,
    depth: 0,
    role: input.root_role,
    resolved: input.router.resolve(input.root_role),
    budget_tier: input.budget_tier,
    capabilities: input.capabilities,
    permissions: input.permissions,
  })
  return {
    schema_version: "AgentTree.v1",
    run_id: input.run_id,
    root_agent_id: root.agent_id,
    max_depth: policy.max_depth,
    max_parallel: policy.max_parallel,
    recursive_policy: recursivePolicy,
    router: input.router,
    nodes: [root],
    events: [{ type: "agent.spawned", agent_id: root.agent_id }],
  }
}

function hasAncestor(tree: PaperAgentTree, parentAgentID: string, requestedAgentID: string) {
  let current = tree.nodes.find((node) => node.agent_id === parentAgentID)
  while (current) {
    if (current.agent_id === requestedAgentID) return true
    current = current.parent_agent_id
      ? tree.nodes.find((node) => node.agent_id === current?.parent_agent_id)
      : undefined
  }
  return false
}

export function evaluateAgentExpansion(
  tree: PaperAgentTree,
  input: {
    parent_agent_id: string
    agent_id: string
    runtime?: AgentExpansionRuntimeState
    policy?: Partial<RecursiveAgentPolicy>
  },
): AgentExpansionDecision {
  const parent = tree.nodes.find((node) => node.agent_id === input.parent_agent_id)
  if (!parent) throw new Error(`Parent agent not found: ${input.parent_agent_id}`)
  const requestedDepth = parent.depth + 1
  const policy = { ...tree.recursive_policy, ...input.policy }
  const runtime = input.runtime ?? {}
  const blocked = (reason: RecursiveAgentStopCondition, message: string): AgentExpansionDecision => ({
    allowed: false,
    reason,
    message,
    parent_agent_id: parent.agent_id,
    requested_agent_id: input.agent_id,
    requested_depth: requestedDepth,
  })

  if (tree.nodes.some((node) => node.agent_id === input.agent_id) || hasAncestor(tree, parent.agent_id, input.agent_id)) {
    return blocked("cycle_prevention", `Agent expansion would create a duplicate or cyclic agent id: ${input.agent_id}`)
  }
  if (runtime.user_cancelled) return blocked("user_cancelled", "User cancelled recursive agent expansion.")
  if (runtime.coverage_complete) return blocked("coverage_complete", "Coverage is already complete.")
  if (runtime.repeated_low_value_expansion) {
    return blocked("repeated_low_value_expansion", "Expansion skipped after repeated low-value branches.")
  }
  if (runtime.permission_blocked) return blocked("permission_block", "Parent permissions block child agent expansion.")
  if (runtime.data_egress_blocked) return blocked("data_egress_block", "Data egress policy blocks child agent expansion.")
  if (runtime.license_blocked) return blocked("license_block", "License/source gate blocks child agent expansion.")
  if (runtime.authenticity_blocked) {
    return blocked("authenticity_gate_block", "Authenticity gate blocks child agent expansion.")
  }
  if (typeof runtime.spent_usd === "number" && policy.cost_cap_usd > 0 && runtime.spent_usd >= policy.cost_cap_usd) {
    return blocked("cost_cap", `Cost cap reached: ${runtime.spent_usd} >= ${policy.cost_cap_usd}.`)
  }
  if (typeof runtime.active_agents === "number" && runtime.active_agents >= policy.max_parallel) {
    return blocked("concurrency_cap", `Parallel agent cap reached: ${runtime.active_agents} >= ${policy.max_parallel}.`)
  }
  if (
    typeof runtime.context_tokens === "number" &&
    typeof policy.context_token_cap === "number" &&
    runtime.context_tokens >= policy.context_token_cap
  ) {
    return blocked("context_token_cap", `Context token cap reached: ${runtime.context_tokens}.`)
  }
  if (typeof runtime.elapsed_ms === "number" && typeof policy.time_cap_ms === "number" && runtime.elapsed_ms >= policy.time_cap_ms) {
    return blocked("time_cap", `Time cap reached: ${runtime.elapsed_ms}ms.`)
  }

  return {
    allowed: true,
    message: "Recursive expansion allowed by budget, permission, and gate policy.",
    parent_agent_id: parent.agent_id,
    requested_agent_id: input.agent_id,
    requested_depth: requestedDepth,
  }
}

export function spawnPaperSubagent(
  tree: PaperAgentTree,
  input: {
    parent_agent_id: string
    role: PaperModelRole
    subagent_role?: string
    agent_id: string
    capabilities?: string[]
    input_artifacts?: string[]
    permissions?: Partial<AgentPermissionEnvelope>
    runtime?: AgentExpansionRuntimeState
    policy?: Partial<RecursiveAgentPolicy>
  },
) {
  const parent = tree.nodes.find((node) => node.agent_id === input.parent_agent_id)
  if (!parent) throw new Error(`Parent agent not found: ${input.parent_agent_id}`)
  const decision = evaluateAgentExpansion(tree, input)
  if (!decision.allowed) {
    tree.events.push({
      type: "agent.expansion_skipped",
      agent_id: input.agent_id,
      parent_agent_id: parent.agent_id,
      reason: decision.reason,
    })
    throw new Error(decision.message)
  }
  const depth = decision.requested_depth
  const root = tree.nodes.find((node) => node.agent_id === tree.root_agent_id)
  if (!root) throw new Error(`Root agent not found: ${tree.root_agent_id}`)
  const budgetTier = root.budget.tier
  const node = nodeFromResolved({
    agent_id: input.agent_id,
    parent_agent_id: parent.agent_id,
    depth,
    role: input.role,
    subagent_role: input.subagent_role,
    resolved: tree.router.resolve(input.role, input.subagent_role),
    budget_tier: budgetTier,
    capabilities: input.capabilities,
    input_artifacts: input.input_artifacts,
    permissions: narrowChildAgentPermissions(parent.permissions, input.permissions),
  })
  tree.nodes.push(node)
  parent.children.push(node.agent_id)
  tree.events.push({ type: "agent.spawned", agent_id: node.agent_id, parent_agent_id: parent.agent_id })
  return node
}

export function completePaperAgent(tree: PaperAgentTree, agentID: string, outputArtifacts: string[] = []) {
  const node = tree.nodes.find((item) => item.agent_id === agentID)
  if (!node) throw new Error(`Agent not found: ${agentID}`)
  node.status = "succeeded"
  node.output_artifacts.push(...outputArtifacts)
  tree.events.push({ type: "agent.completed", agent_id: node.agent_id, parent_agent_id: node.parent_agent_id })
  return node
}

export function blockPaperAgent(tree: PaperAgentTree, agentID: string, reason: RecursiveAgentStopCondition) {
  const node = tree.nodes.find((item) => item.agent_id === agentID)
  if (!node) throw new Error(`Agent not found: ${agentID}`)
  node.status = "blocked"
  tree.events.push({ type: "agent.blocked", agent_id: node.agent_id, parent_agent_id: node.parent_agent_id, reason })
  return node
}

export function traceArtifactProvenance(
  tree: PaperAgentTree,
  artifactID: string,
  agent: PaperAgentNode,
): PaperArtifactProvenance {
  if (!tree.nodes.some((node) => node.agent_id === agent.agent_id)) {
    throw new Error(`Agent does not belong to tree: ${agent.agent_id}`)
  }
  agent.output_artifacts.push(artifactID)
  return {
    artifact_id: artifactID,
    agent_id: agent.agent_id,
    parent_agent_id: agent.parent_agent_id,
    depth: agent.depth,
    provider_id: agent.provider_id,
    model_id: agent.model_id,
    input_artifacts: [...agent.input_artifacts],
    tool_traces: [...agent.tool_traces],
  }
}
