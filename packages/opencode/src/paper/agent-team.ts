import type { BudgetTier } from "./budget"
import {
  narrowChildAgentPermissions,
  recursiveAgentPolicyForBudget,
  type AgentExpansionRuntimeState,
  type AgentPermissionEnvelope,
  type PaperAgentNode,
  type RecursiveAgentStopCondition,
  type RecursiveAgentPolicy,
} from "./agents"
import type { PaperModelRole } from "./model-router"

export type PaperAgentTeamRole =
  | "team_lead"
  | "literature_teammate"
  | "code_teammate"
  | "experiment_teammate"
  | "writer_teammate"
  | "reviewer_teammate"
  | "crawler_teammate"
  | "memory_teammate"
  | "verifier_teammate"
  | "custom_teammate"

export type PaperAgentTeamTaskStatus = "queued" | "assigned" | "running" | "blocked" | "completed" | "skipped"

export type PaperAgentTeamMessageKind =
  | "handoff"
  | "question"
  | "answer"
  | "evidence"
  | "risk"
  | "approval_required"
  | "diagnostic"

export interface PaperAgentTeamPolicy {
  schema_version: "PaperAgentTeamPolicy.v1"
  no_product_hard_limit: true
  recursive_policy: RecursiveAgentPolicy
  evidence_merge_policy: "source_bound_only"
  approval_required_for: Array<
    | "network_crawl"
    | "external_model_full_text"
    | "hf_jobs"
    | "container_or_gpu"
    | "destructive_file_operation"
    | "license_conflict"
  >
}

export interface PaperAgentTeamMember {
  member_id: string
  agent_id: string
  parent_member_id?: string
  role: PaperAgentTeamRole
  model_role: PaperModelRole | string
  provider_id: string
  model_id: string
  capabilities: string[]
  skills: string[]
  mcp_servers: string[]
  memory_scope: "none" | "local" | "project" | "user"
  permissions: AgentPermissionEnvelope
  status: "planned" | "active" | "idle" | "blocked" | "done"
  current_task_ids: string[]
}

export interface PaperAgentTeamTask {
  task_id: string
  title: string
  stage: string
  description: string
  priority: "critical" | "high" | "medium" | "low"
  status: PaperAgentTeamTaskStatus
  required_capabilities: string[]
  assigned_member_id?: string
  parent_task_id?: string
  input_artifacts: string[]
  output_artifacts: string[]
  source_requirements: Array<"source_range" | "tool_trace" | "license_check" | "reproduction_trace">
  diagnostics: string[]
  created_at: string
  updated_at: string
}

export interface PaperAgentTeamMessage {
  message_id: string
  kind: PaperAgentTeamMessageKind
  from_member_id: string
  to_member_id?: string
  related_task_id?: string
  artifact_ids: string[]
  text: string
  created_at: string
  read_by: string[]
}

export interface PaperAgentTeamEvent {
  type:
    | "team.created"
    | "team.member_added"
    | "team.task_queued"
    | "team.task_assigned"
    | "team.task_completed"
    | "team.task_blocked"
    | "team.message_posted"
    | "team.evidence_merged"
    | "team.evidence_rejected"
    | "team.harness_decision"
  created_at: string
  member_id?: string
  task_id?: string
  message_id?: string
  detail?: string
}

