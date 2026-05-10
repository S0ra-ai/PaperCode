import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createPaperRun, exportPaperRun, previewPaperRun } from "../packages/opencode/src/paper"

type BenchmarkScenario = "topic" | "code"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")

function argValue(name: string): string | undefined {
  const equals = process.argv.find((item) => item.startsWith(`${name}=`))
  if (equals) return equals.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  if (index >= 0) return process.argv[index + 1]
  return undefined
}

function scenarioFromArgs(): BenchmarkScenario {
  const raw = argValue("--scenario") ?? "topic"
  if (raw === "topic" || raw === "code") return raw
  throw new Error(`Unsupported benchmark scenario: ${raw}`)
}

function assertBenchmark(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function currentProjectVersion(): Promise<string> {
  const readme = await Bun.file(path.join(repoRoot, "README.md")).text()
  return readme.match(/<!-- version:start -->([^<]+)<!-- version:end -->/)?.[1] ?? "unknown"
}

const scenario = scenarioFromArgs()
const outputDir = path.join(repoRoot, "tmp", "live-paper-quality-benchmark", scenario)
const summaryPath = path.join(outputDir, "paperrun-summary.json")

const commonPolicy = {
  mode: "private_first" as const,
  denied_patterns: ["**/.env*", "**/.git/**", "**/node_modules/**", "**/*secret*", ".paper_fucker/local/**"],
  external_model_full_text: false,
}

const codePaths = [
  "packages/opencode/src/paper",
  "packages/opencode/src/server/routes/instance/httpapi/handlers/paper.ts",
  "packages/opencode/src/cli/cmd/tui/routes/paper",
]

const request =
  scenario === "topic"
    ? {
        topic: "可验证论文自动化系统的闭环生成与真实性审查",
        workspace_path: repoRoot,
        paper_files: ["README.md"],
        experiment_logs: ["reports/strict-live-acceptance.md"],
        target_profile: "generic-preprint" as const,
        language: "zh-CN",
        budget_tier: "standard" as const,
        quality_mode: "reviewable_bundle" as const,
        data_egress_policy: {
          ...commonPolicy,
          allowed_paths: ["README.md", "reports/strict-live-acceptance.md"],
        },
      }
    : {
        topic: "paper_fucker 论文工作台代码库的架构与可验证导出机制",
        workspace_path: repoRoot,
        code_paths: codePaths,
        paper_files: ["README.md"],
        experiment_logs: ["reports/strict-live-acceptance.md"],
        target_profile: "generic-preprint" as const,
        language: "zh-CN",
        budget_tier: "standard" as const,
        quality_mode: "reviewable_bundle" as const,
        data_egress_policy: {
          ...commonPolicy,
          allowed_paths: [...codePaths, "README.md", "reports/strict-live-acceptance.md"],
        },
      }

const run = await createPaperRun(request, { workspace: repoRoot })
const forcedExport = await exportPaperRun(run.run_id, { forced: true }, { workspace: repoRoot })
const preview = await previewPaperRun(run.run_id, { workspace: repoRoot })

const artifactSchemas = run.snapshot.artifacts
  .map((artifact) => artifact.metadata?.artifact_schema)
  .filter((schema): schema is string => typeof schema === "string")

const requiredStages = [
  "intake",
  "planning",
  "literature",
  "code_analysis",
  "data",
  "experiment_design",
  "experiment_execution",
  "reproduction",
  "claim_ledger",
  "drafting",
  "profile_formatting",
  "verification",
  "revision",
  "export",
]

const stageStatus = Object.fromEntries(run.snapshot.stage_graph.stages.map((stage) => [stage.id, stage.status]))
for (const stage of requiredStages) assertBenchmark(stage in stageStatus, `Missing stage in benchmark run: ${stage}`)

assertBenchmark(run.snapshot.stage_graph.stages.length >= requiredStages.length, "PaperRun did not build the full stage graph.")
assertBenchmark(run.snapshot.events.length > 0, "PaperRun emitted no events.")
assertBenchmark(run.snapshot.artifacts.length >= 10, "PaperRun produced too few artifacts.")
assertBenchmark(run.snapshot.source_ledger.length > 0, "PaperRun produced no source ledger entries.")
assertBenchmark(run.snapshot.claim_ledger.length > 0, "PaperRun produced no ClaimLedger entries.")
assertBenchmark(run.snapshot.drafts.length > 0, "PaperRun produced no draft.")
assertBenchmark(run.snapshot.reviews.length > 0, "PaperRun produced no review report.")
assertBenchmark(preview.readonly === true && preview.status === "ready", "Preview is not readonly and ready.")
assertBenchmark(preview.annotations.length > 0, "Preview produced no annotations.")
assertBenchmark(forcedExport.status === "forced_draft", "Forced export did not return a forced draft.")
assertBenchmark(forcedExport.files.length >= 4, "Forced export did not write all expected bundle formats.")
assertBenchmark(forcedExport.failed_checks.length > 0, "Forced draft is missing explicit failed checks.")
assertBenchmark(run.snapshot.diagnostics.audit.missing_kinds.length === 0, "Observability audit has missing kinds.")

if (scenario === "topic") {
  assertBenchmark(!("code_paths" in request), "Topic scenario unexpectedly included code paths.")
}

if (scenario === "code") {
  for (const schema of ["CodebaseMap.v1", "MethodExtraction.v1", "ExperimentSurface.v1", "ReproductionPlan.v1"]) {
    assertBenchmark(artifactSchemas.includes(schema), `Code scenario missing artifact schema ${schema}.`)
  }
}

const summary = {
  schema_version: "LivePaperQualityBenchmark.v1",
  project_version: await currentProjectVersion(),
  scenario,
  generated_at: new Date().toISOString(),
  request,
  run_id: run.run_id,
  run_dir: path.relative(repoRoot, run.run_dir).replace(/\\/g, "/"),
  status: run.snapshot.status,
  stage_total: run.snapshot.stage_graph.stages.length,
  stage_statuses: stageStatus,
  event_count: run.snapshot.events.length,
  source_count: run.snapshot.source_ledger.length,
  claim_count: run.snapshot.claim_ledger.length,
  draft_count: run.snapshot.drafts.length,
  artifact_count: run.snapshot.artifacts.length,
  artifact_schemas: [...new Set(artifactSchemas)].sort(),
  review_count: run.snapshot.reviews.length,
  export_count: run.snapshot.exports.length,
  export_state: run.snapshot.export_state,
  forced_export: {
    status: forcedExport.status,
    formats: forcedExport.formats,
    failed_checks: forcedExport.failed_checks,
    file_count: forcedExport.files.length,
    manifest_path: forcedExport.manifest_path,
  },
  preview: {
    readonly: preview.readonly,
    status: preview.status,
    annotation_count: preview.annotations.length,
  },
  diagnostics: {
    counts: run.snapshot.diagnostics.counts,
    final_gate: run.snapshot.diagnostics.final_gate,
    audit: run.snapshot.diagnostics.audit.coverage,
  },
}

await mkdir(outputDir, { recursive: true })
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8")

console.log(
  JSON.stringify(
    {
      summary_path: path.relative(repoRoot, summaryPath).replace(/\\/g, "/"),
      scenario: summary.scenario,
      project_version: summary.project_version,
      run_id: summary.run_id,
      status: summary.status,
      stages: summary.stage_total,
      artifacts: summary.artifact_count,
      claims: summary.claim_count,
      forced_export: summary.forced_export.status,
      failed_checks: summary.forced_export.failed_checks,
      preview: summary.preview.status,
    },
    null,
    2,
  ),
)
