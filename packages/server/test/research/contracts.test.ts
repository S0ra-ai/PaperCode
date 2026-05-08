import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import os from "os"
import path from "path"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import {
  defaultStorageLayout,
  RESEARCH_SCHEMA_VERSION,
  ResearchContractMigrationError,
  schema,
  validate,
  type ResearchEvent,
  type ResearchRun,
} from "@/research/contracts"
import { rebuildGlobalIndex, rebuildRunIndex } from "@/research/storage"

const now = "2026-05-08T00:00:00Z"

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true }).catch((error) => {
    if (attempts <= 1) throw error
    return clean(dir, attempts - 1)
  })
}

function run(): ResearchRun {
  return {
    schema_version: RESEARCH_SCHEMA_VERSION,
    run_id: "run:test",
    topic: "contract test",
    workspace: "E:/Project/paper_fucker",
    status: "running",
    created_at: now,
    updated_at: now,
    storage: defaultStorageLayout,
  }
}

function event(): ResearchEvent {
  return {
    schema_version: RESEARCH_SCHEMA_VERSION,
    event_id: "evt:test",
    run_id: "run:test",
    type: "run.created",
    created_at: now,
    actor: "system",
    payload: { ok: true },
  }
}

describe("research contracts", () => {
  test("loads the JSON Schema source and validates generated TypeScript contract shapes", () => {
    expect(schema().$id).toBe("https://paper-fucker.local/schemas/research/v1.schema.json")
    const checked = validate("event", event())
    expect(checked.schema_version).toBe(RESEARCH_SCHEMA_VERSION)
    expect(checked.type).toBe("run.created")
  })

  test("fails incompatible schema versions with an actionable migration error", () => {
    expect(() => validate("event", { ...event(), schema_version: "research.v0" })).toThrow(
      ResearchContractMigrationError,
    )
    expect(() => validate("event", { ...event(), schema_version: "research.v2" })).toThrow(/expected research\.v1/)
  })

  test("rebuilds run and global SQLite indexes from JSON and JSONL fact files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-server-test-"))
    try {
      await Bun.write(path.join(dir, "run.json"), JSON.stringify(run()))
      await Bun.write(path.join(dir, "events.jsonl"), JSON.stringify(event()) + "\n")
      await Bun.write(
        path.join(dir, "artifacts.jsonl"),
        JSON.stringify({
          schema_version: RESEARCH_SCHEMA_VERSION,
          artifact_id: "art:test",
          run_id: "run:test",
          kind: "draft",
          path: "draft.md",
          mime_type: "text/markdown",
          source_ids: [],
          created_at: now,
        }) + "\n",
      )
      await Bun.write(
        path.join(dir, "sources.jsonl"),
        JSON.stringify({
          schema_version: RESEARCH_SCHEMA_VERSION,
          source_id: "src:test",
          run_id: "run:test",
          kind: "code",
          title: "source",
          locator: { path: "README.md" },
          created_at: now,
        }) + "\n",
      )
      for (const file of [
        "tool-traces.jsonl",
        "claims.jsonl",
        "drafts.jsonl",
        "reviews.jsonl",
        "exports.jsonl",
        "checkpoints.jsonl",
      ]) {
        await Bun.write(path.join(dir, file), "")
      }

      const summary = await rebuildRunIndex(dir)
      expect(summary.run_id).toBe("run:test")
      expect(summary.counts.events).toBe(1)
      expect(summary.counts.artifacts).toBe(1)

      const runDb = new Database(path.join(dir, "index.sqlite"), { readonly: true })
      try {
        expect((runDb.query("SELECT COUNT(*) AS count FROM events").get() as { count: number }).count).toBe(1)
        expect((runDb.query("SELECT COUNT(*) AS count FROM artifacts").get() as { count: number }).count).toBe(1)
      } finally {
        runDb.close()
      }

      const globalHome = path.join(dir, "home")
      await mkdir(globalHome, { recursive: true })
      const globalPath = await rebuildGlobalIndex([dir], { home: globalHome })
      const globalDb = new Database(globalPath, { readonly: true })
      try {
        expect((globalDb.query("SELECT COUNT(*) AS count FROM runs").get() as { count: number }).count).toBe(1)
      } finally {
        globalDb.close()
      }
    } finally {
      await clean(dir)
    }
  })
})
