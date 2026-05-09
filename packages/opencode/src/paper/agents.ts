import { budgetTierPolicy, type BudgetTier } from "./budget"
import { resolveModelRoleAssignment, type ModelRoleAssignment, type ResolvedModelRoleAssignment } from "./model-roles"
import type { PaperModelRole } from "./model-router"

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
  status: "planned" | "running" | "succeeded" | "blocked" | "failed"
}

export interface PaperAgentTree {
  schema_version: "AgentTree.v1"
  run_id: string
  root_agent_id: string
  max_depth: number
  max_parallel: number
  router: AgentRoleRouter
  nodes: PaperAgentNode[]
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
    status: "planned",
  }
}

export function createPaperAgentTree(input: {
  run_id: string
  budget_tier: BudgetTier
  router: AgentRoleRouter
  root_role: PaperModelRole
  capabilities?: string[]
}): PaperAgentTree {
  const policy = budgetTierPolicy(input.budget_tier)
  const root = nodeFromResolved({
    agent_id: `${input.run_id}:root`,
    depth: 0,
    role: input.root_role,
    resolved: input.router.resolve(input.root_role),
    budget_tier: input.budget_tier,
    capabilities: input.capabilities,
  })
  return {
    schema_version: "AgentTree.v1",
    run_id: input.run_id,
    root_agent_id: root.agent_id,
    max_depth: policy.max_depth,
    max_parallel: policy.max_parallel,
    router: input.router,
    nodes: [root],
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
  },
) {
  const parent = tree.nodes.find((node) => node.agent_id === input.parent_agent_id)
  if (!parent) throw new Error(`Parent agent not found: ${input.parent_agent_id}`)
  const depth = parent.depth + 1
  if (depth > tree.max_depth) throw new Error(`Agent ${input.agent_id} exceeds max depth ${tree.max_depth}`)
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
  })
  tree.nodes.push(node)
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
