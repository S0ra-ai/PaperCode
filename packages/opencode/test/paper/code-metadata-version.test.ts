import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { setTimeout as sleep } from "node:timers/promises"
import { createPaperRun, PAPER_MODEL_ROLES, stopAllPaperRunLivePreviews, type PaperModelRole, type PaperRunRuntimeOptions } from "@/paper"

const now = "2026-05-10T00:00:00Z"
const TEST_MODEL = "test-provider/test-model"
const PAPER_RUN_INTEGRATION_TIMEOUT = 180_000
const cleanup: string[] = []

function testModelRoles(): Record<PaperModelRole, string> {
  return Object.fromEntries(PAPER_MODEL_ROLES.map((role) => [role, TEST_MODEL])) as Record<PaperModelRole, string>
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

async function clean(dir: string, attempts = 60): Promise<void> {
  await sleep(100)
  return rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch((error) => {
    if (attempts <= 1) {
      console.warn(`Could not remove temporary code metadata test directory ${dir}: ${String(error)}`)
      return
    }
    return clean(dir, attempts - 1)
  })
}

async function fixtureWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-code-metadata-"))
  cleanup.push(root)
  const workspace = path.join(root, "workspace")
  const home = path.join(root, "home")
  await mkdir(path.join(workspace, "src"), { recursive: true })
  await mkdir(home, { recursive: true })
  await writeFile(path.join(root, "README.md"), "# Fixture Product Root\n\n当前版本：<!-- version:start -->9.8.7-dev<!-- version:end -->\n")
  await writeFile(
    path.join(workspace, "package.json"),
    JSON.stringify({ name: "fixture-code-paper", version: "0.1.0", license: "MPL-2.0", scripts: { test: "bun test" } }, null, 2),
  )
  await writeFile(
    path.join(workspace, "src", "paper-method.ts"),
    [
      "export function buildClaimLedger(input: string) {",
      "  return input.trim().toLowerCase()",
      "}",
    ].join("\n"),
  )
  await writeFile(
    path.join(workspace, "source-evidence.json"),
    JSON.stringify(
      {
        schema_version: "SourceEvidenceManifest.v1",
        created_at: now,
        provenance: "unit-test-real-arxiv-source-evidence",
        sources: [
          {
            source_id: "paper:arxiv:2305.12571",
            kind: "paper",
            title: "Reproducibility Requires Consolidated Artifacts",
            url: "https://arxiv.org/abs/2305.12571",
            provider: "arxiv",
            license: { status: "clear", expression: "CC BY-NC-SA 4.0" },
            version: { value: "live-arxiv-abs-page", retrieved_at: now, published_at: "2023-05-21" },
            verification: { status: "verified", method: "unit-test-real-arxiv-record", checked_at: now, diagnostics: [] },
            topics: ["代码版本元数据"],
            arxiv_id: "2305.12571",
          },
        ],
      },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(workspace, "experiment-evidence.json"),
    JSON.stringify(
      {
        schema_version: "ExperimentEvidenceManifest.v1",
        created_at: now,
        provenance: "unit-test-local-reproduction",
        primary_metric: "accuracy",
        metric_direction: "higher_better",
        metric_values: {
          "host:proposed": 0.94,
          "container:proposed": 0.94,
          "host:baseline": 0.81,
          "container:baseline": 0.81,
          "host:ablation": 0.89,
          "container:ablation": 0.89,
        },
        container_image: "paper-fucker/local-reproduction",
        container_digest: "sha256:unit-test",
      },
      null,
      2,
    ),
  )
  return { root, workspace, home }
}

afterEach(async () => {
  stopAllPaperRunLivePreviews()
  while (cleanup.length > 0) {
    const dir = cleanup.pop()
    if (dir) await clean(dir)
  }
})

describe("PaperRun code availability metadata", () => {
  test("prefers product README version over workspace package version in final paper", async () => {
    const { root, workspace, home } = await fixtureWorkspace()
    const run = await createPaperRun(
      {
        topic: "代码版本元数据论文",
        workspace_path: workspace,
        code_paths: ["src"],
        paper_files: ["source-evidence.json"],
        experiment_logs: ["experiment-evidence.json"],
        target_profile: "generic-preprint",
        language: "zh-CN",
        budget_tier: "standard",
        model_roles: testModelRoles(),
      },
      runtimeOptions(root, home),
    )

    expect(run.snapshot.export_state.status).toBe("final")
    expect(run.snapshot.export_state.failed_checks).toEqual([])
    const markdownFile = run.snapshot.export_state.files?.find((file) => file.format === "markdown" && file.status === "written")
    expect(markdownFile).toBeDefined()
    const finalMarkdown = await readFile(path.join(run.run_dir, markdownFile!.path), "utf8")
    expect(finalMarkdown).toContain("代码包：fixture-code-paper")
    expect(finalMarkdown).toContain("代码版本：9.8.7-dev")
    expect(finalMarkdown).not.toContain("代码版本：0.1.0")
  }, PAPER_RUN_INTEGRATION_TIMEOUT)
})
