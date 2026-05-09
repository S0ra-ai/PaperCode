import { describe, expect, test } from "bun:test"
import { budgetTierPolicy } from "../../src/paper/budget"
import { evaluateDataEgressPolicy } from "../../src/paper/data-egress"
import {
  createAgentRoleRouter,
  createPaperAgentTree,
  spawnPaperSubagent,
  traceArtifactProvenance,
} from "../../src/paper/agents"

describe("paper multi-model agent orchestration", () => {
  test("enforces budget tier depth, parallelism, and cost caps", () => {
    expect(budgetTierPolicy("quick")).toMatchObject({ max_depth: 1, max_parallel: 2, cost_cap_usd: 1 })
    expect(budgetTierPolicy("submission")).toMatchObject({ max_depth: 4, max_parallel: 8, cost_cap_usd: 50 })
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

  test("creates nested agents with different models and provenance", () => {
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
      budget_tier: "deep",
      router,
      root_role: "planner",
    })
    const reviewer = spawnPaperSubagent(tree, {
      parent_agent_id: tree.root_agent_id,
      role: "reviewer",
      agent_id: "agent-reviewer",
      capabilities: ["paper.claim-ledger"],
    })
    const verifier = spawnPaperSubagent(tree, {
      parent_agent_id: reviewer.agent_id,
      role: "reviewer",
      subagent_role: "citation_verifier",
      agent_id: "agent-citation",
      capabilities: ["exa"],
      input_artifacts: ["artifact-draft"],
    })

    expect(tree.nodes.map((node) => [node.agent_id, node.parent_agent_id, node.depth])).toEqual([
      ["run-agent:root", undefined, 0],
      ["agent-reviewer", "run-agent:root", 1],
      ["agent-citation", "agent-reviewer", 2],
    ])
    expect(tree.nodes[0]!.model_id).toBe("deepseek-v4-pro")
    expect(reviewer.model_id).toBe("gpt-5.2")
    expect(verifier.model_id).toBe("claude-sonnet-4-5")
    expect(traceArtifactProvenance(tree, "artifact-review", verifier)).toMatchObject({
      artifact_id: "artifact-review",
      agent_id: "agent-citation",
      parent_agent_id: "agent-reviewer",
      depth: 2,
      input_artifacts: ["artifact-draft"],
    })
  })

  test("blocks subagents beyond tier depth", () => {
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

    expect(() =>
      spawnPaperSubagent(tree, {
        parent_agent_id: child.agent_id,
        role: "reviewer",
        agent_id: "agent-grandchild",
      }),
    ).toThrow("exceeds max depth")
  })
})
