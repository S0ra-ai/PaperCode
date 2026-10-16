import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import {
  createPaperRun,
  indexResearchMaterials,
  PAPER_MODEL_ROLES,
  updatePaperModelAllowlist,
  type PaperModelRole,
  type PaperRunRuntimeOptions,
} from "@/paper"

// createPaperRun drives the default engine end to end, and that engine renders the final export
// through the real toolchain (pandoc + a TeX engine) whenever one is installed.
const PAPER_RUN_INTEGRATION_TIMEOUT = 180_000

const cleanup: string[] = []
const now = "2026-05-10T02:00:00Z"
const TEST_MODEL = "test-provider/test-model"

function testModelRoles(): Record<PaperModelRole, string> {
  return Object.fromEntries(PAPER_MODEL_ROLES.map((role) => [role, TEST_MODEL])) as Record<PaperModelRole, string>
}

async function seedTestModelInventory(home: string) {
  await updatePaperModelAllowlist([TEST_MODEL], { home, decision_model: TEST_MODEL })
}

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch((error) => {
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

async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "papercode-material-index-"))
  cleanup.push(dir)
  const workspace = path.join(dir, "workspace")
  const home = path.join(dir, "home")
  await mkdir(path.join(workspace, "src"), { recursive: true })
  await mkdir(path.join(workspace, "data"), { recursive: true })
  await mkdir(path.join(workspace, "logs"), { recursive: true })
  await mkdir(path.join(workspace, "paper"), { recursive: true })
  await mkdir(home, { recursive: true })
  await seedTestModelInventory(home)
  await writeFile(path.join(workspace, "src", "method.ts"), "export function method() {\n  return 42\n}\n")
  await writeFile(path.join(workspace, "paper", "draft.md"), "# Draft\n\nClaim text.\n")
  await writeFile(path.join(workspace, "paper", "main.tex"), "\\section{Method}\nText.\n")
  await writeFile(path.join(workspace, "data", "scores.csv"), "metric,value\naccuracy,0.9\n")
  await writeFile(path.join(workspace, "logs", "run.log"), "accuracy=0.9\nlatency_ms=12\n")
  await writeFile(path.join(workspace, ".env"), "DEEPSEEK_API_KEY=sk-not-real\n")
  await writeFile(path.join(workspace, "paper", "figure.bin"), new Uint8Array([0, 1, 2, 3]))
  return { workspace, home }
}

afterEach(async () => {
  while (cleanup.length > 0) {
    const dir = cleanup.pop()
    if (dir) await clean(dir)
  }
})

describe("Research material index", () => {
  test("indexes real inputs with source ranges while skipping secrets and binaries", async () => {
    const { workspace } = await fixture()
    const index = await indexResearchMaterials({
      workspace_path: workspace,
      code_paths: ["src"],
      paper_files: ["paper/draft.md", "paper/main.tex", ".env", "paper/figure.bin"],
      dataset_paths: ["data/scores.csv"],
      experiment_logs: ["logs/run.log"],
    })

    expect(index.schema_version).toBe("MaterialIndex.v1")
    expect(index.items.find((item) => item.path === "src/method.ts")).toMatchObject({
      kind: "code",
      status: "indexed",
      source_range: { start_line: 1, end_line: 3 },
    })
    expect(index.items.find((item) => item.path === "paper/draft.md")?.kind).toBe("paper_file")
    expect(index.items.find((item) => item.path === "data/scores.csv")?.kind).toBe("dataset")
    expect(index.items.find((item) => item.path === "logs/run.log")?.kind).toBe("experiment_log")
    expect(index.items.find((item) => item.path === ".env")).toMatchObject({ status: "skipped", reason: "secret_like_path" })
    expect(index.items.find((item) => item.path === "paper/figure.bin")).toMatchObject({ status: "skipped", reason: "binary_file" })
  })

  test("records material index artifacts and source ledger entries during PaperRun intake", async () => {
    const { workspace, home } = await fixture()
    const run = await createPaperRun(
      {
        topic: "材料索引生成论文",
        workspace_path: workspace,
        code_paths: ["src"],
      paper_files: ["paper/draft.md", ".env"],
      dataset_paths: ["data/scores.csv"],
      experiment_logs: ["logs/run.log"],
      model_roles: testModelRoles(),
    },
      runtimeOptions(workspace, home),
    )

    expect(run.snapshot.artifacts.some((artifact) => artifact.metadata?.artifact_schema === "MaterialIndex.v1")).toBe(true)
    expect(run.snapshot.source_ledger.some((source) => source.locator.path === ".env")).toBe(false)
    expect(run.snapshot.source_ledger.some((source) => source.locator.path === "src/method.ts")).toBe(true)
    expect(run.snapshot.source_ledger.some((source) => source.locator.path === "data/scores.csv")).toBe(true)
  }, PAPER_RUN_INTEGRATION_TIMEOUT)
})
