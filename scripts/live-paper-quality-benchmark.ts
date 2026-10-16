import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  applyPaperRunExperimentStarterPack,
  createPaperRun,
  exportPaperRun,
  getPaperRunSnapshot,
  previewPaperRun,
  runPaperRunExperimentProtocol,
  stopAllPaperRunLivePreviews,
} from "../packages/opencode/src/paper"

type BenchmarkScenario = "topic" | "code" | "final" | "protocol" | "starter-rerun"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const benchmarkOutputRoot = process.env.PAPERCODE_BENCHMARK_OUTPUT_ROOT
  ? path.resolve(process.env.PAPERCODE_BENCHMARK_OUTPUT_ROOT)
  : path.join(repoRoot, "tmp", "live-paper-quality-benchmark")

function argValue(name: string): string | undefined {
  const equals = process.argv.find((item) => item.startsWith(`${name}=`))
  if (equals) return equals.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  if (index >= 0) return process.argv[index + 1]
  return undefined
}

function scenarioFromArgs(): BenchmarkScenario {
  const raw = argValue("--scenario") ?? "topic"
  if (raw === "topic" || raw === "code" || raw === "final" || raw === "protocol" || raw === "starter-rerun") return raw
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
const scenarioOutputRoot = path.join(benchmarkOutputRoot, scenario)
const attemptId = `attempt-${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`
const outputDir = path.join(scenarioOutputRoot, "attempts", attemptId)
const summaryPath = path.join(outputDir, "paperrun-summary.json")
const publishedSummaryPath = path.join(scenarioOutputRoot, "paperrun-summary.json")
const attemptErrorPath = path.join(outputDir, "attempt-error.json")
const attemptReadmePath = path.join(outputDir, "README.md")
await mkdir(outputDir, { recursive: true })
await writeFile(path.join(scenarioOutputRoot, "last-attempt.txt"), `${path.relative(scenarioOutputRoot, outputDir).replace(/\\/g, "/")}\n`, "utf8")
let benchmarkErrorRecorded = false

function repoRelative(value: string) {
  return path.relative(repoRoot, value).replace(/\\/g, "/")
}

async function writeAttemptReadme(status: "running" | "succeeded" | "failed", details: Record<string, unknown> = {}) {
  const lines = [
    "# Live Paper Quality Benchmark Attempt",
    "",
    `- status: ${status}`,
    `- scenario: ${scenario}`,
    `- project_version: ${await currentProjectVersion()}`,
    `- generated_at: ${new Date().toISOString()}`,
    `- attempt_dir: ${repoRelative(outputDir)}`,
    `- attempt_summary: ${repoRelative(summaryPath)}`,
    `- attempt_error: ${repoRelative(attemptErrorPath)}`,
    `- published_summary: ${repoRelative(publishedSummaryPath)}`,
    ...Object.entries(details).map(([key, value]) => `- ${key}: ${String(value)}`),
    "",
    "Published summaries are updated only after a successful benchmark attempt. Failed or interrupted attempts keep diagnostics inside the attempt directory.",
    "",
  ]
  await writeFile(attemptReadmePath, lines.join("\n"), "utf8")
}

await writeAttemptReadme("running")

function errorDetails(error: unknown) {
  const code = benchmarkErrorCode(error)
  if (error instanceof Error) {
    return {
      code,
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return {
    code,
    name: "NonError",
    message: String(error),
    stack: undefined,
  }
}

function benchmarkErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/interrupted by SIGINT|terminated by SIGTERM/i.test(message)) return "benchmark_interrupted"
  if (/live arXiv source discovery timed out|Timeout|timed out/i.test(message)) return "source_discovery_timeout"
  if (/live arXiv source discovery blocked by rate limit|HTTP 429|Too Many Requests/i.test(message)) return "source_discovery_rate_limited"
  if (/No verified arXiv sources|source candidates|metadata missing|arXiv metadata mismatch/i.test(message)) {
    return "source_verification_failed"
  }
  if (/schema|AJV|validation|validate/i.test(message)) return "schema_validation_failed"
  if (/export|final export|forced draft|PDF|DOCX|manifest/i.test(message)) return "export_failed"
  if (/model|provider|allowlist|decision model/i.test(message)) return "model_configuration_failed"
  return "benchmark_failed"
}

async function recordBenchmarkAttemptError(error: unknown) {
  if (benchmarkErrorRecorded) return
  benchmarkErrorRecorded = true
  const payload = {
    schema_version: "LivePaperQualityBenchmarkAttemptError.v1",
    project_version: await currentProjectVersion(),
    scenario,
    generated_at: new Date().toISOString(),
    attempt_dir: repoRelative(outputDir),
    published_summary_path: repoRelative(publishedSummaryPath),
    error: errorDetails(error),
  }
  await writeFile(attemptErrorPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  await writeAttemptReadme("failed", {
    error_code: payload.error.code,
    error_message: payload.error.message,
  })
  await writeFile(
    path.join(scenarioOutputRoot, "last-failed-attempt.txt"),
    `${path.relative(scenarioOutputRoot, outputDir).replace(/\\/g, "/")}\n`,
    "utf8",
  )
  console.error(
    JSON.stringify(
      {
        attempt_error_path: repoRelative(attemptErrorPath),
        scenario: payload.scenario,
        project_version: payload.project_version,
        code: payload.error.code,
        error: payload.error.message,
      },
      null,
      2,
    ),
  )
}

function installBenchmarkFailureRecorder() {
  let finalizing = false
  const finalizeFailure = (error: unknown) => {
    if (finalizing) return
    finalizing = true
    void recordBenchmarkAttemptError(error)
      .catch((recordError) => {
        console.error(`Failed to record live benchmark attempt error: ${recordError instanceof Error ? recordError.message : String(recordError)}`)
      })
      .finally(() => {
        stopAllPaperRunLivePreviews()
        process.exit(1)
      })
  }
  process.on("uncaughtException", finalizeFailure)
  process.on("unhandledRejection", finalizeFailure)
  process.on("SIGINT", () => finalizeFailure(new Error("live benchmark interrupted by SIGINT")))
  process.on("SIGTERM", () => finalizeFailure(new Error("live benchmark terminated by SIGTERM")))
}

installBenchmarkFailureRecorder()

if (process.env.PAPERCODE_BENCHMARK_SELF_TEST_FAILURE === "1") {
  throw new Error("live benchmark self-test failure recorder")
}

async function publishBenchmarkSummary(summary: unknown) {
  const content = `${JSON.stringify(summary, null, 2)}\n`
  await writeFile(summaryPath, content, "utf8")
  const tmpSummaryPath = `${publishedSummaryPath}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmpSummaryPath, content, "utf8")
  await rm(publishedSummaryPath, { force: true })
  await rename(tmpSummaryPath, publishedSummaryPath)
  await writeFile(
    path.join(scenarioOutputRoot, "last-successful-attempt.txt"),
    `${path.relative(scenarioOutputRoot, outputDir).replace(/\\/g, "/")}\n`,
    "utf8",
  )
  const summaryRecord = summary && typeof summary === "object" ? (summary as Record<string, unknown>) : {}
  await writeAttemptReadme("succeeded", {
    run_id: summaryRecord.run_id ?? "unknown",
    run_status: summaryRecord.status ?? "unknown",
  })
}

function summaryOutput(summary: Record<string, unknown>, extra: Record<string, unknown>) {
  return JSON.stringify(
    {
      summary_path: path.relative(repoRoot, publishedSummaryPath).replace(/\\/g, "/"),
      attempt_summary_path: path.relative(repoRoot, summaryPath).replace(/\\/g, "/"),
      scenario: summary.scenario,
      project_version: summary.project_version,
      run_id: summary.run_id,
      status: summary.status,
      ...extra,
    },
    null,
    2,
  )
}

const commonPolicy = {
  mode: "private_first" as const,
  denied_patterns: ["**/.env*", "**/.git/**", "**/node_modules/**", "**/*secret*", ".papercode/local/**"],
  external_model_full_text: false,
}

const codePaths = [
  "packages/opencode/src/paper",
  "packages/opencode/src/server/routes/instance/httpapi/handlers/paper.ts",
  "packages/opencode/src/cli/cmd/tui/routes/paper",
]

const cjcBenchmarkTarget = {
  target_profile: "cjc-paper" as const,
  target_journal: "中国计算机学报",
  target_journal_url: "https://cjc.ict.ac.cn/",
}

type VerifiedArxivSource = Awaited<ReturnType<typeof fetchVerifiedArxivSource>>

function queryTerms(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 4),
  )
}

function sourceKeywordOverlap(source: Pick<VerifiedArxivSource, "title" | "abstract">, terms: Set<string>) {
  const text = `${source.title} ${source.abstract ?? ""}`.toLowerCase()
  let hits = 0
  for (const term of terms) {
    if (text.includes(term)) hits++
  }
  return terms.size > 0 ? hits / terms.size : 0
}

function sourceRecency(source: VerifiedArxivSource) {
  const year = Number(String(source.version.published_at ?? "").slice(0, 4))
  if (!Number.isFinite(year) || year <= 0) return 0.5
  return Math.max(0, Math.min(1, (year - 2018) / 8))
}

function sourceEvidenceCompleteness(source: VerifiedArxivSource) {
  const checks = [
    source.verification.status === "verified",
    Boolean(source.title),
    Boolean(source.authors?.length),
    Boolean(source.abstract),
    Boolean(source.arxiv_id),
    Boolean(source.version.published_at),
  ]
  return checks.filter(Boolean).length / checks.length
}

function protocolPaperRankingFit(source: Pick<VerifiedArxivSource, "title" | "abstract">) {
  const title = source.title.toLowerCase()
  const text = `${source.title} ${source.abstract ?? ""}`.toLowerCase()
  let score = 0
  if (/(literature retrieval|paper recommendation|research discovery|document indexing|scholarly recommendation|scientific literature)/i.test(text)) {
    score += 0.45
  }
  if (/(retrieval|ranking|rank|recommendation|re-ranking|reranking|indexing|benchmark)/i.test(title)) score += 0.3
  if (/(paper|literature|document|academic|scholarly|scientific)/i.test(title)) score += 0.2
  if (/(ndcg|precision|recall|baseline|dataset|relevance)/i.test(text)) score += 0.15
  return Math.max(0, Math.min(1, score))
}

function liveArxivRankingDataset(sources: VerifiedArxivSource[], query: string, createdAt: string) {
  const terms = queryTerms(query)
  const dataset = {
    schema_version: "LiveArxivRankingDataset.v1",
    created_at: createdAt,
    provenance: "live-arxiv-search+abs-page",
    query,
    label_policy:
      "Deterministic validation labels derived from live arXiv search rank, paper-ranking topic fit, source metadata completeness, and publication recency; not human relevance ground truth.",
    candidates: sources.map((source, index) => {
      const overlap = sourceKeywordOverlap(source, terms)
      const evidence = sourceEvidenceCompleteness(source)
      const recency = sourceRecency(source)
      const topicFit = protocolPaperRankingFit(source)
      const searchRankPrior = 1 - index / Math.max(sources.length, 1)
      return {
        id: source.source_id,
        arxiv_id: source.arxiv_id,
        title: source.title,
        abstract: source.abstract ?? "",
        relevance: Number(Math.max(1, Math.min(3, 1 + topicFit * 1.5 + searchRankPrior * 0.35 + overlap * 0.15 + evidence * 0.05 + recency * 0.05)).toFixed(4)),
        claim_coverage: Number(evidence.toFixed(4)),
        recency: Number(recency.toFixed(4)),
        source_rank: index + 1,
      }
    }),
  }
  assertProtocolRankingSignal(dataset)
  return dataset
}

function benchmarkDcg(values: number[]) {
  return values.reduce((sum, value, index) => sum + (Math.pow(2, value) - 1) / Math.log2(index + 2), 0)
}

function benchmarkNdcgAt3(candidates: ReturnType<typeof liveArxivRankingDataset>["candidates"], ranked: ReturnType<typeof liveArxivRankingDataset>["candidates"]) {
  const actual = benchmarkDcg(ranked.slice(0, 3).map((item) => item.relevance))
  const ideal = benchmarkDcg(candidates.toSorted((left, right) => right.relevance - left.relevance).slice(0, 3).map((item) => item.relevance))
  return Number((actual / ideal).toFixed(4))
}

function generatedLexicalScore(item: ReturnType<typeof liveArxivRankingDataset>["candidates"][number], terms: Set<string>) {
  const titleTerms = item.title.toLowerCase().split(/\W+/).filter(Boolean)
  return titleTerms.filter((term) => terms.has(term)).length / Math.max(terms.size, 1)
}

function assertProtocolRankingSignal(dataset: ReturnType<typeof liveArxivRankingDataset>) {
  const terms = queryTerms(dataset.query)
  const candidates = dataset.candidates
  const distinctRelevance = new Set(candidates.map((item) => item.relevance.toFixed(4)))
  const proposed = benchmarkNdcgAt3(
    candidates,
    candidates.toSorted(
      (left, right) =>
        right.relevance * 0.62 + right.claim_coverage * 0.28 + right.recency * 0.1 -
        (left.relevance * 0.62 + left.claim_coverage * 0.28 + left.recency * 0.1),
    ),
  )
  const baseline = benchmarkNdcgAt3(
    candidates,
    candidates.toSorted((left, right) => generatedLexicalScore(right, terms) - generatedLexicalScore(left, terms)),
  )
  const ablation = benchmarkNdcgAt3(candidates, candidates.toSorted((left, right) => right.recency - left.recency))
  assertBenchmark(
    distinctRelevance.size >= 3 && proposed > baseline && proposed > ablation,
    `Protocol scenario generated a degenerate ranking benchmark: proposed=${proposed}, baseline=${baseline}, ablation=${ablation}, relevance_levels=${distinctRelevance.size}`,
  )
}

function protocolReferenceSources(sources: VerifiedArxivSource[]) {
  const selected = sources.filter((source) => protocolPaperRankingFit(source) >= 0.3)
  assertBenchmark(
    selected.length >= 3,
    `Protocol scenario found only ${selected.length} paper-ranking reference sources after relevance filtering.`,
  )
  return selected.slice(0, 5)
}

async function protocolBenchmarkWorkspace(dataset: ReturnType<typeof liveArxivRankingDataset>) {
  const workspace = path.join(outputDir, "workspace")
  await mkdir(path.join(workspace, "src"), { recursive: true })
  await mkdir(path.join(workspace, "experiments"), { recursive: true })
  await writeFile(
    path.join(workspace, "src", "agent-team-paper.ts"),
    [
      "export type AgentExperiment = { id: string; title: string; abstract: string; relevance: number; claim_coverage: number; recency: number }",
      "",
      "export function rankAgentTeamPapers(items: AgentExperiment[]) {",
      "  return items.toSorted((left, right) => scorePaper(right) - scorePaper(left))",
      "}",
      "",
      "export function scorePaper(item: AgentExperiment) {",
      "  return item.relevance * 0.62 + item.claim_coverage * 0.28 + item.recency * 0.10",
      "}",
      "",
      "export function claimLedgerCoverage(claims: Array<{ supported: boolean }>) {",
      "  return claims.filter((claim) => claim.supported).length / Math.max(claims.length, 1)",
      "}",
      "",
    ].join("\n"),
    "utf8",
  )
  await writeFile(
    path.join(workspace, "experiments", "agent-ranking-dataset.json"),
    `${JSON.stringify(dataset, null, 2)}\n`,
    "utf8",
  )
  await writeFile(
    path.join(workspace, "experiments", "evaluate-agent-ranking.ts"),
    [
      "import { rankAgentTeamPapers, type AgentExperiment } from '../src/agent-team-paper'",
      "",
      "type Variant = 'proposed' | 'baseline' | 'ablation' | 'all'",
      "const variant = ((Bun.argv.find((item) => item.startsWith('--variant='))?.split('=')[1]) ?? 'proposed') as Variant",
      "const data = await Bun.file(new URL('./agent-ranking-dataset.json', import.meta.url)).json() as { query: string; candidates: AgentExperiment[] }",
      "const queryTerms = new Set(data.query.toLowerCase().split(/\\W+/).filter(Boolean))",
      "",
      "function lexicalScore(item: AgentExperiment) {",
      "  const titleTerms = item.title.toLowerCase().split(/\\W+/).filter(Boolean)",
      "  return titleTerms.filter((term) => queryTerms.has(term)).length / Math.max(queryTerms.size, 1)",
      "}",
      "",
      "function ablationScore(item: AgentExperiment) {",
      "  return item.recency",
      "}",
      "",
      "function dcg(values: number[]) {",
      "  return values.reduce((sum, value, index) => sum + (Math.pow(2, value) - 1) / Math.log2(index + 2), 0)",
      "}",
      "",
      "function ndcgAt3(ranked: AgentExperiment[]) {",
      "  const actual = dcg(ranked.slice(0, 3).map((item) => item.relevance))",
      "  const ideal = dcg(data.candidates.toSorted((left, right) => right.relevance - left.relevance).slice(0, 3).map((item) => item.relevance))",
      "  return Number((actual / ideal).toFixed(4))",
      "}",
      "",
      "function ranking(name: Exclude<Variant, 'all'>) {",
      "  if (name === 'proposed') return rankAgentTeamPapers(data.candidates)",
      "  if (name === 'baseline') return data.candidates.toSorted((left, right) => lexicalScore(right) - lexicalScore(left))",
      "  return data.candidates.toSorted((left, right) => ablationScore(right) - ablationScore(left))",
      "}",
      "",
      "function metric(experiment_id: string, name: Exclude<Variant, 'all'>) {",
      "  const ranked = ranking(name)",
      "  return {",
      "    experiment_id,",
      "    role: name,",
      "    label: name,",
      "    metrics: [{ name: 'ranking_ndcg_at_3', value: ndcgAt3(ranked), direction: 'higher_better', unit: 'ratio' }],",
      "    ranked_ids: ranked.slice(0, 3).map((item) => item.id),",
      "  }",
      "}",
      "",
      "const outputs = {",
      "  proposed: metric('proposed', 'proposed'),",
      "  baseline: metric('baseline:ranking-lexical', 'baseline'),",
      "  ablation: metric('ablation:ranking-no-coverage', 'ablation'),",
      "}",
      "",
      "if (variant === 'all') {",
      "  console.log('PAPERCODE_METRICS ' + JSON.stringify([outputs.proposed, outputs.baseline, outputs.ablation]))",
      "} else {",
      "  const selected = outputs[variant]",
      "  console.log('PAPERCODE_METRIC ' + JSON.stringify(selected.metrics[0]))",
      "  console.log(`top3=${selected.ranked_ids.join(',')}`)",
      "}",
      "",
    ].join("\n"),
    "utf8",
  )
  await writeFile(
    path.join(workspace, "package.json"),
    `${JSON.stringify(
      {
        name: "papercode-live-ranking-protocol",
        version: "0.1.0",
        license: "MPL-2.0",
        repository: {
          type: "git",
          url: "https://github.com/S0ra-ai/PaperCode",
        },
        scripts: {
          "test:ranking": "bun run experiments/evaluate-agent-ranking.ts --variant=proposed",
          "baseline:ranking-lexical": "bun run experiments/evaluate-agent-ranking.ts --variant=baseline",
          "ablation:ranking-no-coverage": "bun run experiments/evaluate-agent-ranking.ts --variant=ablation",
          "repro:container": "bun run experiments/evaluate-agent-ranking.ts --variant=all",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  )
  return workspace
}

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  }
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match)
    .replace(/\s+/g, " ")
    .trim()
}

function htmlMetaContent(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`<meta\\s+[^>]*name=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`, "i")
  const matched = html.match(pattern)
  return matched?.[1] ? decodeHtml(matched[1]) : undefined
}

function htmlMetaContents(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`<meta\\s+[^>]*name=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`, "gi")
  return [...html.matchAll(pattern)].map((match) => decodeHtml(match[1] ?? "")).filter(Boolean)
}