export interface AgentTeamSourceNode {
  agent_id: string
  parent_agent_id?: string
  depth: number
  role: PaperModelRole | string
  subagent_role?: string
  provider_id: string
  model_id: string
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

export interface AgentTeamSourceTree {
  run_id?: string
  root_agent_id?: string
  nodes: AgentTeamSourceNode[]
}

export interface PaperAgentTeamCoverage {
  completed_tasks: number
  active_tasks: number
  blocked_tasks: number
  evidence_backed_artifacts: number
  rejected_evidence: number
  max_member_depth: number
}

export interface PaperAgentTeamState {
  schema_version: "PaperAgentTeam.v1"
  run_id: string
  team_id: string
  lead_member_id: string
  policy: PaperAgentTeamPolicy
  members: PaperAgentTeamMember[]
  tasks: PaperAgentTeamTask[]
  mailbox: PaperAgentTeamMessage[]
  coverage: PaperAgentTeamCoverage
  events: PaperAgentTeamEvent[]
}

export interface TeamHarnessDecision {
  action: "continue" | "pause_for_approval" | "skip_expansion" | "stop"
  reason?: RecursiveAgentStopCondition | "approval_required" | "no_runnable_tasks"
  message: string
}

export interface TeamEvidenceCandidate {
  artifact_id: string
  originating_agent_id: string
  originating_task_id?: string
  claim?: string
  source_ranges?: string[]
  tool_traces?: string[]
  diagnostics?: string[]
}

export interface TeamEvidenceMergeResult {
  accepted: TeamEvidenceCandidate[]
  rejected: Array<TeamEvidenceCandidate & { reason: string }>
}

function now(input?: string) {
  return input ?? new Date().toISOString()
}

function defaultTeamPolicy(tier: BudgetTier, input?: Partial<PaperAgentTeamPolicy>): PaperAgentTeamPolicy {
  return {
    schema_version: "PaperAgentTeamPolicy.v1",
    no_product_hard_limit: true,
    recursive_policy: input?.recursive_policy ?? recursiveAgentPolicyForBudget(tier),
    evidence_merge_policy: "source_bound_only",
    approval_required_for: input?.approval_required_for ?? [
      "network_crawl",
      "external_model_full_text",
      "hf_jobs",
      "container_or_gpu",
      "destructive_file_operation",
      "license_conflict",
    ],
  }
}

function roleFromAgent(node: AgentTeamSourceNode): PaperAgentTeamRole {
  const role = `${node.subagent_role ?? node.role}`.toLowerCase()
  if (node.depth === 0 || role.includes("root") || role.includes("planner")) return "team_lead"
  if (role.includes("literature")) return "literature_teammate"
  if (role.includes("code")) return "code_teammate"
  if (role.includes("experiment")) return "experiment_teammate"
  if (role.includes("writer")) return "writer_teammate"
  if (role.includes("review") || role.includes("citation") || role.includes("verifier")) return "reviewer_teammate"
  if (role.includes("crawl") || role.includes("web")) return "crawler_teammate"
  if (role.includes("memory")) return "memory_teammate"
  return "custom_teammate"
}

function memberStatusFromAgent(node: AgentTeamSourceNode): PaperAgentTeamMember["status"] {
  if (node.status === "running") return "active"
  if (node.status === "planned") return "planned"
  if (node.status === "blocked" || node.status === "failed") return "blocked"
  if (node.status === "succeeded") return "done"
  return "idle"
}

function memberFromAgentNode(
  node: AgentTeamSourceNode,
  input?: {
    parent_member_id?: string
    skills?: string[]
    mcp_servers?: string[]
    memory_scope?: PaperAgentTeamMember["memory_scope"]
  },
): PaperAgentTeamMember {
  return {
    member_id: `member:${node.agent_id}`,
    agent_id: node.agent_id,
    parent_member_id: input?.parent_member_id,
    role: roleFromAgent(node),
    model_role: node.subagent_role ?? node.role,
    provider_id: node.provider_id,
    model_id: node.model_id,
    capabilities: [...node.capabilities],
    skills: input?.skills ?? [],
    mcp_servers: input?.mcp_servers ?? [],
    memory_scope: input?.memory_scope ?? "local",
    permissions: node.permissions,
    status: memberStatusFromAgent(node),
    current_task_ids: [],
  }
}

function recalculateCoverage(team: PaperAgentTeamState): PaperAgentTeamCoverage {
  const memberDepth = (member: PaperAgentTeamMember) => {
    let depth = 0
    let current = member
    while (current.parent_member_id) {
      const parent = team.members.find((item) => item.member_id === current.parent_member_id)
      if (!parent) break
      depth += 1
      current = parent
    }
    return depth
  }
  return {
    completed_tasks: team.tasks.filter((task) => task.status === "completed").length,
    active_tasks: team.tasks.filter((task) => task.status === "assigned" || task.status === "running").length,
    blocked_tasks: team.tasks.filter((task) => task.status === "blocked").length,
    evidence_backed_artifacts: team.coverage.evidence_backed_artifacts,
    rejected_evidence: team.coverage.rejected_evidence,
    max_member_depth: team.members.reduce((max, member) => Math.max(max, memberDepth(member)), 0),
  }
}

export function createPaperAgentTeam(input: {
  run_id: string
  tree: AgentTeamSourceTree
  team_id?: string
  policy?: Partial<PaperAgentTeamPolicy>
  skills?: string[]
  mcp_servers?: string[]
  memory_scope?: PaperAgentTeamMember["memory_scope"]
  created_at?: string
}): PaperAgentTeamState {
  const root = input.tree.nodes.find((node) => node.agent_id === input.tree.root_agent_id) ?? input.tree.nodes[0]
  if (!root) throw new Error("Cannot create PaperAgentTeam without a root agent.")
  const members: PaperAgentTeamMember[] = []
  for (const node of input.tree.nodes) {
    const parentMemberID = node.parent_agent_id ? `member:${node.parent_agent_id}` : undefined
    members.push(
      memberFromAgentNode(node, {
        parent_member_id: parentMemberID,
        skills: input.skills,
        mcp_servers: input.mcp_servers,
        memory_scope: input.memory_scope,
      }),
    )
  }
  const team: PaperAgentTeamState = {
    schema_version: "PaperAgentTeam.v1",
    run_id: input.run_id,
    team_id: input.team_id ?? `${input.run_id}:team`,
    lead_member_id: `member:${root.agent_id}`,
    policy: defaultTeamPolicy(root.budget.tier, input.policy),
    members,
    tasks: [],
    mailbox: [],
    coverage: {
      completed_tasks: 0,
      active_tasks: 0,
      blocked_tasks: 0,
      evidence_backed_artifacts: 0,
      rejected_evidence: 0,
      max_member_depth: 0,
    },
    events: [
      {
        type: "team.created",
        created_at: now(input.created_at),
        member_id: `member:${root.agent_id}`,
      },
    ],
  }
  team.coverage = recalculateCoverage(team)
  return team
}

export function addPaperAgentTeamMember(
  team: PaperAgentTeamState,
  agent: PaperAgentNode,
  input?: {
    parent_member_id?: string
    skills?: string[]
    mcp_servers?: string[]
    memory_scope?: PaperAgentTeamMember["memory_scope"]
    created_at?: string
  },
) {
  if (team.members.some((member) => member.agent_id === agent.agent_id)) {
    throw new Error(`Agent team member already exists for agent: ${agent.agent_id}`)
  }
  const parent = input?.parent_member_id ? team.members.find((member) => member.member_id === input.parent_member_id) : undefined
  const member = memberFromAgentNode(agent, input)
  if (parent) member.permissions = narrowChildAgentPermissions(parent.permissions, agent.permissions)
  team.members.push(member)
  team.events.push({
    type: "team.member_added",
    created_at: now(input?.created_at),
    member_id: member.member_id,
  })
  team.coverage = recalculateCoverage(team)
  return member
}

export function enqueueTeamTask(
  team: PaperAgentTeamState,
  input: {
    task_id: string
    title: string
    stage: string
    description: string
    priority?: PaperAgentTeamTask["priority"]
    required_capabilities?: string[]
    parent_task_id?: string
    input_artifacts?: string[]
    source_requirements?: PaperAgentTeamTask["source_requirements"]
    created_at?: string
  },
): PaperAgentTeamTask {
  if (team.tasks.some((task) => task.task_id === input.task_id)) {
    throw new Error(`Agent team task already exists: ${input.task_id}`)
  }
  const createdAt = now(input.created_at)
  const task: PaperAgentTeamTask = {
    task_id: input.task_id,
    title: input.title,
    stage: input.stage,
    description: input.description,
    priority: input.priority ?? "medium",
    status: "queued",
    required_capabilities: input.required_capabilities ?? [],
    parent_task_id: input.parent_task_id,
    input_artifacts: input.input_artifacts ?? [],
    output_artifacts: [],
    source_requirements: input.source_requirements ?? ["source_range", "tool_trace"],
    diagnostics: [],
    created_at: createdAt,
    updated_at: createdAt,
  }
  team.tasks.push(task)
  team.events.push({ type: "team.task_queued", created_at: createdAt, task_id: task.task_id })
  team.coverage = recalculateCoverage(team)
  return task
}

function memberCanRunTask(member: PaperAgentTeamMember, task: PaperAgentTeamTask) {
  if (member.status === "blocked" || member.status === "done") return false
  if (task.required_capabilities.length === 0) return true
  return task.required_capabilities.every((capability) => member.capabilities.includes(capability))
}

function priorityRank(priority: PaperAgentTeamTask["priority"]) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[priority]
}

