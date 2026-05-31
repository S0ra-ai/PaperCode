import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { inspectPaperMachineProfile } from "@/paper/machine"

const originalPath = process.env.PATH
const originalPathExt = process.env.PATHEXT
const cleanup: string[] = []

afterEach(async () => {
  process.env.PATH = originalPath
  process.env.PATHEXT = originalPathExt
  while (cleanup.length > 0) {
    const dir = cleanup.pop()
    if (dir) await rm(dir, { recursive: true, force: true })
  }
})

async function tempContext() {
  const root = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-machine-"))
  cleanup.push(root)
  const workspace = path.join(root, "workspace")
  const home = path.join(root, "home")
  await mkdir(workspace, { recursive: true })
  await mkdir(home, { recursive: true })
  return { root, workspace, home }
}

describe("Paper machine profile", () => {
  test("reports CPU-only optional environment when no tools are on PATH", async () => {
    const { workspace, home } = await tempContext()
    process.env.PATH = ""
    process.env.PATHEXT = ""

    const result = await inspectPaperMachineProfile({ workspace, home, refresh: true })

    expect(result.profile.schema_version).toBe("PaperMachineProfile.v1")
    expect(result.environment.schema_version).toBe("PaperExperimentEnvironmentStatus.v1")
    expect(result.profile.workspace).toBe(path.resolve(workspace))
    expect(result.profile.default_run_root).toContain(".paper_fucker")
    expect(result.profile.gpu.mode).toBe("cpu-only")
    expect(result.environment.status).toBe("available")
    expect(result.environment.optional_missing.map((item) => item.id)).toContain("docker")
    expect(result.environment.notes.some((note) => note.includes("CPU-only"))).toBe(true)
  })

  test("marks discovered tools as available without parsing shell output", async () => {
    const { workspace, home, root } = await tempContext()
    const bin = path.join(root, "bin")
    await mkdir(bin, { recursive: true })
    await writeFile(path.join(bin, "python"), "")
    process.env.PATH = bin
    process.env.PATHEXT = ""

    const result = await inspectPaperMachineProfile({ workspace, home, refresh: true })
    const python = result.profile.runtimes.find((item) => item.id === "python")

    expect(python).toBeDefined()
    expect(python?.status).toBe("available")
    expect(python?.path).toBe(path.join(bin, "python"))
  })
})