function htmlLinkHrefByClass(html: string, className: string) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`<a\\s+[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*${escaped}[^"']*["'][^>]*>`, "i")
  const matched = html.match(pattern)
  return matched?.[1] ? decodeHtml(matched[1]) : undefined
}

function isoDateFromArxiv(value: string | undefined) {
  if (!value) return undefined
  const matched = value.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  if (!matched) return value
  return `${matched[1]}-${matched[2]}-${matched[3]}`
}

function licenseExpressionFromUrl(url: string | undefined) {
  if (!url) return undefined
  if (/creativecommons\.org\/licenses\/by-nc-sa\/4\.0/i.test(url)) return "CC BY-NC-SA 4.0"
  if (/creativecommons\.org\/licenses\/by\/4\.0/i.test(url)) return "CC BY 4.0"
  return url
}

const arxivUserAgent = "papercode-live-benchmark/1.0 (+https://github.com/S0ra-ai/PaperCode)"

function benchmarkBoundedIntEnv(name: string, fallback: number, bounds: { min: number; max: number }) {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.max(bounds.min, Math.min(bounds.max, Math.floor(value)))
}

const arxivFetchTimeoutMs = benchmarkBoundedIntEnv("PAPERCODE_BENCHMARK_ARXIV_FETCH_TIMEOUT_MS", 15_000, {
  min: 1_000,
  max: 30_000,
})
const arxivMaxAttempts = benchmarkBoundedIntEnv("PAPERCODE_BENCHMARK_ARXIV_MAX_ATTEMPTS", 3, {
  min: 1,
  max: 5,
})
const arxivQueryBudgetMs = benchmarkBoundedIntEnv("PAPERCODE_BENCHMARK_ARXIV_QUERY_BUDGET_MS", 90_000, {
  min: 15_000,
  max: 120_000,
})
const arxivVerificationCandidateLimit = benchmarkBoundedIntEnv("PAPERCODE_BENCHMARK_ARXIV_VERIFY_LIMIT", 6, {
  min: 3,
  max: 8,
})
const protocolBenchmarkBudgetMs = benchmarkBoundedIntEnv("PAPERCODE_BENCHMARK_SOURCE_BUDGET_MS", 240_000, {
  min: 30_000,
  max: 300_000,
})

