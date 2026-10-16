import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import {
  applyPaperRunExperimentStarterPack,
  createPaperRun,
  exportPaperRun,
  getPaperRunSnapshot,
  PAPER_MODEL_ROLES,
  PAPER_RESEARCH_STAGE_IDS,
  previewPaperRun,
  runPaperRunExperimentProtocol,
  stopAllPaperRunLivePreviews,
  updatePaperModelAllowlist,
  type PaperModelRole,
  type PaperRunRuntimeOptions,
} from "@/paper"
import { createResearchRun, setResearchFinalGate, writeResearchArtifact } from "@/paper/research/runtime"
import type { ExportBundle } from "@/paper/research/export"

const now = "2026-05-10T00:00:00Z"
const TEST_MODEL = "test-provider/test-model"
// A full PaperRun renders through the real toolchain (pandoc + a TeX engine) when one is installed,
// which takes minutes on a loaded machine.
const PAPER_RUN_INTEGRATION_TIMEOUT = 300_000

function testModelRoles(): Record<PaperModelRole, string> {
  return Object.fromEntries(PAPER_MODEL_ROLES.map((role) => [role, TEST_MODEL])) as Record<PaperModelRole, string>
}

async function seedTestModelInventory(home: string) {
  await updatePaperModelAllowlist([TEST_MODEL], { home, decision_model: TEST_MODEL })
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
  const dir = await mkdtemp(path.join(os.tmpdir(), "papercode-paperrun-execution-"))
  cleanup.push(dir)
  const workspace = path.join(dir, "workspace")
  const home = path.join(dir, "home")
  await mkdir(path.join(workspace, "src"), { recursive: true })
  await mkdir(home, { recursive: true })
  await seedTestModelInventory(home)
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

async function fixtureProtocolWorkspace() {
  const context = await fixtureWorkspace()
  await writeFile(
    path.join(context.workspace, "package.json"),
    JSON.stringify(
      {
        scripts: {
          typecheck: "bun --version",
          "baseline:toy": "bun --version",
          "ablation:toy": "bun --version",
          "repro:container": "bun --version",
        },
      },
      null,
      2,
    ),
  )
  return context
}

async function fixtureRecoverableProtocolWorkspace() {
  const context = await fixtureWorkspace()
  await writeFile(
    path.join(context.workspace, "package.json"),
    JSON.stringify(
      {
        scripts: {
          typecheck: "bun --version",
          "baseline:toy": "bun --version",
          "ablation:toy": "bun --version",
          "repro:container": "bun run missing-container-script",
        },
      },
      null,
      2,
    ),
  )
  return context
}

function verifiedSourceEvidence(topic: string) {
  return {
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
        license: { status: "clear", expression: "CC BY-NC-SA 4.0", url: "http://creativecommons.org/licenses/by-nc-sa/4.0/" },
        version: { value: "live-arxiv-abs-page", retrieved_at: now, published_at: "2023-05-21" },
        verification: {
          status: "verified",
          method: "unit-test-real-arxiv-record",
          checked_at: now,
          diagnostics: [],
        },
        topics: [topic],
        arxiv_id: "2305.12571",
      },
    ],
  }
}

afterEach(async () => {
  stopAllPaperRunLivePreviews()
  while (cleanup.length > 0) {
    const dir = cleanup.pop()
    if (dir) await clean(dir)
  }
})