export function assignTeamTasks(team: PaperAgentTeamState, input?: { updated_at?: string }) {
  const assigned: PaperAgentTeamTask[] = []
  const queued = team.tasks
    .filter((task) => task.status === "queued")
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
  for (const task of queued) {
    const member = team.members
      .filter((candidate) => memberCanRunTask(candidate, task))
      .sort((a, b) => a.current_task_ids.length - b.current_task_ids.length)[0]
    if (!member) {
      task.diagnostics.push("No available team member satisfies required capabilities.")
      continue
    }
    task.assigned_member_id = member.member_id
    task.status = "assigned"
    task.updated_at = now(input?.updated_at)
    member.status = "active"
    member.current_task_ids.push(task.task_id)
    team.events.push({
      type: "team.task_assigned",
      created_at: task.updated_at,
      task_id: task.task_id,
      member_id: member.member_id,
    })
    assigned.push(task)
  }
  team.coverage = recalculateCoverage(team)
  return assigned
}

export function postTeamMessage(
  team: PaperAgentTeamState,
  input: {
    message_id: string
    kind: PaperAgentTeamMessageKind
    from_member_id: string
    to_member_id?: string
    related_task_id?: string
    artifact_ids?: string[]
    text: string
    created_at?: string
  },
) {
  if (!team.members.some((member) => member.member_id === input.from_member_id)) {
    throw new Error(`Message sender is not a team member: ${input.from_member_id}`)
  }
  if (input.to_member_id && !team.members.some((member) => member.member_id === input.to_member_id)) {
    throw new Error(`Message recipient is not a team member: ${input.to_member_id}`)
  }
  const message: PaperAgentTeamMessage = {
    message_id: input.message_id,
    kind: input.kind,
    from_member_id: input.from_member_id,
    to_member_id: input.to_member_id,
    related_task_id: input.related_task_id,
    artifact_ids: input.artifact_ids ?? [],
    text: input.text,
    created_at: now(input.created_at),
    read_by: [input.from_member_id],
  }
  team.mailbox.push(message)
  team.events.push({
    type: "team.message_posted",
    created_at: message.created_at,
    member_id: input.from_member_id,
    message_id: message.message_id,
  })
  return message
}