function arxivRetryDelayMs(message: string, attempt: number) {
  if (/HTTP 429|Too Many Requests/i.test(message)) return 15_000 * attempt
  if (/Timeout/i.test(message)) return 5_000 * attempt
  return 1_000 * attempt
}

function ensureBeforeDeadline(deadlineMs: number | undefined, context: string) {
  if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
    throw new Error(`live arXiv source discovery timed out: ${context}`)
  }
}

function deadlineSignal(deadlineMs: number | undefined, context: string) {
  ensureBeforeDeadline(deadlineMs, context)
  const remaining = deadlineMs === undefined ? arxivFetchTimeoutMs : deadlineMs - Date.now()
  return AbortSignal.timeout(Math.max(1, Math.min(arxivFetchTimeoutMs, Math.floor(remaining))))
}

function childDeadline(parentDeadlineMs: number, budgetMs: number) {
  return Math.min(parentDeadlineMs, Date.now() + budgetMs)
}

async function fetchArxivText(url: string, options: { deadlineMs?: number; context?: string } = {}) {
  const failures: string[] = []
  const context = options.context ?? url
  for (let attempt = 1; attempt <= arxivMaxAttempts; attempt++) {
    try {
      ensureBeforeDeadline(options.deadlineMs, context)
      const response = await fetch(url, {
        headers: {
          "user-agent": arxivUserAgent,
        },
        signal: deadlineSignal(options.deadlineMs, context),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
      return await response.text()
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      failures.push(`attempt ${attempt}: ${message}`)
      if (attempt < arxivMaxAttempts) {
        const retryDelay = arxivRetryDelayMs(message, attempt)
        const remaining = options.deadlineMs === undefined ? retryDelay : Math.max(0, options.deadlineMs - Date.now())
        if (remaining > 0) await Bun.sleep(Math.min(retryDelay, remaining))
      }
    }
  }
  const rateLimited = failures.some((failure) => /HTTP 429|Too Many Requests/i.test(failure))
  const timedOut = failures.some((failure) => /Timeout|timed out/i.test(failure))
  const prefix = rateLimited
    ? "live arXiv source discovery blocked by rate limit"
    : timedOut
      ? "live arXiv source discovery timed out"
      : "arXiv fetch failed"
  throw new Error(`${prefix} after retries: ${url}; ${failures.join("; ")}`)
}

async function discoverArxivIds(query: string, deadlineMs: number) {
  const url = `https://arxiv.org/search/?query=${encodeURIComponent(query)}&searchtype=all&abstracts=show&size=25`
  let html = ""
  let searchFailure: string | undefined
  try {
    html = await fetchArxivText(url, { deadlineMs, context: `arXiv HTML search for query: ${query}` })
  } catch (error) {
    searchFailure = error instanceof Error ? error.message : String(error)
  }
  if (!searchFailure) {
    const ids = [...html.matchAll(/\/abs\/(\d{4}\.\d{4,5})(?:v\d+)?/g)].map((match) => match[1])
    return {
      url,
      ids: [...new Set(ids)],
    }
  }
  const apiQuery = query
    .split(/[^a-zA-Z0-9]+/)
    .filter((term) => term.length > 0)
    .map((term) => `all:${term}`)
    .join(" AND ")
  const apiUrl = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(apiQuery)}&start=0&max_results=25`
  const atom = await fetchArxivText(apiUrl, { deadlineMs, context: `arXiv Atom fallback for query: ${query}` })
  const ids = [...atom.matchAll(/<id>https?:\/\/arxiv\.org\/abs\/(\d{4}\.\d{4,5})(?:v\d+)?<\/id>/g)].map((match) => match[1])
  assertBenchmark(ids.length > 0, `arXiv HTML search failed and Atom API returned no candidates. HTML failure: ${searchFailure}`)
  return {
    url: apiUrl,
    ids: [...new Set(ids)],
  }
}

async function fetchVerifiedArxivSource(
  arxivID: string,
  checkedAt: string,
  options: {
    discovery_query?: string
    discovery_url?: string
    deadlineMs?: number
    topics: string[]
  },
) {
  const url = `https://arxiv.org/abs/${encodeURIComponent(arxivID)}`
  const html = await fetchArxivText(url, { deadlineMs: options.deadlineMs, context: `arXiv abs verification for ${arxivID}` })
  const pageArxivID = htmlMetaContent(html, "citation_arxiv_id")
  const title = htmlMetaContent(html, "citation_title")
  const authors = htmlMetaContents(html, "citation_author")
  const abstract = htmlMetaContent(html, "citation_abstract")
  const publishedAt = isoDateFromArxiv(htmlMetaContent(html, "citation_date"))
  const canonical = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1]
  const licenseUrl = htmlLinkHrefByClass(html, "has_license")
  const licenseExpression = licenseExpressionFromUrl(licenseUrl)
  assertBenchmark(pageArxivID === arxivID, `arXiv metadata mismatch: expected ${arxivID}, got ${pageArxivID ?? "missing"}`)
  assertBenchmark(title, `arXiv metadata missing title for ${arxivID}`)
  assertBenchmark(authors.length > 0, `arXiv metadata missing authors for ${arxivID}`)
  assertBenchmark(abstract, `arXiv metadata missing abstract for ${arxivID}`)
  assertBenchmark(publishedAt, `arXiv metadata missing publication date for ${arxivID}`)
  return {
    source_id: `paper:arxiv:${arxivID}`,
    kind: "paper" as const,
    title,
    url: canonical ? decodeHtml(canonical).replace(/v\d+$/, "") : url,
    provider: "arxiv",
    license: {
      status: licenseExpression ? ("clear" as const) : ("unclear" as const),
      expression: licenseExpression ?? "license metadata not present on arXiv abs page",
      url: licenseUrl,
    },
    version: { value: "live-arxiv-abs-page", retrieved_at: checkedAt, published_at: publishedAt },
    verification: {
      status: "verified" as const,
      method: "live-arxiv-abs-page",
      checked_at: checkedAt,
      diagnostics: [
        `fetched:${url}`,
        ...(options.discovery_query ? [`discovered_by:live-arxiv-search:${options.discovery_query}`] : []),
        ...(options.discovery_url ? [`search_url:${options.discovery_url}`] : []),
      ],
    },
    topics: options.topics,
    authors,
    abstract,
    arxiv_id: arxivID,
  }
}

