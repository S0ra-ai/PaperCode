import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import { createPaperRun, PAPER_RESEARCH_STAGE_IDS, type PaperRunRuntimeOptions } from "@/paper"

const now = "2026-05-10T00:00:00Z"

const cleanup: string[] = []

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true }).catch((error) => {
    if (attempts <= 1) throw error
    return clean(dir, attempts - 1)
  })
}

function runtimeOptions(workspace: string, home: string): PaperRunRuntimeOptions {
  let index = 0
  return {
    workspace,
    home,
    clock: () => new Date(now),
    idFactory: (kind) => `${kind}-${++index}`,
  }
}

async function fixtureWorkspace() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-paperrun-execution-"))
  cleanup.push(dir)
  const workspace = path.join(dir, "workspace")
  const home = path.join(dir, "home")
  await mkdir(path.join(workspace, "src"), { recursive: true })
  await mkdir(home, { recursive: true })
  await writeFile(
    path.join(workspace, "package.json"),
    JSON.stringify({ scripts: { test: "bun test", bench: "bun test test/paper/code-to-paper.test.ts" } }, null, 2),
  )
  await writeFile(
    path.join(workspace, "src", "paper-method.ts"),
    [
      "export function buildClaimLedger(input: string) {",
      "  return input.trim().toLowerCase()",
      "}",
      "",
      "export class PaperVerifier {",
      "  verify() {",
      "    return true",
      "  }",
      "}",
    ].join("\n"),
  )
  return { dir, workspace, home }
}

afterEach(async () => {
  while (cleanup.length > 0) {
    const dir = cleanup.pop()
    if (dir) await clean(dir)
  }
})

describe("PaperRun default execution engine", () => {
  test("creation drives the default paper stage graph without injected fixture handlers", async () => {
    const { workspace, home } = await fixtureWorkspace()
    const run = await createPaperRun(
      {
        topic: "代码仓库生成可验证论文",
        workspace_path: workspace,
        code_paths: ["src"],
        target_profile: "generic-preprint",
        language: "zh-CN",
        budget_tier: "standard",
      },
      runtimeOptions(workspace, home),
    )

    const stageStatus = new Map(run.snapshot.stage_graph.stages.map((stage) => [stage.id, stage.status]))
    expect(Array.from(stageStatus.keys())).toEqual(Array.from(PAPER_RESEARCH_STAGE_IDS))
    expect(stageStatus.get("planning")).not.toBe("pending")
    expect(stageStatus.get("code_analysis")).toBe("succeeded")
    expect(stageStatus.get("export")).toBe("succeeded")
    expect(run.snapshot.events.map((event) => event.type)).toContain("paperorchestrator.started")
    expect(run.snapshot.events.map((event) => event.type)).toContain("export.bundle.completed")
    expect(run.snapshot.artifacts.some((artifact) => artifact.metadata?.artifact_schema === "ResearchRunController.v1")).toBe(true)
    expect(run.snapshot.artifacts.some((artifact) => artifact.metadata?.artifact_schema === "CodebaseMap.v1")).toBe(true)
    expect(run.snapshot.claim_ledger.length).toBeGreaterThan(0)
    expect(run.snapshot.drafts.length).toBeGreaterThan(0)
    expect(run.snapshot.exports.length).toBeGreaterThan(0)
    expect(run.snapshot.export_state.status).toBe("blocked")
    expect(run.snapshot.export_state.failed_checks).toContain("reproduction_failure")
    expect(run.snapshot.status).toBe("blocked")
    expect(run.snapshot.controller_state.status).toBe("review_required")
    expect(stageStatus.get("reproduction")).toBe("blocked")
    expect(run.snapshot.stage_graph.stages.find((stage) => stage.id === "reproduction")?.summary).toContain(
      "reproduction_failure",
    )
    expect(run.snapshot.experiment_status.reproduction_gate).toBe("blocked")

    const blockedDiagnostics = run.snapshot.artifacts.filter(
      (artifact) => artifact.metadata?.artifact_schema === "BlockedDiagnostic.v1",
    )
    expect(blockedDiagnostics.length).toBe(0)
  })
})