export function completeTeamTask(
  team: PaperAgentTeamState,
  taskID: string,
  input?: { output_artifacts?: string[]; diagnostics?: string[]; updated_at?: string },
) {
  const task = team.tasks.find((item) => item.task_id === taskID)
  if (!task) throw new Error(`Agent team task not found: ${taskID}`)
  task.status = "completed"
  task.output_artifacts.push(...(input?.output_artifacts ?? []))
  task.diagnostics.push(...(input?.diagnostics ?? []))
  task.updated_at = now(input?.updated_at)
  const member = task.assigned_member_id ? team.members.find((item) => item.member_id === task.assigned_member_id) : undefined
  if (member) {
    member.current_task_ids = member.current_task_ids.filter((item) => item !== task.task_id)
    member.status = member.current_task_ids.length > 0 ? "active" : "idle"
  }
  team.events.push({
    type: "team.task_completed",
    created_at: task.updated_at,
    task_id: task.task_id,
    member_id: task.assigned_member_id,
  })
  team.coverage = recalculateCoverage(team)
  return task
}

export function blockTeamTask(team: PaperAgentTeamState, taskID: string, diagnostic: string, input?: { updated_at?: string }) {
  const task = team.tasks.find((item) => item.task_id === taskID)
  if (!task) throw new Error(`Agent team task not found: ${taskID}`)
  task.status = "blocked"
  task.diagnostics.push(diagnostic)
  task.updated_at = now(input?.updated_at)
  team.events.push({
    type: "team.task_blocked",
    created_at: task.updated_at,
    task_id: task.task_id,
    member_id: task.assigned_member_id,
    detail: diagnostic,
  })
  team.coverage = recalculateCoverage(team)
  return task
}