function assertNoBenchmarkSourceResidue(value: unknown, context: string) {
  const text = JSON.stringify(value)
  const residuePatterns = [
    /\bpaper-[abc]\b/i,
    new RegExp(`\\b${["search", "seed"].join("-")}\\b`, "i"),
    new RegExp(`\\b${["source", "discovery", "seed"].join("\\s+")}\\b`, "i"),
    /\bmo(?:ck)\b/i,
    /\bfa(?:ke)\b/i,
    /\bfix(?:ture)\b/i,
    /\bpseu(?:do)\b/i,
    /\bplace(?:holder)\b/i,
    /\bstrict-live-final-export-source-verification\b/i,
    /\bstrict-live-local-source-manifest\b/i,
    /\bverified-architecture-source\b/i,
  ]
  const residue = residuePatterns.map((pattern) => text.match(pattern)?.[0]).find((match): match is string => Boolean(match))
  assertBenchmark(!residue, `Benchmark source evidence contains non-authentic residue (${residue?.[0]}) in ${context}.`)
}

function assertAuthenticVerifiedArxivSources(sources: VerifiedArxivSource[], context: string) {
  assertBenchmark(sources.length > 0, `No verified arXiv sources were discovered for ${context}.`)
  for (const source of sources) {
    assertBenchmark(source.provider === "arxiv", `Non-arXiv provider entered live benchmark sources: ${source.provider}`)
    assertBenchmark(Boolean(source.arxiv_id), `Verified arXiv source is missing arxiv_id: ${source.source_id}`)
    assertBenchmark(Boolean(source.authors?.length), `Verified arXiv source is missing authors: ${source.source_id}`)
    assertBenchmark(
      /^\d{4}\.\d{4,5}$/.test(source.arxiv_id),
      `Verified arXiv source has an invalid arxiv_id: ${source.arxiv_id}`,
    )
    assertBenchmark(
      source.source_id === `paper:arxiv:${source.arxiv_id}`,
      `Verified arXiv source_id does not match arxiv_id: ${source.source_id}`,
    )
    assertBenchmark(
      source.url === `https://arxiv.org/abs/${source.arxiv_id}`,
      `Verified arXiv source URL is not the canonical abs URL: ${source.url}`,
    )
    assertBenchmark(
      source.verification.status === "verified" && source.verification.method === "live-arxiv-abs-page",
      `Verified arXiv source has invalid verification metadata: ${source.source_id}`,
    )
    assertBenchmark(
      source.verification.diagnostics?.some((item) => item === `fetched:https://arxiv.org/abs/${source.arxiv_id}`),
      `Verified arXiv source is missing fetched abs-page diagnostic: ${source.source_id}`,
    )
  }
  assertNoBenchmarkSourceResidue(sources, context)
}

