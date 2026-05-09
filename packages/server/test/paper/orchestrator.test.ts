import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import {
  PAPER_RESEARCH_STAGE_IDS,
  createResearchCapabilityRegistry,
  startPaperResearchRun,
  type PaperResearchStageId,
} from "@/paper"
import { createResearchRun, readJsonlFacts, type ResearchRuntimeOptions } from "@/research/runtime"

const now = "2026-05-09T00:00:00Z"

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true }).catch((error) => {
    if (attempts <= 1) throw error
    return clean(dir, attempts - 1)
  })
}

function runtimeOptions(workspace: string, home: string): ResearchRuntimeOptions {
  let index = 0
  return {
    workspace,
    home,
    clock: () => new Date(now),
    idFactory: (kind) => `${kind}-${++index}`,
  }
}

async function fixtureRun() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-paper-orchestrator-test-"))
  const workspace = path.join(dir, "workspace")
  const home = path.join(dir, "home")
  await mkdir(workspace, { recursive: true })
  await mkdir(home, { recursive: true })
  const options = runtimeOptions(workspace, home)
  const handle = await createResearchRun({ topic: "paper orchestrator fixture" }, options)
  return { dir, options, handle }
}

describe("paper research orchestrator", () => {
  test("defines the complete closed-loop paper stage graph", () => {
    expect(PAPER_RESEARCH_STAGE_IDS).toEqual([
      "intake",
      "planning",
      "literature",
      "code_analysis",
      "data",
      "experiment_design",
      "experiment_execution",
      "reproduction",
      "claim_ledger",
      "drafting",
      "profile_formatting",
      "verification",
      "revision",
      "export",
    ])
  })

  test("blocks instead of completing stages through a stub handler", async () => {
    const { dir, options, handle } = await fixtureRun()
    try {
      const snapshot = await startPaperResearchRun(
        {
          run_dir: handle.run_dir,
          request: { topic: "paper orchestrator fixture" },
          max_stages: 2,
          capabilities: createResearchCapabilityRegistry([]),
        },
        options,
      )

      expect(snapshot.paused).toBe(true)
      expect(snapshot.pause).toMatchObject({
        stage: "planning",
        reason: "capability_missing",
      })
      expect(snapshot.stages.find((stage) => stage.id === "intake")?.status).toBe("succeeded")
      expect(snapshot.stages.find((stage) => stage.id === "planning")?.status).toBe("blocked")
      expect(JSON.stringify(snapshot)).not.toContain("stub handler")

      const artifacts = await readJsonlFacts(handle.run_dir, "artifact")
      expect(artifacts.some((artifact) => artifact.metadata?.artifact_schema === "BlockedDiagnostic.v1")).toBe(true)
    } finally {
      await clean(dir)
    }
  })

  test("runs the full graph when every stage has a real handler", async () => {
    const { dir, options, handle } = await fixtureRun()
    try {
      const seen: PaperResearchStageId[] = []
      const handlers = Object.fromEntries(
        PAPER_RESEARCH_STAGE_IDS.map((stage) => [
          stage,
          () => {
            seen.push(stage)
            return {
              summary: `${stage} real handler completed`,
              artifact: {
                logical_path: `paper-orchestrator/${stage}.json`,
                schema: `${stage}.fixture.v1`,
                data: { stage },
              },
            }
          },
        ]),
      )

      const snapshot = await startPaperResearchRun(
        {
          run_dir: handle.run_dir,
          request: { topic: "paper orchestrator fixture" },
          handlers,
        },
        options,
      )

      expect(snapshot.paused).toBe(false)
      expect(snapshot.stages.map((stage) => stage.status)).toEqual(PAPER_RESEARCH_STAGE_IDS.map(() => "succeeded"))
      expect(seen).toEqual(Array.from(PAPER_RESEARCH_STAGE_IDS))
    } finally {
      await clean(dir)
    }
  })
})
