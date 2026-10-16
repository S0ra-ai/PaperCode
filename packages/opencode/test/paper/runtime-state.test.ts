import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readdir, readFile, rm } from "fs/promises"
import os from "os"
import path from "path"
import { setTimeout as sleep } from "timers/promises"
import { writeJsonAtomic } from "@/paper/research/runtime/state"

const cleanup: string[] = []

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(50)
  return rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch((error) => {
    if (attempts <= 1) {
      console.warn(`Could not remove temporary PaperRun runtime test directory ${dir}: ${String(error)}`)
      return
    }
    return clean(dir, attempts - 1)
  })
}

afterEach(async () => {
  while (cleanup.length > 0) {
    const dir = cleanup.pop()
    if (dir) await clean(dir)
  }
})

describe("PaperRun runtime state persistence", () => {
  test("atomic JSON writes survive concurrent updates on the real filesystem", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "papercode-runtime-state-"))
    cleanup.push(dir)
    const file = path.join(dir, "run.json")

    await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        writeJsonAtomic(file, {
          schema_version: "test",
          index,
          payload: `write-${index}`,
        }),
      ),
    )

    const parsed = JSON.parse(await readFile(file, "utf8")) as { schema_version?: string; index?: number }
    expect(parsed.schema_version).toBe("test")
    expect(typeof parsed.index).toBe("number")
    expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([])
  })
})