async function discoverVerifiedArxivSources(query: string, checkedAt: string, topics: string[], deadlineMs: number) {
  const discovered = await discoverArxivIds(query, deadlineMs)
  assertBenchmark(discovered.ids.length > 0, `arXiv live search returned no source candidates for query: ${query}`)
  const failures: string[] = []
  const sources: VerifiedArxivSource[] = []
  for (const arxivID of discovered.ids.slice(0, arxivVerificationCandidateLimit)) {
    ensureBeforeDeadline(deadlineMs, `verifying arXiv sources for query: ${query}`)
    try {
      sources.push(await fetchVerifiedArxivSource(arxivID, checkedAt, {
        discovery_query: query,
        discovery_url: discovered.url,
        deadlineMs,
        topics,
      }))
    } catch (error) {
      failures.push(`${arxivID}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  assertBenchmark(
    sources.length >= 3,
    `arXiv live search returned ${sources.length} verified sources; at least 3 are required for the live ranking benchmark. ${failures.join("; ")}`,
  )
  const verifiedSources = sources.slice(0, 5)
  assertAuthenticVerifiedArxivSources(verifiedSources, `query:${query}`)
  return verifiedSources
}

async function protocolSourceManifest(workspace: string, sources: VerifiedArxivSource[], createdAt: string) {
  assertAuthenticVerifiedArxivSources(sources, "SourceEvidenceManifest.v1")
  const manifestPath = path.join(workspace, "source-evidence.json")
  const manifest = {
    schema_version: "SourceEvidenceManifest.v1",
    created_at: createdAt,
    provenance: "live-arxiv-search+abs-page",
    sources,
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  return "source-evidence.json"
}

const protocolBenchmarkQueries = [
  "paper recommendation ranking",
  "scholarly document ranking benchmark",
  "scientific literature retrieval evaluation",
  "academic paper recommendation benchmark",
]

async function protocolBenchmarkDataset(createdAt: string, topics: string[]) {
  const failures: string[] = []
  const deadlineMs = Date.now() + protocolBenchmarkBudgetMs
  for (const query of protocolBenchmarkQueries) {
    ensureBeforeDeadline(deadlineMs, "building protocol benchmark live arXiv sources")
    try {
      const sources = await discoverVerifiedArxivSources(query, createdAt, topics, childDeadline(deadlineMs, arxivQueryBudgetMs))
      const dataset = liveArxivRankingDataset(sources, query, createdAt)
      assertNoBenchmarkSourceResidue(dataset, "LiveArxivRankingDataset.v1")
      return { query, sources, dataset }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push(`${query}: ${message}`)
      if (/live arXiv source discovery blocked by rate limit/i.test(message)) break
    }
  }
  throw new Error(
    `Protocol scenario could not build a non-degenerate live ranking benchmark from authorized arXiv queries. ${failures.join(" | ")}`,
  )
}

async function protocolBenchmarkInputs() {
  const createdAt = new Date().toISOString()
  const topics = ["学术论文排序", "信息检索评测", "基线", "消融", "容器复现"]
  const { sources, dataset } = await protocolBenchmarkDataset(createdAt, topics)
  const workspace = await protocolBenchmarkWorkspace(dataset)
  const sourceManifestPath = await protocolSourceManifest(workspace, protocolReferenceSources(sources), createdAt)
  return { workspace, sourceManifestPath, datasetPath: "experiments/agent-ranking-dataset.json" }
}

async function starterRerunBenchmarkWorkspace() {
  const workspace = path.join(outputDir, "workspace")
  await mkdir(path.join(workspace, "src"), { recursive: true })
  await writeFile(
    path.join(workspace, "src", "agent-team-paper.ts"),
    [
      "export function rankAgentTeamPapers(items: Array<{ score: number }>) {",
      "  return items.toSorted((left, right) => right.score - left.score)",
      "}",
      "",
    ].join("\n"),
    "utf8",
  )
  await writeFile(
    path.join(workspace, "package.json"),
    `${JSON.stringify(
      {
        scripts: {
          typecheck: "bun --version",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  )
  return workspace
}

const request = await (async () => {
  if (scenario === "topic") {
    return {
        topic: "可验证论文自动化系统的闭环生成与真实性审查",
        workspace_path: repoRoot,
        paper_files: ["README.md"],
        experiment_logs: ["reports/strict-live-acceptance.md"],
        ...cjcBenchmarkTarget,
        language: "zh-CN",
        budget_tier: "standard" as const,
        quality_mode: "reviewable_bundle" as const,
        data_egress_policy: {
          ...commonPolicy,
          allowed_paths: ["README.md", "reports/strict-live-acceptance.md"],
        },
      }
  }
  if (scenario === "final") {
    const { workspace, sourceManifestPath, datasetPath } = await protocolBenchmarkInputs()
    return {
      topic: "带实时来源验证、显式基线、消融与容器复现的最终导出论文",
      workspace_path: workspace,
      code_paths: ["src", "experiments"],
      paper_files: [sourceManifestPath],
      dataset_paths: [datasetPath],
      ...cjcBenchmarkTarget,
      language: "zh-CN",
      budget_tier: "standard" as const,
      quality_mode: "reviewable_bundle" as const,
      data_egress_policy: {
        ...commonPolicy,
        allowed_paths: ["src", "experiments", "package.json", sourceManifestPath, datasetPath],
      },
    }
  }
  if (scenario === "protocol") {
    const { workspace, sourceManifestPath, datasetPath } = await protocolBenchmarkInputs()
    return {
      topic: "带显式基线、消融与容器复现脚本的代码论文",
      workspace_path: workspace,
      code_paths: ["src", "experiments"],
      paper_files: [sourceManifestPath],
      dataset_paths: [datasetPath],
      ...cjcBenchmarkTarget,
      language: "zh-CN",
      budget_tier: "standard" as const,
      quality_mode: "reviewable_bundle" as const,
      data_egress_policy: {
        ...commonPolicy,
        allowed_paths: ["src", "experiments", "package.json", sourceManifestPath, datasetPath],
      },
    }
  }
  if (scenario === "starter-rerun") {
    const workspace = await starterRerunBenchmarkWorkspace()
    return {
      topic: "从实验 starter 补齐 baseline ablation 与容器复现的代码论文",
      workspace_path: workspace,
      code_paths: ["src"],
      ...cjcBenchmarkTarget,
      language: "zh-CN",
      budget_tier: "standard" as const,
      quality_mode: "reviewable_bundle" as const,
      data_egress_policy: {
        ...commonPolicy,
        allowed_paths: ["src", "package.json"],
      },
    }
  }
  return {
    topic: "papercode 论文工作台代码库的架构与可验证导出机制",
    workspace_path: repoRoot,
    code_paths: codePaths,
    paper_files: ["README.md"],
    experiment_logs: ["reports/strict-live-acceptance.md"],
    ...cjcBenchmarkTarget,
    language: "zh-CN",
    budget_tier: "standard" as const,
    quality_mode: "reviewable_bundle" as const,
    data_egress_policy: {
      ...commonPolicy,
      allowed_paths: [...codePaths, "README.md", "reports/strict-live-acceptance.md"],
    },
  }
})()

assertBenchmark(request.target_profile === "cjc-paper", "Live paper benchmark must use the active CJC target profile.")
assertBenchmark(request.target_journal === "中国计算机学报", "Live paper benchmark must target 中国计算机学报.")

const run = await createPaperRun(request, { workspace: repoRoot })
assertBenchmark(run.snapshot.intake.target_profile === "cjc-paper", "PaperRun intake did not resolve to the CJC target profile.")
assertBenchmark(run.snapshot.intake.target_journal === "中国计算机学报", "PaperRun intake did not resolve to 中国计算机学报.")

if (scenario === "starter-rerun") {
  assertBenchmark(run.snapshot.status === "blocked", "Starter rerun scenario should begin blocked.")
  assertBenchmark(
    run.snapshot.diagnostics.experiment_starter_pack?.status === "ready",
    "Starter rerun scenario did not generate a starter pack.",
  )
  const forcedExport = await exportPaperRun(run.run_id, { forced: true }, { workspace: repoRoot })
  assertBenchmark(forcedExport.status === "forced_draft", "Starter rerun scenario did not create a forced draft before repair.")

  const workspace = request.workspace_path
  const applied = await applyPaperRunExperimentStarterPack(
    run.run_id,
    { dry_run: false, update_package_json: true, workspace_path: workspace },
    { workspace: repoRoot },
  )
  assertBenchmark(applied.status === "ready", "Starter rerun scenario could not apply starter pack.")
  await writeFile(
    path.join(workspace, "package.json"),
    `${JSON.stringify(
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
    )}\n`,
    "utf8",
  )
  const rerun = await runPaperRunExperimentProtocol(
    run.run_id,
    { dry_run: false, workspace_path: workspace, timeout_seconds: 30 },
    { workspace: repoRoot },
  )
  assertBenchmark(rerun.status === "succeeded", "Starter rerun scenario protocol rerun did not succeed.")
  assertBenchmark(
    rerun.planned_commands.some((item) => item.command === "bun run baseline:starter"),
    "Starter rerun scenario did not plan baseline:starter.",
  )
  assertBenchmark(
    rerun.planned_commands.some((item) => item.command === "bun run ablation:starter"),
    "Starter rerun scenario did not plan ablation:starter.",
  )
  assertBenchmark(
    rerun.planned_commands.some((item) => item.command === "bun run repro:container:starter"),
    "Starter rerun scenario did not plan repro:container:starter.",
  )
  assertBenchmark(rerun.report?.final_claims_allowed === true, "Starter rerun scenario did not allow final claims after rerun.")

  const finalExport = await exportPaperRun(run.run_id, { forced: false }, { workspace: repoRoot })
  const snapshot = await getPaperRunSnapshot(run.run_id, { workspace: repoRoot })
  const preview = await previewPaperRun(run.run_id, { workspace: repoRoot })
  assertBenchmark(snapshot.status === "succeeded", "Starter rerun scenario did not finish as succeeded.")
  assertBenchmark(snapshot.export_state.status === "final", "Starter rerun scenario did not produce final export state.")
  assertBenchmark(finalExport.status === "final", "Starter rerun final export request did not return a final bundle.")
  assertBenchmark(snapshot.experiment_status.reproduction_gate === "passed", "Starter rerun reproduction gate did not pass.")
  assertBenchmark(
    snapshot.artifacts.some((artifact) => artifact.metadata?.artifact_schema === "ExperimentProtocolStarterApplyResult.v1"),
    "Starter rerun scenario missing starter apply audit artifact.",
  )
  assertBenchmark(
    snapshot.artifacts.some(
      (artifact) => artifact.metadata?.artifact_schema === "ExperimentProtocol.v1" && artifact.metadata?.refreshed_from_workspace === true,
    ),
    "Starter rerun scenario missing refreshed ExperimentProtocol artifact.",
  )
  assertBenchmark(
    preview.snapshot.monitor?.experiment_runs?.some((item) => item.command === "bun run repro:container:starter" && item.status === "succeeded") === true,
    "Starter rerun Preview monitor did not expose successful repro:container:starter run.",
  )
  const markdownFile = finalExport.files?.find((file) => file.format === "markdown" && file.status === "written")
  assertBenchmark(markdownFile, "Starter rerun final export did not include Markdown.")
  const finalMarkdown = await readFile(path.join(run.run_dir, markdownFile.path), "utf8")
  assertBenchmark(finalMarkdown.includes("baseline:starter"), "Starter rerun final Markdown did not include baseline:starter.")
  assertBenchmark(finalMarkdown.includes("ablation:starter"), "Starter rerun final Markdown did not include ablation:starter.")
  assertBenchmark(finalMarkdown.includes("容器复现已通过"), "Starter rerun final Markdown did not report passed container reproduction.")
  assertBenchmark(
    !finalMarkdown.includes("Experiment Protocol Starter Pack"),
    "Starter rerun final Markdown still includes stale starter pack appendix.",
  )

  const artifactSchemas = snapshot.artifacts
    .map((artifact) => artifact.metadata?.artifact_schema)
    .filter((schema): schema is string => typeof schema === "string")
  const summary = {
    schema_version: "LivePaperQualityBenchmark.v1",
    project_version: await currentProjectVersion(),
    scenario,
    generated_at: new Date().toISOString(),
    request,
    run_id: run.run_id,
    run_dir: path.relative(repoRoot, run.run_dir).replace(/\\/g, "/"),
    status: snapshot.status,
    initial_status: run.snapshot.status,
    stage_total: snapshot.stage_graph.stages.length,
    stage_statuses: Object.fromEntries(snapshot.stage_graph.stages.map((stage) => [stage.id, stage.status])),
    event_count: snapshot.events.length,
    source_count: snapshot.source_ledger.length,
    claim_count: snapshot.claim_ledger.length,
    draft_count: snapshot.drafts.length,
    artifact_count: snapshot.artifacts.length,
    artifact_schemas: [...new Set(artifactSchemas)].sort(),
    starter_apply: {
      status: applied.status,
      written_count: applied.written_count,
      conflict_count: applied.conflict_count,
      audit_artifact_id: applied.audit_artifact_id,
    },
    protocol_rerun: {
      status: rerun.status,
      planned_commands: rerun.planned_commands.map((item) => item.command),
      host_runs: rerun.host_runs.map((item) => `${item.command}:${item.status}`),
      container_runs: rerun.container_runs.map((item) => `${item.command}:${item.status}`),
      final_claims_allowed: rerun.report?.final_claims_allowed,
    },
    export_state: snapshot.export_state,
    final_export: {
      status: finalExport.status,
      formats: finalExport.formats ?? [],
      failed_checks: finalExport.failed_checks,
      file_count: finalExport.files?.length ?? 0,
      manifest_path: finalExport.manifest_path,
    },
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
      annotation_count: preview.snapshot.annotations.length,
      experiment_runs: preview.snapshot.monitor?.experiment_runs
        ? {
            count: preview.snapshot.monitor.experiment_runs.length,
            commands: [...new Set(preview.snapshot.monitor.experiment_runs.map((item) => item.command))],
            statuses: [...new Set(preview.snapshot.monitor.experiment_runs.map((item) => `${item.environment}:${item.status}`))],
          }
        : undefined,
    },
    diagnostics: {
      counts: snapshot.diagnostics.counts,
      final_gate: snapshot.diagnostics.final_gate,
      audit: snapshot.diagnostics.audit.coverage,
    },
  }
  await publishBenchmarkSummary(summary)
  console.log(
    summaryOutput(summary, {
      initial_status: summary.initial_status,
      starter_apply: summary.starter_apply.status,
      protocol_rerun: summary.protocol_rerun.status,
      forced_export: summary.forced_export.status,
      final_export: summary.final_export.status,
      failed_checks: summary.final_export.failed_checks,
      preview: summary.preview.status,
    }),
  )
  stopAllPaperRunLivePreviews()
  process.exit(0)
}

const forcedExport = await exportPaperRun(run.run_id, { forced: true }, { workspace: repoRoot })
const finalExport = await exportPaperRun(run.run_id, { forced: false }, { workspace: repoRoot })
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
assertBenchmark(preview.snapshot.annotations.length > 0, "Preview produced no annotations.")
if (artifactSchemas.includes("ExperimentProtocolGuidance.v1")) {
  assertBenchmark(
    preview.snapshot.monitor?.experiment_guidance?.status === "needs_protocol",
    "Preview monitor did not expose experiment protocol guidance.",
  )
  assertBenchmark(
    preview.snapshot.annotations.some((annotation) => annotation.id.startsWith("experiment-guidance:")),
    "Preview annotations did not expose experiment protocol guidance.",
  )
}
if (artifactSchemas.includes("ExperimentProtocolStarterPack.v1")) {
  assertBenchmark(
    artifactSchemas.includes("ExperimentProtocolStarterFile.v1"),
    "Experiment protocol starter pack did not materialize standalone starter file artifacts.",
  )
  assertBenchmark(
    preview.snapshot.monitor?.experiment_starter_pack?.status === "ready",
    "Preview monitor did not expose experiment protocol starter pack.",
  )
  assertBenchmark(
    Object.keys(preview.snapshot.monitor?.experiment_starter_pack?.package_json_scripts ?? {}).includes(
      "repro:container:starter",
    ),
    "Experiment protocol starter pack did not include container reproduction starter script.",
  )
  assertBenchmark(
    preview.snapshot.monitor?.experiment_starter_pack?.files.every((file) => Boolean(file.artifact_path)) === true,
    "Preview starter pack files are missing artifact paths.",
  )
  assertBenchmark(
    preview.snapshot.annotations.some((annotation) => annotation.id === "experiment-starter-pack"),
    "Preview annotations did not expose experiment protocol starter pack.",
  )
}
if (artifactSchemas.includes("ExperimentRun.v1[]")) {
  assertBenchmark(
    (preview.snapshot.monitor?.experiment_runs?.length ?? 0) > 0,
    "Preview monitor did not expose ExperimentRun summaries.",
  )
  assertBenchmark(
    preview.snapshot.monitor?.experiment_runs?.some((run) => run.command.length > 0 && typeof run.wall_time_seconds === "number") === true,
    "Preview ExperimentRun summaries are missing command or timing information.",
  )
}
assertBenchmark(forcedExport.status === "forced_draft", "Forced export did not return a forced draft.")
assertBenchmark(forcedExport.files.length >= 4, "Forced export did not write all expected bundle formats.")
if ((scenario === "topic" || scenario === "code") && run.snapshot.export_state.status !== "final") {
  assertBenchmark(forcedExport.failed_checks.length > 0, "Forced draft is missing explicit failed checks.")
}
assertBenchmark(run.snapshot.diagnostics.audit.missing_kinds.length === 0, "Observability audit has missing kinds.")

if (scenario === "topic") {
  assertBenchmark(!("code_paths" in request), "Topic scenario unexpectedly included code paths.")
}

if (scenario === "code") {
  for (const schema of ["CodebaseMap.v1", "MethodExtraction.v1", "ExperimentSurface.v1", "ReproductionPlan.v1"]) {
    assertBenchmark(artifactSchemas.includes(schema), `Code scenario missing artifact schema ${schema}.`)
  }
  assertBenchmark(
    run.snapshot.export_state.status === "final" || run.snapshot.export_state.failed_checks.length > 0,
    "Code scenario must either produce final export or explicit failed checks.",
  )
}

if (scenario === "final") {
  assertBenchmark(run.snapshot.status === "succeeded", "Final scenario PaperRun did not succeed.")
  assertBenchmark(run.snapshot.export_state.status === "final", "Final scenario did not produce final export state.")
  assertBenchmark(run.snapshot.export_state.failed_checks.length === 0, "Final scenario export has failed checks.")
  assertBenchmark(finalExport.status === "final", "Final export request did not return a final bundle.")
  assertBenchmark(finalExport.failed_checks.length === 0, "Final export request returned failed checks.")
  assertBenchmark(run.snapshot.experiment_status.reproduction_gate === "passed", "Final scenario reproduction gate did not pass.")
}

if (scenario === "protocol") {
  assertBenchmark(run.snapshot.status === "succeeded", "Protocol scenario PaperRun did not succeed.")
  assertBenchmark(run.snapshot.experiment_status.reproduction_gate === "passed", "Protocol scenario reproduction gate did not pass.")
  assertBenchmark(run.snapshot.export_state.status === "final", "Protocol scenario did not produce final export state.")
  assertBenchmark(finalExport.status === "final", "Protocol scenario final export request did not return a final bundle.")
  assertBenchmark(artifactSchemas.includes("ExperimentProtocol.v1"), "Protocol scenario missing ExperimentProtocol.v1.")
}

if (scenario === "final" || scenario === "protocol") {
  const markdownFile = finalExport.files?.find((file) => file.format === "markdown" && file.status === "written")
  assertBenchmark(markdownFile, `${scenario} scenario final export did not include Markdown.`)
  const finalMarkdown = await readFile(path.join(run.run_dir, markdownFile.path), "utf8")
  assertNoBenchmarkSourceResidue(finalMarkdown, `${scenario} final Markdown`)
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
  final_export: {
    status: finalExport.status,
    formats: finalExport.formats ?? [],
    failed_checks: finalExport.failed_checks,
    file_count: finalExport.files?.length ?? 0,
    manifest_path: finalExport.manifest_path,
  },
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
    annotation_count: preview.snapshot.annotations.length,
    experiment_guidance: preview.snapshot.monitor?.experiment_guidance
      ? {
          status: preview.snapshot.monitor.experiment_guidance.status,
          gaps: preview.snapshot.monitor.experiment_guidance.gaps,
          suggestions: preview.snapshot.monitor.experiment_guidance.suggestions.map((item) => item.recommended_script),
        }
      : undefined,
    experiment_starter_pack: preview.snapshot.monitor?.experiment_starter_pack
      ? {
          status: preview.snapshot.monitor.experiment_starter_pack.status,
          scripts: Object.keys(preview.snapshot.monitor.experiment_starter_pack.package_json_scripts),
          files: preview.snapshot.monitor.experiment_starter_pack.files.map((file) => ({
            path: file.path,
            artifact_path: file.artifact_path,
          })),
        }
      : undefined,
    experiment_runs: preview.snapshot.monitor?.experiment_runs
      ? {
          count: preview.snapshot.monitor.experiment_runs.length,
          commands: [...new Set(preview.snapshot.monitor.experiment_runs.map((run) => run.command))],
          statuses: [...new Set(preview.snapshot.monitor.experiment_runs.map((run) => `${run.environment}:${run.status}`))],
        }
      : undefined,
  },
  diagnostics: {
    counts: run.snapshot.diagnostics.counts,
    final_gate: run.snapshot.diagnostics.final_gate,
    audit: run.snapshot.diagnostics.audit.coverage,
  },
}

await publishBenchmarkSummary(summary)

console.log(
  summaryOutput(summary, {
    stages: summary.stage_total,
    artifacts: summary.artifact_count,
    claims: summary.claim_count,
    forced_export: summary.forced_export.status,
    final_export: summary.final_export.status,
    failed_checks: summary.forced_export.failed_checks,
    preview: summary.preview.status,
  }),
)

stopAllPaperRunLivePreviews()
