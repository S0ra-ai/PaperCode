import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import {
  createPaperRun,
  PAPER_MODEL_ROLES,
  PAPER_RESEARCH_STAGE_IDS,
  type PaperModelRole,
  type PaperRunRuntimeOptions,
} from "@/paper"

const now = "2026-05-10T00:00:00Z"
const TEST_MODEL = "test-provider/test-model"

function testModelRoles(): Record<PaperModelRole, string> {
  return Object.fromEntries(PAPER_MODEL_ROLES.map((role) => [role, TEST_MODEL])) as Record<PaperModelRole, string>
}

const cleanup: string[] = []

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch((error) => {
    if (attempts <= 1) {
      console.warn(`Could not remove temporary PaperRun execution test directory ${dir}: ${String(error)}`)
      return
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

function verifiedSourceEvidence(topic: string) {
  return {
    schema_version: "SourceEvidenceManifest.v1",
    created_at: now,
    provenance: "unit-test-verified-source-evidence",
    sources: [
      {
        source_id: "paper:verified-source:evidence",
        kind: "paper",
        title: `${topic} verified source`,
        url: "https://arxiv.org/abs/2401.00001",
        provider: "unit-test-source-manifest",
        license: { status: "clear", expression: "arXiv non-exclusive distribution" },
        version: { value: "v1", retrieved_at: now },
        verification: {
          status: "verified",
          method: "unit-test-source-manifest",
          checked_at: now,
          diagnostics: [],
        },
        topics: [topic],
      },
    ],
  }
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
        model_roles: testModelRoles(),
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

  test("experiment evidence manifest allows final export when reproduction passes", async () => {
    const { workspace, home } = await fixtureWorkspace()
    await writeFile(path.join(workspace, "source-evidence.json"), JSON.stringify(verifiedSourceEvidence("带复现实验证据的最终论文导出"), null, 2))
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
    const run = await createPaperRun(
      {
        topic: "带复现实验证据的最终论文导出",
        workspace_path: workspace,
        code_paths: ["src"],
        paper_files: ["source-evidence.json"],
        experiment_logs: ["experiment-evidence.json"],
        target_profile: "generic-preprint",
        language: "zh-CN",
        budget_tier: "standard",
        model_roles: testModelRoles(),
      },
      runtimeOptions(workspace, home),
    )

    expect(run.snapshot.status).toBe("succeeded")
    expect(run.snapshot.export_state.status).toBe("final")
    expect(run.snapshot.export_state.failed_checks).toEqual([])
    expect(run.snapshot.experiment_status.reproduction_gate).toBe("passed")
    expect(run.snapshot.stage_graph.stages.find((stage) => stage.id === "reproduction")?.status).toBe("succeeded")
    expect(run.snapshot.artifacts.some((artifact) => artifact.metadata?.artifact_schema === "ExperimentEvidenceManifest.v1")).toBe(true)
    expect(run.snapshot.artifacts.some((artifact) => artifact.metadata?.artifact_schema === "SourceEvidenceManifest.v1")).toBe(true)
  })

  test("reproduction evidence alone cannot bypass verified source requirements", async () => {
    const { workspace, home } = await fixtureWorkspace()
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
    const run = await createPaperRun(
      {
        topic: "缺少验证来源时禁止最终导出",
        workspace_path: workspace,
        code_paths: ["src"],
        experiment_logs: ["experiment-evidence.json"],
        target_profile: "generic-preprint",
        language: "zh-CN",
        budget_tier: "standard",
        model_roles: testModelRoles(),
      },
      runtimeOptions(workspace, home),
    )

    expect(run.snapshot.experiment_status.reproduction_gate).toBe("blocked")
    expect(run.snapshot.export_state.status).toBe("blocked")
    expect(run.snapshot.export_state.failed_checks).toContain("unsupported_claim")
  })
})
