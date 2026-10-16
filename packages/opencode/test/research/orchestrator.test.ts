import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import { createResearchRun, getResearchRunStatus, type ResearchRuntimeOptions } from "@/paper/research/runtime"
import {
  ORCHESTRATOR_CONTROLS,
  queueGuidance,
  runOrchestratorControl,
  startAutomaticResearchRun,
  type StageHandler,
  type ResearchStageId,
} from "@/paper/research/orchestrator"

const now = "2026-05-09T00:00:00Z"

async function clean(dir: string, attempts = 80): Promise<void> {
  Bun.gc(true)
  await sleep(250)
  return rm(dir, { recursive: true, force: true }).catch((error) => {
    if (attempts <= 1) {
      console.warn(`Could not remove temporary orchestrator test directory ${dir}: ${String(error)}`)
      return
    }
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

const successfulHandlers = (except: Partial<Record<ResearchStageId, StageHandler>> = {}) => {
  const stages: ResearchStageId[] = ["intake", "template", "literature", "data", "experiment", "writing", "verification", "export"]
  return Object.fromEntries(
    stages.map((stage) => [
      stage,
      except[stage] ??
        (() => ({
          summary: `${stage} ok`,
        })),
    ]),
  ) as Record<ResearchStageId, StageHandler>
}

describe("automatic research orchestrator", () => {
  test("runs the stage graph, applies queued guidance, and emits preview startup", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "papercode-orchestrator-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "CS AI fixture" }, options)
      await queueGuidance(handle.run_dir, { run_id: handle.run.run_id, text: "Use Chinese terminology.", apply_at_stage: "template" }, options)

      const guidanceSeen: string[] = []
      const snapshot = await startAutomaticResearchRun(
        {
          run_dir: handle.run_dir,
          handlers: {
            ...successfulHandlers(),
            template: ({ guidance }: { guidance: Array<{ text: string }> }) => {
              guidanceSeen.push(...guidance.map((item) => item.text))
              return {
                summary: "template ok",
                artifact: {
                  logical_path: "orchestrator/template-fixture.json",
                  schema: "TemplateSpec.v1",
                  data: { venue: "fixture", confidence: 0.9 },
                },
              }
            },
          },
        },
        options,
      )

      expect(snapshot.paused).toBe(false)
      expect(snapshot.stages.map((stage) => stage.status)).toEqual([
        "succeeded",
        "succeeded",
        "succeeded",
        "succeeded",
        "succeeded",
        "succeeded",
        "succeeded",
        "succeeded",
      ])
      expect(guidanceSeen).toEqual(["Use Chinese terminology."])

      const status = await getResearchRunStatus(handle.run_dir)
      const events = await Bun.file(path.join(handle.run_dir, "events.jsonl")).text()
      expect(events).toContain("preview.start.requested")
      expect(status.artifact_versions.some((item) => item.logical_path === "orchestrator/state.json")).toBe(true)
    } finally {
      await clean(dir)
    }
  })

  test("pauses on policy conditions and exposes run controls", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "papercode-orchestrator-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "pause fixture" }, options)

      const snapshot = await startAutomaticResearchRun(
        {
          run_dir: handle.run_dir,
          handlers: {
            ...successfulHandlers(),
            literature: () => ({
              signal: { source_license_conflict: "dataset license unavailable" },
            }),
          },
        },
        options,
      )

      expect(snapshot.paused).toBe(true)
      expect(snapshot.pause?.reason).toBe("source_license_conflict")
      expect(snapshot.stages.find((stage) => stage.id === "literature")?.status).toBe("paused")
      expect(ORCHESTRATOR_CONTROLS).toContain("pause")
      expect(ORCHESTRATOR_CONTROLS).toContain("export")

      const control = await runOrchestratorControl(handle.run_dir, "pause", options)
      expect(control.accepted).toBe(true)
    } finally {
      await clean(dir)
    }
  })
})
