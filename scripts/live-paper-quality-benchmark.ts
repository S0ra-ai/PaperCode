import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createPaperRun, exportPaperRun, previewPaperRun } from "../packages/opencode/src/paper"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const outputDir = path.join(repoRoot, "tmp", "live-paper-quality-benchmark")
const summaryPath = path.join(outputDir, "paperrun-summary.json")

const benchmarkRequest = {
  topic: "可验证论文自动化系统的闭环生成与真实性审查",
  workspace_path: repoRoot,
  code_paths: [
    "packages/opencode/src/paper",
    "packages/opencode/src/server/routes/instance/httpapi/handlers/paper.ts",
    "packages/opencode/src/cli/cmd/tui/routes/paper",
  ],
  paper_files: ["README.md"],
  experiment_logs: ["reports/strict-live-acceptance.md"],
  target_profile: "generic-preprint" as const,
  language: "zh-CN",
  budget_tier: "standard" as const,
  quality_mode: "reviewable_bundle" as const,
  data_egress_policy: {
    mode: "private_first" as const,
    allowed_paths: [
      "packages/opencode/src/paper",
      "packages/opencode/src/server/routes/instance/httpapi/handlers/paper.ts",
      "packages/opencode/src/cli/cmd/tui/routes/paper",
      "README.md",
      "reports/strict-live-acceptance.md",
    ],
    denied_patterns: ["**/.env*", "**/.git/**", "**/node_modules/**", "**/*secret*", ".paper_fucker/local/**"],
    external_model_full_text: false,
  },
}

const run = await createPaperRun(benchmarkRequest, { workspace: repoRoot })
const forcedExport = await exportPaperRun(run.run_id, { forced: true }, { workspace: repoRoot })
const preview = await previewPaperRun(run.run_id, { workspace: repoRoot })

const summary = {
  schema_version: "LivePaperQualityBenchmark.v1",
  generated_at: new Date().toISOString(),
  request: benchmarkRequest,
  run_id: run.run_id,
  run_dir: path.relative(repoRoot, run.run_dir).replace(/\\/g, "/"),
  status: run.snapshot.status,
  stage_total: run.snapshot.stage_graph.stages.length,
  stage_statuses: Object.fromEntries(run.snapshot.stage_graph.stages.map((stage) => [stage.id, stage.status])),
  event_count: run.snapshot.events.length,
  source_count: run.snapshot.source_ledger.length,
  claim_count: run.snapshot.claim_ledger.length,
  draft_count: run.snapshot.drafts.length,
  artifact_count: run.snapshot.artifacts.length,
  review_count: run.snapshot.reviews.length,
  export_count: run.snapshot.exports.length,
  export_state: run.snapshot.export_state,
  forced_export: forcedExport,
  preview: {
    readonly: preview.readonly,
    status: preview.status,
    annotation_count: preview.annotations.length,
  },
  diagnostics: run.snapshot.diagnostics,
}

await mkdir(outputDir, { recursive: true })
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8")
console.log(JSON.stringify({ summary_path: path.relative(repoRoot, summaryPath), ...summary }, null, 2))
