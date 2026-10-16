import { describe, expect, test } from "bun:test"
import { budgetTierPolicy } from "../../src/paper/budget"
import { evaluateDataEgressPolicy } from "../../src/paper/data-egress"
import {
  blockPaperAgent,
  completePaperAgent,
  createAgentRoleRouter,
  createPaperAgentTree,
  evaluateAgentExpansion,
  narrowChildAgentPermissions,
  spawnPaperSubagent,
  traceArtifactProvenance,
} from "../../src/paper/agents"

describe("paper multi-model agent orchestration", () => {
  test("keeps budget tiers for resource caps without fixed depth limits", () => {
    expect(budgetTierPolicy("quick")).toMatchObject({
      max_depth: null,
      depth_policy: "unbounded",
      max_parallel: 2,
      cost_cap_usd: 1,
    })
    expect(budgetTierPolicy("submission")).toMatchObject({
      max_depth: null,
      depth_policy: "unbounded",
      max_parallel: 8,
      cost_cap_usd: 50,
    })
  })

  test("blocks private data egress for secrets, ignored paths, binaries, and unapproved files", () => {
    const result = evaluateDataEgressPolicy({
      policy: {
        mode: "private_first",
        allowed_paths: ["src/paper"],
        denied_patterns: ["**/.env*", "**/secrets/**"],
        external_model_full_text: false,
      },
      candidates: ["src/paper/run.ts", "src/paper/.env", "src/paper/secrets/key.txt", "src/paper/model.bin"],
    })

    expect(result.allowed).toEqual(["src/paper/run.ts"])
    expect(result.blocked.map((item) => item.path)).toEqual([
      "src/paper/.env",
      "src/paper/secrets/key.txt",
      "src/paper/model.bin",
    ])
    expect(result.audit_events).toHaveLength(4)
  })

  test("creates recursive agents with different models, children, events, and provenance", () => {
    const router = createAgentRoleRouter({
      default_model: "deepseek/deepseek-v4-pro",
      roles: {
        reviewer: "openai/gpt-5.2",
      },
      subagents: {
        citation_verifier: "anthropic/claude-sonnet-4-5",
      },
    })
    const tree = createPaperAgentTree({
      run_id: "run-agent",
      budget_tier: "quick",
      router,
      root_role: "planner",
      permissions: {
        allowed_tool_names: ["paper.claim-ledger", "exa", "read"],
        allowed_paths: ["packages/opencode/src/paper"],
        data_egress: "allow_summaries",
        network_allowed: true,
      },
    })
    const reviewer = spawnPaperSubagent(tree, {
      parent_agent_id: tree.root_agent_id,
      role: "reviewer",
      agent_id: "agent-reviewer",
      capabilities: ["paper.claim-ledger"],
      permissions: {
        allowed_tool_names: ["paper.claim-ledger", "shell"],
        allowed_paths: ["packages/opencode/src/paper", "secrets"],
        data_egress: "allow_authorized_paths",
        network_allowed: true,
      },
    })
    const verifier = spawnPaperSubagent(tree, {
      parent_agent_id: reviewer.agent_id,
      role: "reviewer",
      subagent_role: "citation_verifier",
      agent_id: "agent-citation",
      capabilities: ["exa"],
      input_artifacts: ["artifact-draft"],
    })
    const specialist = spawnPaperSubagent(tree, {
      parent_agent_id: verifier.agent_id,
      role: "reviewer",
      subagent_role: "citation_verifier",
      agent_id: "agent-citation-specialist",
      capabilities: ["exa"],
    })
    completePaperAgent(tree, specialist.agent_id, ["artifact-specialist-review"])

    expect(tree.nodes.map((node) => [node.agent_id, node.parent_agent_id, node.depth])).toEqual([
      ["run-agent:root", undefined, 0],
      ["agent-reviewer", "run-agent:root", 1],
      ["agent-citation", "agent-reviewer", 2],
      ["agent-citation-specialist", "agent-citation", 3],
    ])
    expect(tree.max_depth).toBeNull()
    expect(tree.recursive_policy.depth_policy).toBe("unbounded")
    expect(tree.nodes[0]!.model_id).toBe("deepseek-v4-pro")
    expect(reviewer.model_id).toBe("gpt-5.2")
    expect(verifier.model_id).toBe("claude-sonnet-4-5")
    expect(specialist.model_id).toBe("claude-sonnet-4-5")
    expect(tree.nodes[0]!.children).toEqual(["agent-reviewer"])
    expect(reviewer.permissions).toMatchObject({
      allowed_tool_names: ["paper.claim-ledger"],
      allowed_paths: ["packages/opencode/src/paper"],
      data_egress: "allow_summaries",
      network_allowed: true,
    })
    expect(tree.events.map((event) => event.type)).toContain("agent.completed")
    expect(traceArtifactProvenance(tree, "artifact-review", verifier)).toMatchObject({
      artifact_id: "artifact-review",
      agent_id: "agent-citation",
      parent_agent_id: "agent-reviewer",
      depth: 2,
      input_artifacts: ["artifact-draft"],
    })
  })

  test("blocks recursive expansion through runtime stop conditions instead of depth", () => {
    const tree = createPaperAgentTree({
      run_id: "run-agent",
      budget_tier: "quick",
      router: createAgentRoleRouter({ default_model: "deepseek/deepseek-v4-pro" }),
      root_role: "planner",
    })
    const child = spawnPaperSubagent(tree, {
      parent_agent_id: tree.root_agent_id,
      role: "writer",
      agent_id: "agent-child",
    })
    const grandchild = spawnPaperSubagent(tree, {
      parent_agent_id: child.agent_id,
      role: "reviewer",
      agent_id: "agent-grandchild",
    })

    expect(grandchild.depth).toBe(2)
    expect(
      evaluateAgentExpansion(tree, {
        parent_agent_id: grandchild.agent_id,
        agent_id: "agent-too-expensive",
        runtime: { spent_usd: 1 },
      }),
    ).toMatchObject({ allowed: false, reason: "cost_cap" })
    expect(() =>
      spawnPaperSubagent(tree, {
        parent_agent_id: grandchild.agent_id,
        role: "reviewer",
        agent_id: tree.root_agent_id,
      }),
    ).toThrow("duplicate or cyclic")

    expect(() =>
      spawnPaperSubagent(tree, {
        parent_agent_id: grandchild.agent_id,
        role: "reviewer",
        agent_id: "agent-blocked",
        runtime: { data_egress_blocked: true },
      }),
    ).toThrow("Data egress policy blocks")
    expect(tree.events.at(-1)).toMatchObject({
      type: "agent.expansion_skipped",
      agent_id: "agent-blocked",
      reason: "data_egress_block",
    })
    expect(blockPaperAgent(tree, grandchild.agent_id, "authenticity_gate_block")).toMatchObject({ status: "blocked" })
  })

  test("narrows child permissions and never widens parent authority", () => {
    expect(
      narrowChildAgentPermissions(
        {
          allowed_tool_names: ["read", "grep"],
          allowed_paths: ["packages/opencode"],
          data_egress: "allow_summaries",
          network_allowed: true,
        },
        {
          allowed_tool_names: ["read", "shell"],
          allowed_paths: ["packages/opencode", ".papercode/local"],
          data_egress: "allow_authorized_paths",
          network_allowed: true,
        },
      ),
    ).toEqual({
      allowed_tool_names: ["read"],
      allowed_paths: ["packages/opencode"],
      data_egress: "allow_summaries",
      network_allowed: true,
    })
  })
})
