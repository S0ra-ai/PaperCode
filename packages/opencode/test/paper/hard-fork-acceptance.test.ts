import { describe, expect, test } from "bun:test"
import { existsSync } from "fs"
import { mkdir, mkdtemp, rm } from "fs/promises"
import os from "os"
import path from "path"
import { setTimeout as sleep } from "node:timers/promises"
import {
  createAgentRoleRouter,
  createPaperAgentTree,
  evaluateDataEgressPolicy,
  exportPaperRun,
  createPaperRun,
  spawnPaperSubagent,
  updatePaperModelAllowlist,
  type PaperRunRuntimeOptions,
} from "@/paper"
import { parsePaperWorkbenchPrompt } from "../../src/cli/cmd/tui/routes/paper/workbench"

const repoRoot = path.resolve(import.meta.dir, "../../../..")
const now = "2026-05-10T00:00:00Z"

function runtimeOptions(workspace: string, home: string): PaperRunRuntimeOptions {
  let index = 0
  return {
    workspace,
    home,
    clock: () => new Date(now),
    idFactory: (kind) => `${kind}-${++index}`,
  }
}

async function clean(dir: string, attempts = 80): Promise<void> {
  Bun.gc(true)
  await sleep(150)
  return rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch((error) => {
    const retryable =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "EBUSY" || error.code === "EACCES" || error.code === "EPERM")
    if (!retryable) throw error
    if (attempts <= 1) {
      console.warn(`Could not remove temporary hard-fork acceptance directory ${dir}: ${String(error)}`)
      return
    }
    return clean(dir, attempts - 1)
  })
}

describe("hard fork acceptance", () => {
  test("keeps paper core inside opencode and removes the sidecar server package", () => {
    expect(existsSync(path.join(repoRoot, "packages", "opencode", "src", "paper"))).toBe(true)
    expect(existsSync(path.join(repoRoot, "packages", "opencode", "src", "server", "routes", "instance", "httpapi", "groups", "paper.ts"))).toBe(true)
    expect(existsSync(path.join(repoRoot, "packages", "server"))).toBe(false)
  })

  test("creates a submission PaperRun from TUI-style input with private-first defaults", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-hard-fork-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      await updatePaperModelAllowlist(["deepseek/deepseek-v4-pro", "openai/gpt-5.2"], {
        home,
        decision_model: "deepseek/deepseek-v4-pro",
      })

      const request = parsePaperWorkbenchPrompt(
        "--code packages/opencode --data data/results.csv --log logs/run.log --profile nature-paper --submission 上传代码生成投稿候选论文",
      )
      expect(request.quality_mode).toBe("submission_candidate")
      expect(request.budget_tier).toBe("submission")

      const run = await createPaperRun(
        {
          ...request,
          workspace_path: workspace,
          model_roles: {
            planner: "deepseek/deepseek-v4-pro",
            literature_researcher: "deepseek/deepseek-v4-pro",
            code_analyst: "deepseek/deepseek-v4-pro",
            experiment_designer: "deepseek/deepseek-v4-pro",
            writer: "deepseek/deepseek-v4-pro",
            reviewer: "openai/gpt-5.2",
            citation_checker: "deepseek/deepseek-v4-pro",
            cheap_summarizer: "deepseek/deepseek-v4-pro",
          },
          data_egress_policy: {
            allowed_paths: ["packages/opencode"],
            external_model_full_text: false,
          },
        },
        runtimeOptions(workspace, home),
      )

      expect(run.snapshot.schema_version).toBe("PaperRun.v1")
      expect(run.snapshot.quality_mode).toBe("submission_candidate")
      expect(run.snapshot.budget_tier).toBe("submission")
      expect(run.snapshot.data_egress_policy.mode).toBe("private_first")
      expect(run.snapshot.stage_graph.stages).toHaveLength(14)
      expect(run.snapshot.agent_tree.max_depth).toBeNull()
      expect(run.snapshot.agent_tree.recursive_policy.depth_policy).toBe("unbounded")
      expect(run.snapshot.diagnostics.model_roles.writer?.model_id).toBe("deepseek-v4-pro")
      expect(run.snapshot.diagnostics.model_roles.reviewer?.model_id).toBe("gpt-5.2")
      expect(run.snapshot.internal_sessions).toEqual([])

      const forced = await exportPaperRun(run.run_id, { forced: true }, runtimeOptions(workspace, home))
      expect(forced.status).toBe("blocked")
      expect(forced.failed_checks).toContain("draft_missing")
    } finally {
      await clean(dir)
    }
  })

  test("accepts nested multi-model subagents but blocks unauthorized data egress", () => {
    const router = createAgentRoleRouter({
      default_model: "deepseek/deepseek-v4-pro",
      roles: {
        writer: "deepseek/deepseek-v4-pro",
        reviewer: "openai/gpt-5.2",
      },
      subagents: {
        citation_verifier: "anthropic/claude-sonnet-4-5",
      },
    })
    const tree = createPaperAgentTree({
      run_id: "run-hard-fork",
      budget_tier: "submission",
      router,
      root_role: "writer",
    })
    const reviewer = spawnPaperSubagent(tree, {
      parent_agent_id: tree.root_agent_id,
      role: "reviewer",
      agent_id: "agent-reviewer",
    })
    const verifier = spawnPaperSubagent(tree, {
      parent_agent_id: reviewer.agent_id,
      role: "reviewer",
      subagent_role: "citation_verifier",
      agent_id: "agent-citation-verifier",
      input_artifacts: ["artifact-draft"],
    })

    expect(tree.nodes.map((node) => node.depth)).toEqual([0, 1, 2])
    expect(tree.nodes[0]!.model_id).toBe("deepseek-v4-pro")
    expect(reviewer.model_id).toBe("gpt-5.2")
    expect(verifier.model_id).toBe("claude-sonnet-4-5")

    const egress = evaluateDataEgressPolicy({
      policy: {
        mode: "private_first",
        allowed_paths: ["packages/opencode/src/paper"],
        denied_patterns: ["**/.env*", "**/secrets/**"],
        external_model_full_text: false,
      },
      candidates: ["packages/opencode/src/paper/run.ts", "packages/opencode/.env", "packages/opencode/secrets/key.txt"],
    })
    expect(egress.allowed).toEqual(["packages/opencode/src/paper/run.ts"])
    expect(egress.blocked.map((item) => item.path)).toEqual(["packages/opencode/.env", "packages/opencode/secrets/key.txt"])
  })
})
