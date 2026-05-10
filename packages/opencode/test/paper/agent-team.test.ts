import { describe, expect, test } from "bun:test"
import {
  createAgentRoleRouter,
  createPaperAgentTree,
  spawnPaperSubagent,
} from "../../src/paper/agents"
import {
  assignTeamTasks,
  completeTeamTask,
  createPaperAgentTeam,
  decideTeamHarnessAction,
  enqueueTeamTask,
  mergeTeamEvidence,
  postTeamMessage,
  summarizePaperAgentTeam,
} from "../../src/paper/agent-team"

describe("PaperRun Agent Team Fabric", () => {
  test("creates a team from recursive agents with role, model, permission, skill, MCP, and memory metadata", () => {
    const tree = createPaperAgentTree({
      run_id: "run-team",
      budget_tier: "standard",
      router: createAgentRoleRouter({
        default_model: "deepseek/deepseek-v4-pro",
        roles: { code_analyst: "openai/gpt-5.2" },
      }),
      root_role: "planner",
      capabilities: ["read", "grep", "paper.memory"],
      permissions: {
        allowed_tool_names: ["read", "grep", "paper.memory", "exa"],
        allowed_paths: ["packages/opencode/src/paper"],
        data_egress: "allow_summaries",
        network_allowed: true,
      },
    })
    const codeAgent = spawnPaperSubagent(tree, {
      parent_agent_id: tree.root_agent_id,
      role: "code_analyst",
      agent_id: "agent-code",
      capabilities: ["read", "grep", "paper.memory"],
      permissions: {
        allowed_tool_names: ["read", "shell"],
        allowed_paths: ["packages/opencode/src/paper", ".paper_fucker/local"],
        data_egress: "allow_authorized_paths",
        network_allowed: true,
      },
    })

    const team = createPaperAgentTeam({
      run_id: "run-team",
      tree,
      skills: ["code-understanding", "citation-check"],
      mcp_servers: ["exa"],
      memory_scope: "project",
      created_at: "2026-05-11T00:00:00.000Z",
    })

    expect(team.schema_version).toBe("PaperAgentTeam.v1")
    expect(team.policy.no_product_hard_limit).toBe(true)
    expect(team.policy.recursive_policy.depth_policy).toBe("unbounded")
    expect(team.members.map((member) => [member.agent_id, member.role, member.model_id])).toEqual([
      ["run-team:root", "team_lead", "deepseek-v4-pro"],
      ["agent-code", "code_teammate", "gpt-5.2"],
    ])
    expect(team.members.find((member) => member.agent_id === codeAgent.agent_id)?.permissions).toMatchObject({
      allowed_tool_names: ["read"],
      allowed_paths: ["packages/opencode/src/paper"],
      data_egress: "allow_summaries",
      network_allowed: true,
    })
    expect(team.members[0]!.skills).toEqual(["code-understanding", "citation-check"])
    expect(team.members[0]!.mcp_servers).toEqual(["exa"])
    expect(team.members[0]!.memory_scope).toBe("project")
  })

  test("runs task board, mailbox, harness decisions, and source-bound evidence merge", () => {
    const tree = createPaperAgentTree({
      run_id: "run-team",
      budget_tier: "quick",
      router: createAgentRoleRouter({ default_model: "deepseek/deepseek-v4-pro" }),
      root_role: "planner",
      capabilities: ["read"],
    })
    spawnPaperSubagent(tree, {
      parent_agent_id: tree.root_agent_id,
      role: "code_analyst",
      agent_id: "agent-code",
      capabilities: ["read", "grep"],
    })
    const team = createPaperAgentTeam({ run_id: "run-team", tree })

    enqueueTeamTask(team, {
      task_id: "task-map-code",
      title: "Map codebase",
      stage: "code_analysis",
      description: "Build a source-range-grounded code map.",
      priority: "high",
      required_capabilities: ["grep"],
      input_artifacts: ["brief"],
      created_at: "2026-05-11T00:00:00.000Z",
    })
    expect(decideTeamHarnessAction(team)).toMatchObject({ action: "continue" })

    const assigned = assignTeamTasks(team, { updated_at: "2026-05-11T00:00:01.000Z" })
    expect(assigned).toHaveLength(1)
    expect(assigned[0]!.assigned_member_id).toBeTruthy()

    postTeamMessage(team, {
      message_id: "msg-code-risk",
      kind: "risk",
      from_member_id: assigned[0]!.assigned_member_id!,
      related_task_id: "task-map-code",
      text: "Benchmark entrypoint is missing.",
      created_at: "2026-05-11T00:00:02.000Z",
    })
    completeTeamTask(team, "task-map-code", {
      output_artifacts: ["artifact-code-map"],
      updated_at: "2026-05-11T00:00:03.000Z",
    })

    const merge = mergeTeamEvidence(team, [
      {
        artifact_id: "artifact-code-map",
        originating_agent_id: "agent-code",
        originating_task_id: "task-map-code",
        source_ranges: ["packages/opencode/src/paper/run.ts:1-40"],
      },
      {
        artifact_id: "artifact-unsupported",
        originating_agent_id: "agent-code",
        originating_task_id: "task-map-code",
      },
      {
        artifact_id: "artifact-outsider",
        originating_agent_id: "agent-outsider",
        tool_traces: ["trace-1"],
      },
    ])

    expect(merge.accepted.map((item) => item.artifact_id)).toEqual(["artifact-code-map"])
    expect(merge.rejected.map((item) => item.reason)).toEqual([
      "missing source range or tool trace",
      "originating agent is not in the PaperRun team",
    ])
    expect(summarizePaperAgentTeam(team)).toMatchObject({
      total_members: 2,
      completed_tasks: 1,
      unread_messages: 1,
      evidence_backed_artifacts: 1,
    })
    expect(decideTeamHarnessAction(team, { repeated_low_value_expansion: true })).toMatchObject({
      action: "skip_expansion",
      reason: "repeated_low_value_expansion",
    })
    expect(decideTeamHarnessAction(team, { approval_required: true })).toMatchObject({
      action: "pause_for_approval",
      reason: "approval_required",
    })
    expect(decideTeamHarnessAction(team, { spent_usd: 1 })).toMatchObject({
      action: "stop",
      reason: "cost_cap",
    })
  })
})