describe("PaperRun default execution engine", () => {
  test("snapshot export state preserves failed formats from the final export bundle artifact", async () => {
    const { workspace, home } = await fixtureWorkspace()
    const options = runtimeOptions(workspace, home)
    const handle = await createResearchRun({ topic: "partial export recovery", workspace }, options)
    await setResearchFinalGate(handle.run_dir, { status: "passed", blockers: [] }, options)
    const bundle: ExportBundle = {
      schema_version: "ExportBundle.v1",
      bundle_id: "bundle-final-partial",
      created_at: now,
      status: "final",
      draft_id: "draft-partial",
      final_gate: { status: "passed", blockers: [], updated_at: now },
      verification_summary: { final_gate_status: "passed", failed_checks: [], forced: false },
      files: [
        {
          format: "markdown",
          path: "exports/bundle-final-partial/bundle-final-partial.md",
          mime_type: "text/markdown",
          sha256: "sha-markdown",
          bytes: 10,
          status: "written",
          diagnostics: [],
        },
        {
          format: "pdf",
          path: "exports/bundle-final-partial/bundle-final-partial.pdf",
          mime_type: "application/pdf",
          sha256: "sha-empty",
          bytes: 0,
          status: "failed",
          diagnostics: ["PDF renderer output is not a valid PDF file header."],
        },
      ],
      manifest: {
        schema_version: "PaperExportManifest.v1",
        bundle_id: "bundle-final-partial",
        status: "final",
        final_gate_status: "passed",
        forced: false,
        failed_checks: [],
        path: "exports/bundle-final-partial/manifest.json",
        files: [
          {
            format: "markdown",
            path: "exports/bundle-final-partial/bundle-final-partial.md",
            sha256: "sha-markdown",
            bytes: 10,
            status: "written",
          },
          {
            format: "pdf",
            path: "exports/bundle-final-partial/bundle-final-partial.pdf",
            sha256: "sha-empty",
            bytes: 0,
            status: "failed",
          },
        ],
        source_artifact_ids: ["artifact-source"],
        tool_diagnostics: ["pdf: PDF renderer output is not a valid PDF file header."],
      },
    }
    await writeResearchArtifact(
      handle.run_dir,
      {
        kind: "export",
        logical_path: "exports/export-bundle.json",
        data: bundle,
        metadata: { artifact_schema: "ExportBundle.v1", bundle_id: bundle.bundle_id },
      },
      options,
    )

    const snapshot = await getPaperRunSnapshot(handle.run.run_id, options)

    expect(snapshot.export_state.status).toBe("final")
    expect(snapshot.export_state.formats).toEqual(["markdown"])
    expect(snapshot.export_state.files?.map((file) => `${file.format}:${file.status}`)).toEqual(["markdown:written", "pdf:failed"])
    expect(snapshot.export_state.tool_diagnostics).toEqual(["pdf: PDF renderer output is not a valid PDF file header."])
    expect(snapshot.export_state.message).toContain("pdf export failed")
  })

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
    expect(run.snapshot.artifacts.some((artifact) => artifact.metadata?.artifact_schema === "ExperimentProtocolGuidance.v1")).toBe(true)
    expect(run.snapshot.artifacts.some((artifact) => artifact.metadata?.artifact_schema === "ExperimentProtocolStarterPack.v1")).toBe(true)
    const starterFileArtifacts = run.snapshot.artifacts.filter(
      (artifact) => artifact.metadata?.artifact_schema === "ExperimentProtocolStarterFile.v1",
    )
    expect(starterFileArtifacts.map((artifact) => artifact.metadata?.starter_file_path)).toContain(
      "experiments/starter/Dockerfile.repro",
    )
    expect(run.snapshot.diagnostics.experiment_guidance).toMatchObject({
      status: "needs_protocol",
      final_export_blocked: true,
    })
    expect(run.snapshot.diagnostics.experiment_guidance?.suggestions.map((item) => item.recommended_script)).toContain(
      "repro:container",
    )
    expect(run.snapshot.diagnostics.experiment_starter_pack).toMatchObject({
      status: "ready",
    })
    expect(Object.keys(run.snapshot.diagnostics.experiment_starter_pack?.package_json_scripts ?? {})).toContain(
      "repro:container:starter",
    )
    expect(run.snapshot.diagnostics.experiment_starter_pack?.files.every((file) => Boolean(file.artifact_id))).toBe(true)
    expect(run.snapshot.claim_ledger.length).toBeGreaterThan(0)
    expect(run.snapshot.novelty.checkpoints.length).toBeGreaterThan(0)
    expect(run.snapshot.paper_spine?.readiness).toBe("ready")
    expect(run.snapshot.global_figure?.panels.length).toBeGreaterThan(0)
    expect(run.snapshot.drafts.length).toBeGreaterThan(0)
    const latestDraft = run.snapshot.drafts.at(-1)
    expect(latestDraft).toBeDefined()
    const latestDraftMarkdown = await readFile(path.join(run.run_dir, latestDraft!.path), "utf8")
    expect(latestDraftMarkdown).toContain("实验协议修复清单")
    expect(latestDraftMarkdown).toContain("实验启动包")
    expect(latestDraftMarkdown).toContain("missing_container_reproduction_runner")
    expect(run.snapshot.export_state.status).toBe("blocked")
    expect(run.snapshot.export_state.failed_checks).toContain("reproduction_failure")
    expect(run.snapshot.status).toBe("blocked")
    expect(run.snapshot.controller_state.status).toBe("review_required")
    expect(stageStatus.get("reproduction")).toBe("blocked")
    expect(run.snapshot.experiment_status.reproduction_gate).toBe("blocked")
    const preview = await previewPaperRun(run.run_id, runtimeOptions(workspace, home))
    expect(preview.snapshot.monitor?.experiment_guidance).toMatchObject({
      status: "needs_protocol",
      final_export_blocked: true,
    })
    expect(preview.snapshot.monitor?.experiment_starter_pack).toMatchObject({
      status: "ready",
      apply_endpoint: `/paper/runs/${run.snapshot.run_id}/experiment-starter/apply`,
      recommended_payload: {
        dry_run: false,
        overwrite: false,
        update_package_json: true,
      },
    })
    expect(preview.snapshot.monitor?.experiment_starter_pack?.files.map((file) => file.path)).toContain(
      "experiments/starter/Dockerfile.repro",
    )
    expect(preview.snapshot.monitor?.experiment_starter_pack?.files.every((file) => Boolean(file.artifact_path))).toBe(true)
    expect(preview.snapshot.monitor?.experiment_runs?.some((item) => item.command.startsWith("bun run "))).toBe(true)
    expect(preview.snapshot.monitor?.experiment_runs?.some((item) => item.status !== "succeeded")).toBe(true)
    expect(preview.snapshot.monitor?.experiment_runs?.every((item) => typeof item.wall_time_seconds === "number")).toBe(true)
    expect(preview.snapshot.monitor?.machine_environment).toMatchObject({
      status: "available",
      workspace,
      default_run_root: expect.stringContaining(".papercode"),
    })
    expect(preview.snapshot.monitor?.machine_environment?.runtimes.some((item) => item.id === "bun")).toBe(true)
    expect(preview.snapshot.annotations.some((annotation) => annotation.id.startsWith("experiment-guidance:"))).toBe(true)
    expect(preview.snapshot.annotations.some((annotation) => annotation.id === "experiment-starter-pack")).toBe(true)

    const blockedDiagnostics = run.snapshot.artifacts.filter(
      (artifact) => artifact.metadata?.artifact_schema === "BlockedDiagnostic.v1",
    )
    expect(blockedDiagnostics.length).toBe(0)
  }, PAPER_RUN_INTEGRATION_TIMEOUT)

  test("imported experiment evidence cannot fabricate baselines or container reproduction", async () => {
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
          container_image: "papercode/local-reproduction",
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

    expect(run.snapshot.export_state.status).toBe("blocked")
    expect(run.snapshot.export_state.failed_checks).toContain("reproduction_failure")
    expect(run.snapshot.experiment_status.reproduction_gate).not.toBe("passed")
    expect(run.snapshot.artifacts.some((artifact) => artifact.metadata?.artifact_schema === "ExperimentEvidenceManifest.v1")).toBe(true)
    const hostArtifact = run.snapshot.artifacts.find((artifact) => artifact.path.includes("host-runs"))!
    const runs = JSON.parse(await readFile(path.join(run.run_dir, hostArtifact.path), "utf8"))
    expect(runs.map((item: { experiment_id: string }) => item.experiment_id)).toEqual(["proposed"])
    expect(runs[0].metrics[0].value).toBe(0.94)
    expect(runs[0].execution.kind).toBe("imported")
    const forced = await exportPaperRun(run.run_id, { forced: true }, runtimeOptions(workspace, home))
    expect(forced.status).toBe("forced_draft")
  }, PAPER_RUN_INTEGRATION_TIMEOUT)

  test("a script named repro container is not isolated container evidence", async () => {
    const { workspace, home } = await fixtureProtocolWorkspace()
    await writeFile(
      path.join(workspace, "source-evidence.json"),
      JSON.stringify(verifiedSourceEvidence("显式实验协议驱动的代码论文"), null, 2),
    )
    const run = await createPaperRun(
      {
        topic: "显式实验协议驱动的代码论文",
        workspace_path: workspace,
        code_paths: ["src"],
        paper_files: ["source-evidence.json"],
        target_profile: "cjc-paper",
        target_journal: "中国计算机学报",
        language: "zh-CN",
        budget_tier: "deep",
        model_roles: testModelRoles(),
      },
      runtimeOptions(workspace, home),
    )

    expect(run.snapshot.artifacts.some((artifact) => artifact.metadata?.artifact_schema === "ExperimentProtocol.v1")).toBe(true)
    expect(run.snapshot.experiment_status.reproduction_gate).not.toBe("passed")
    expect(run.snapshot.export_state.status).toBe("blocked")
    const artifact = run.snapshot.artifacts.find((item) => item.path.includes("container-runs"))!
    const runs = JSON.parse(await readFile(path.join(run.run_dir, artifact.path), "utf8"))
    expect(runs.length).toBeGreaterThan(0)
    expect(runs.every((item: { reproduction: { container_reproduced: boolean } }) => !item.reproduction.container_reproduced)).toBe(true)
  }, PAPER_RUN_INTEGRATION_TIMEOUT)

  test("can rerun the current experiment protocol as a controlled PaperRun action", async () => {
    const { workspace, home } = await fixtureProtocolWorkspace()
    const run = await createPaperRun(
      {
        topic: "可手动重跑的实验协议",
        workspace_path: workspace,
        code_paths: ["src"],
        target_profile: "generic-preprint",
        language: "zh-CN",
        budget_tier: "standard",
        model_roles: testModelRoles(),
      },
      runtimeOptions(workspace, home),
    )

    const result = await runPaperRunExperimentProtocol(
      run.run_id,
      { dry_run: false, workspace_path: workspace, timeout_seconds: 30 },
      runtimeOptions(workspace, home),
    )

    expect(result.status).toBe("blocked")
    expect(result.dry_run).toBe(false)
    expect(result.host_runs.some((item) => item.command === "bun run typecheck" && item.status === "succeeded")).toBe(true)
    expect(result.container_runs).toEqual([])
    expect(result.host_runs.every((item) => "peak_memory_mb" in item && "gpu_hours" in item)).toBe(true)
    expect(result.container_runs.every((item) => "peak_memory_mb" in item && "gpu_hours" in item)).toBe(true)
    expect(result.report?.final_claims_allowed).toBe(false)
    expect(result.artifact_ids.length).toBeGreaterThanOrEqual(4)
    const updated = await previewPaperRun(run.run_id, runtimeOptions(workspace, home))
    const updatedRun = await getPaperRunSnapshot(run.run_id, runtimeOptions(workspace, home))
    expect(updated.snapshot.monitor?.experiment_runs?.some((item) => item.environment === "container")).toBe(false)
    expect(updated.snapshot.monitor?.experiment_runs?.every((item) => "peak_memory_mb" in item && "gpu_hours" in item)).toBe(true)
    expect(
      updated.snapshot.monitor?.experiment_terminal_traces?.some(
        (trace) => trace.command === "bun run typecheck" && trace.stdout_bytes >= 0 && trace.output_truncated === false,
      ),
    ).toBe(true)
    expect(result.terminal_traces.length).toBeGreaterThanOrEqual(result.host_runs.length + result.container_runs.length)
    expect(
      result.terminal_traces.some(
        (trace) =>
          trace.command === "bun run typecheck" &&
          trace.status === "succeeded" &&
          trace.stdout_bytes >= 0 &&
          trace.stderr_bytes >= 0 &&
          trace.output_truncated === false,
      ),
    ).toBe(true)
    expect(
      updatedRun.events.some(
        (event) => event.type === "experiment.command.started" && event.payload.command === "bun run typecheck",
      ),
    ).toBe(true)
    expect(updatedRun.events.some((event) => event.type === "experiment.command.completed" && event.payload.environment === "container")).toBe(false)
    const traceArtifact = updatedRun.artifacts.find(
      (artifact) => artifact.metadata?.artifact_schema === "ExperimentTerminalTrace.v1",
    )
    expect(traceArtifact).toBeDefined()
    const traceData = JSON.parse(await readFile(path.join(run.run_dir, traceArtifact!.path), "utf8"))
    expect(traceData.schema_version).toBe("ExperimentTerminalTrace.v1")
    expect(traceData.cwd).toBe(workspace)
    expect(traceData.stdout_excerpt.length).toBeLessThanOrEqual(64 * 1024)
  }, PAPER_RUN_INTEGRATION_TIMEOUT)

  test("successful host scripts cannot clear an unverified reproduction blocker", async () => {
    const { workspace, home } = await fixtureRecoverableProtocolWorkspace()
    await writeFile(path.join(workspace, "source-evidence.json"), JSON.stringify(verifiedSourceEvidence("修复容器复现后的代码论文"), null, 2))
    const run = await createPaperRun(
      {
        topic: "修复容器复现后的代码论文",
        workspace_path: workspace,
        code_paths: ["src"],
        paper_files: ["source-evidence.json"],
        target_profile: "cjc-paper",
        target_journal: "中国计算机学报",
        language: "zh-CN",
        budget_tier: "standard",
        model_roles: testModelRoles(),
      },
      runtimeOptions(workspace, home),
    )

    expect(run.snapshot.export_state.status).toBe("blocked")
    expect(run.snapshot.export_state.failed_checks).toContain("reproduction_failure")
    await writeFile(
      path.join(workspace, "package.json"),
      JSON.stringify(
        {
          scripts: {
            typecheck: "bun --version",
            "baseline:toy": "bun --version",
            "ablation:toy": "bun --version",
            "repro:container": "bun --version",
          },
        },
        null,
        2,
      ),
    )

    const result = await runPaperRunExperimentProtocol(
      run.run_id,
      { dry_run: false, workspace_path: workspace, timeout_seconds: 30 },
      runtimeOptions(workspace, home),
    )
    const updatedRun = await getPaperRunSnapshot(run.run_id, runtimeOptions(workspace, home))

    expect(result.status).toBe("blocked")
    expect(updatedRun.experiment_status.reproduction_gate).not.toBe("passed")
    expect(updatedRun.export_state.failed_checks).toContain("reproduction_failure")
    const exported = await exportPaperRun(run.run_id, { forced: false }, runtimeOptions(workspace, home))
    expect(exported.status).toBe("blocked")
  }, PAPER_RUN_INTEGRATION_TIMEOUT)

  test("applied starter scripts can become the rerun protocol after user completes them", async () => {
    const { workspace, home } = await fixtureWorkspace()
    await writeFile(
      path.join(workspace, "source-evidence.json"),
      JSON.stringify(verifiedSourceEvidence("从 starter 补齐实验协议的代码论文"), null, 2),
    )
    const options = runtimeOptions(workspace, home)
    const run = await createPaperRun(
      {
        topic: "从 starter 补齐实验协议的代码论文",
        workspace_path: workspace,
        code_paths: ["src"],
        paper_files: ["source-evidence.json"],
        target_profile: "cjc-paper",
        target_journal: "中国计算机学报",
        language: "zh-CN",
        budget_tier: "standard",
        model_roles: testModelRoles(),
      },
      options,
    )

    expect(run.snapshot.export_state.status).toBe("blocked")
    expect(run.snapshot.diagnostics.experiment_starter_pack?.status).toBe("ready")
    const applied = await applyPaperRunExperimentStarterPack(
      run.run_id,
      { dry_run: false, update_package_json: true, workspace_path: workspace },
      options,
    )
    expect(applied.status).toBe("ready")

    await writeFile(
      path.join(workspace, "package.json"),
      JSON.stringify(
        {
          scripts: {
            typecheck: "bun --version",
            "baseline:starter": "bun --version",
            "ablation:starter": "bun --version",
            "repro:container:starter": "bun --version",
          },
        },
        null,
        2,
      ),
    )

    const result = await runPaperRunExperimentProtocol(
      run.run_id,
      { dry_run: false, workspace_path: workspace, timeout_seconds: 30 },
      options,
    )

    expect(result.status).toBe("blocked")
    expect(result.planned_commands.map((item) => item.command)).toContain("bun run baseline:starter")
    expect(result.planned_commands.map((item) => item.command)).toContain("bun run ablation:starter")
    expect(result.planned_commands.every((item) => item.environment === "host")).toBe(true)
    expect(result.host_runs.some((item) => item.command === "bun run baseline:starter" && item.status === "succeeded")).toBe(true)
    expect(result.host_runs.some((item) => item.command === "bun run ablation:starter" && item.status === "succeeded")).toBe(true)
    expect(result.container_runs).toEqual([])
    expect(result.report?.final_claims_allowed).toBe(false)

    const exported = await exportPaperRun(run.run_id, { forced: false }, options)
    expect(exported.status).toBe("blocked")
  }, PAPER_RUN_INTEGRATION_TIMEOUT)

  test("code provenance and imported metrics do not imply a verified final experiment", async () => {
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
          container_image: "papercode/local-reproduction",
          container_digest: "sha256:unit-test",
        },
        null,
        2,
      ),
    )
    await writeFile(
      path.join(workspace, "source-evidence.json"),
      JSON.stringify(verifiedSourceEvidence("代码来源、验证文献与复现实验证据"), null, 2),
    )
    const run = await createPaperRun(
      {
        topic: "代码来源、验证文献与复现实验证据",
        workspace_path: workspace,
        code_paths: ["src"],
        paper_files: ["source-evidence.json"],
        experiment_logs: ["experiment-evidence.json"],
        target_profile: "cjc-paper",
        target_journal: "中国计算机学报",
        language: "zh-CN",
        budget_tier: "standard",
        model_roles: testModelRoles(),
      },
      runtimeOptions(workspace, home),
    )

    expect(run.snapshot.source_ledger.some((source) => source.kind === "code")).toBe(true)
    expect(run.snapshot.claim_ledger.every((claim) => claim.source_ids.some((sourceID) => sourceID.startsWith("material:code:")))).toBe(true)
    expect(run.snapshot.experiment_status.reproduction_gate).not.toBe("passed")
    expect(run.snapshot.export_state.status).toBe("blocked")
    expect(run.snapshot.export_state.failed_checks).toContain("reproduction_failure")
    expect(run.snapshot.export_state.artifact_ids).toEqual([...new Set(run.snapshot.export_state.artifact_ids)])
  }, PAPER_RUN_INTEGRATION_TIMEOUT)
})
