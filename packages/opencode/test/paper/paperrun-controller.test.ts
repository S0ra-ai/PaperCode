import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import {
  controlPaperRun,
  createPaperRun,
  getPaperRunSnapshot,
  loadPaperRunControllerState,
  recordPaperRunGuidance,
  subscribePaperRunEvents,
  type PaperRunRuntimeOptions,
} from "@/paper"

const now = "2026-05-10T01:00:00Z"
const cleanup: string[] = []

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true }).catch((error) => {
    if (attempts <= 1) {
      if (error && typeof error === "object" && "code" in error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === "EBUSY" || code === "EACCES" || code === "EPERM") return
      }
      throw error
    }
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

async function workspaceFixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-paperrun-controller-"))
  cleanup.push(dir)
  const workspace = path.join(dir, "workspace")
  const home = path.join(dir, "home")
  await mkdir(workspace, { recursive: true })
  await mkdir(home, { recursive: true })
  return { workspace, home }
}

afterEach(async () => {
  while (cleanup.length > 0) {
    const dir = cleanup.pop()
    if (dir) await clean(dir)
  }
})

describe("PaperRun durable controller", () => {
  test("persists pause, guidance, resume, cancel, and controller SSE state", async () => {
    const { workspace, home } = await workspaceFixture()
    const options = runtimeOptions(workspace, home)
    const run = await createPaperRun(
      {
        topic: "控制器暂停与继续",
        workspace_path: workspace,
        code_paths: ["missing-source-dir"],
        language: "zh-CN",
      },
      options,
    )

    const initial = await loadPaperRunControllerState(run.run_dir)
    expect(initial.status).toBe("paused")
    expect(initial.checkpoints.some((checkpoint) => checkpoint.stage === "code_analysis" && checkpoint.status === "blocked")).toBe(true)
    expect(initial.guidance_queue).toEqual([])

    const guidance = await recordPaperRunGuidance(run.run_id, { message: "跳过代码路径，先写主题综述。" }, options)
    expect(guidance.accepted).toBe(true)
    const withGuidance = await loadPaperRunControllerState(run.run_dir)
    expect(withGuidance.guidance_queue[0]).toMatchObject({
      message: "跳过代码路径，先写主题综述。",
      status: "queued",
    })

    const resumed = await controlPaperRun(run.run_id, { action: "resume" }, options)
    expect(resumed.status).toBe("running")
    expect(resumed.guidance_queue[0]?.status).toBe("applied")

    const events = await subscribePaperRunEvents(run.run_id, options)
    expect(events).toContain("event: paper.run.snapshot")
    expect(events).toContain("event: paper.run.controller")

    const cancelled = await controlPaperRun(run.run_id, { action: "cancel" }, options)
    expect(cancelled.status).toBe("cancelled")
    const snapshot = await getPaperRunSnapshot(run.run_id, options)
    expect(snapshot.controller_state.status).toBe("cancelled")
  })
})