export function decideTeamHarnessAction(
  team: PaperAgentTeamState,
  runtime: AgentExpansionRuntimeState & { approval_required?: boolean } = {},
): TeamHarnessDecision {
  if (runtime.user_cancelled) return { action: "stop", reason: "user_cancelled", message: "User cancelled Agent Team execution." }
  if (runtime.approval_required) {
    return { action: "pause_for_approval", reason: "approval_required", message: "Sensitive capability requires approval." }
  }
  if (runtime.repeated_low_value_expansion) {
    return {
      action: "skip_expansion",
      reason: "repeated_low_value_expansion",
      message: "Repeated low-value team expansion skipped by harness.",
    }
  }
  const policy = team.policy.recursive_policy
  if (typeof runtime.spent_usd === "number" && policy.cost_cap_usd > 0 && runtime.spent_usd >= policy.cost_cap_usd) {
    return { action: "stop", reason: "cost_cap", message: `Cost cap reached: ${runtime.spent_usd} >= ${policy.cost_cap_usd}.` }
  }
  if (typeof runtime.active_agents === "number" && runtime.active_agents >= policy.max_parallel) {
    return {
      action: "pause_for_approval",
      reason: "concurrency_cap",
      message: `Parallel team cap reached: ${runtime.active_agents} >= ${policy.max_parallel}.`,
    }
  }
  if (!team.tasks.some((task) => task.status === "queued" || task.status === "assigned" || task.status === "running")) {
    return { action: "pause_for_approval", reason: "no_runnable_tasks", message: "No runnable team tasks are available." }
  }
  return { action: "continue", message: "Agent Team harness can continue." }
}

export function mergeTeamEvidence(team: PaperAgentTeamState, candidates: TeamEvidenceCandidate[]): TeamEvidenceMergeResult {
  const result: TeamEvidenceMergeResult = { accepted: [], rejected: [] }
  for (const candidate of candidates) {
    const member = team.members.find((item) => item.agent_id === candidate.originating_agent_id)
    const hasSource = (candidate.source_ranges?.length ?? 0) > 0
    const hasTrace = (candidate.tool_traces?.length ?? 0) > 0
    const task = candidate.originating_task_id ? team.tasks.find((item) => item.task_id === candidate.originating_task_id) : undefined
    if (!member) {
      result.rejected.push({ ...candidate, reason: "originating agent is not in the PaperRun team" })
      continue
    }
    if (candidate.originating_task_id && task?.status !== "completed") {
      result.rejected.push({ ...candidate, reason: "originating task is not completed" })
      continue
    }
    if (!hasSource && !hasTrace) {
      result.rejected.push({ ...candidate, reason: "missing source range or tool trace" })
      continue
    }
    result.accepted.push(candidate)
  }
  team.coverage.evidence_backed_artifacts += result.accepted.length
  team.coverage.rejected_evidence += result.rejected.length
  for (const accepted of result.accepted) {
    team.events.push({
      type: "team.evidence_merged",
      created_at: now(),
      task_id: accepted.originating_task_id,
      detail: accepted.artifact_id,
    })
  }
  for (const rejected of result.rejected) {
    team.events.push({
      type: "team.evidence_rejected",
      created_at: now(),
      task_id: rejected.originating_task_id,
      detail: rejected.reason,
    })
  }
  team.coverage = recalculateCoverage(team)
  return result
}

export function summarizePaperAgentTeam(team?: PaperAgentTeamState) {
  if (!team) {
    return {
      total_members: 0,
      active_members: 0,
      queued_tasks: 0,
      active_tasks: 0,
      completed_tasks: 0,
      blocked_tasks: 0,
      unread_messages: 0,
      evidence_backed_artifacts: 0,
      rejected_evidence: 0,
      max_member_depth: 0,
      recent_tasks: [] as Array<{ id: string; title: string; status: PaperAgentTeamTaskStatus }>,
    }
  }
  return {
    total_members: team.members.length,
    active_members: team.members.filter((member) => member.status === "active" || member.status === "planned").length,
    queued_tasks: team.tasks.filter((task) => task.status === "queued").length,
    active_tasks: team.coverage.active_tasks,
    completed_tasks: team.coverage.completed_tasks,
    blocked_tasks: team.coverage.blocked_tasks,
    unread_messages: team.mailbox.filter((message) => !message.read_by.includes(team.lead_member_id)).length,
    evidence_backed_artifacts: team.coverage.evidence_backed_artifacts,
    rejected_evidence: team.coverage.rejected_evidence,
    max_member_depth: team.coverage.max_member_depth,
    recent_tasks: team.tasks.slice(-4).map((task) => ({ id: task.task_id, title: task.title, status: task.status })),
  }
}
