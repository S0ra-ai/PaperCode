import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { existsSync } from "fs"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import { globalIndexPath } from "@/paper/research/storage"
import {
  createResearchRun,
  getResearchRunStatus,
  recordResearchCost,
  ResearchArtifactLockedError,
  resumeResearchRun,
  setResearchFinalGate,
  writeResearchArtifact,
  type ResearchRuntimeOptions,
} from "@/paper/research/runtime"

const now = "2026-05-08T00:00:00Z"

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch((error) => {
    if (attempts <= 1) {
      console.warn(`Could not remove temporary runtime test directory ${dir}: ${String(error)}`)
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

describe("research runtime", () => {
  test("creates a home-first run and rebuilds local and global indexes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-runtime-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })

      const handle = await createResearchRun(
        {
          topic: "runtime smoke",
          budget: { total_soft_usd: 1 },
        },
        runtimeOptions(workspace, home),
      )

      expect(handle.storage_scope).toBe("home")
      expect(handle.run.workspace).toBe(workspace)
      expect(handle.run_dir.startsWith(path.join(home, ".paper_fucker", "runs"))).toBe(true)
      expect(handle.run_dir.startsWith(path.join(workspace, ".paper_fucker", "runs"))).toBe(false)
      expect(existsSync(path.join(handle.run_dir, "run.json"))).toBe(true)
      expect(existsSync(path.join(handle.run_dir, "runtime-state.json"))).toBe(true)
      expect(existsSync(path.join(handle.run_dir, "events.jsonl"))).toBe(true)

      const status = await getResearchRunStatus(handle.run_dir)
      expect(status.run.status).toBe("running")
      expect(status.counts.events).toBe(1)

      const runDb = new Database(path.join(handle.run_dir, "index.sqlite"), { readonly: true })
      try {
        expect((runDb.query("SELECT COUNT(*) AS count FROM events").get() as { count: number }).count).toBe(1)
      } finally {
        runDb.close()
      }

      const globalDb = new Database(globalIndexPath(home), { readonly: true })
      try {
        expect((globalDb.query("SELECT COUNT(*) AS count FROM runs").get() as { count: number }).count).toBe(1)
      } finally {
        globalDb.close()
      }
    } finally {
      await clean(dir)
    }
  })

  test("stores append-only events and versioned artifacts with lock protection", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-runtime-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "artifact smoke" }, options)

      const first = await writeResearchArtifact(
        handle.run_dir,
        {
          kind: "draft",
          logical_path: "drafts/summary.md",
          data: { b: 2, a: 1 },
        },
        options,
      )
      const second = await writeResearchArtifact(
        handle.run_dir,
        {
          kind: "draft",
          logical_path: "drafts/summary.md",
          data: { a: 1, b: 3 },
          locked: true,
        },
        options,
      )

      expect(second.metadata?.version).toBe(2)
      expect(second.metadata?.supersedes).toBe(first.artifact_id)
      expect(second.path).toBe("artifacts/drafts/summary.v2.md")
      expect(second.sha256).not.toBe(first.sha256)
      await expect(
        writeResearchArtifact(
          handle.run_dir,
          {
            kind: "draft",
            logical_path: "drafts/summary.md",
            data: "blocked",
          },
          options,
        ),
      ).rejects.toThrow(ResearchArtifactLockedError)

      const status = await getResearchRunStatus(handle.run_dir)
      expect(status.counts.artifacts).toBe(2)
      expect(status.artifact_versions).toEqual([
        {
          logical_path: "drafts/summary.md",
          latest_artifact_id: second.artifact_id,
          latest_path: second.path,
          latest_sha256: second.sha256,
          versions: 2,
          locked: true,
          superseded_artifact_ids: [first.artifact_id],
        },
      ])
    } finally {
      await clean(dir)
    }
  })

  test("tracks bounded permissions, resource state, cost alerts, final gate, and resume", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-runtime-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const options = runtimeOptions(workspace, home)
      const handle = await createResearchRun(
        {
          topic: "policy smoke",
          permission: { access_mode: "bounded", bounded_hours: 3 },
          budget: { total_soft_usd: 1 },
        },
        options,
      )

      expect(handle.state.permissions.access_mode).toBe("bounded")
      expect(handle.state.permissions.bounded_hours).toBe(3)
      expect(handle.state.permissions.manual_command_required).toBe(false)
      expect(handle.state.resources.cpu_count).toBeGreaterThan(0)

      const cost = await recordResearchCost(handle.run_dir, { llm_usd: 0.6, api_usd: 0.5 }, options)
      expect(cost.total_usd).toBe(1.1)
      expect(cost.alerts).toHaveLength(1)
      expect(cost.alerts[0]?.category).toBe("total")

      const gate = await setResearchFinalGate(
        handle.run_dir,
        {
          status: "blocked",
          blockers: ["missing evidence"],
        },
        options,
      )
      expect(gate.status).toBe("blocked")

      const resumed = await resumeResearchRun(handle.run_dir, options)
      expect(resumed.run.status).toBe("running")
      expect(resumed.state.final_gate.status).toBe("blocked")
      expect(resumed.counts.events).toBeGreaterThanOrEqual(5)
    } finally {
      await clean(dir)
    }
  })
})
