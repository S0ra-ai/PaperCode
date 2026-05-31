import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import path from "path"

const repoRoot = path.resolve(import.meta.dir, "..", "..", "..", "..")

describe("live paper quality benchmark script", () => {
  test("uses topic-aligned ranking sources and rejects degenerate protocol samples", () => {
    const benchmark = readFileSync(path.join(repoRoot, "scripts", "live-paper-quality-benchmark.ts"), "utf8")

    expect(benchmark).toContain("paper recommendation ranking")
    expect(benchmark).toContain("protocolBenchmarkQueries")
    expect(benchmark).toContain("scholarly document ranking benchmark")
    expect(benchmark).toContain("could not build a non-degenerate live ranking benchmark")
    expect(benchmark).toContain("assertProtocolRankingSignal")
    expect(benchmark).toContain("Protocol scenario generated a degenerate ranking benchmark")
    expect(benchmark).toContain("protocolReferenceSources")
    expect(benchmark).toContain("citation_author")
    expect(benchmark).toContain("Verified arXiv source is missing authors")
    expect(benchmark).not.toContain("multi-agent research automation reproducibility")
  })

  test("reports live arXiv rate limits as source discovery blocks", () => {
    const benchmark = readFileSync(path.join(repoRoot, "scripts", "live-paper-quality-benchmark.ts"), "utf8")

    expect(benchmark).toContain("arxivRetryDelayMs")
    expect(benchmark).toContain("live arXiv source discovery blocked by rate limit")
  })

  test("bounds live arXiv discovery with explicit deadlines", () => {
    const benchmark = readFileSync(path.join(repoRoot, "scripts", "live-paper-quality-benchmark.ts"), "utf8")

    expect(benchmark).toContain("PAPER_FUCKER_BENCHMARK_SOURCE_BUDGET_MS")
    expect(benchmark).toContain("PAPER_FUCKER_BENCHMARK_ARXIV_QUERY_BUDGET_MS")
    expect(benchmark).toContain("benchmarkBoundedIntEnv")
    expect(benchmark).toContain("Math.max(bounds.min, Math.min(bounds.max")
    expect(benchmark).toContain("max: 300_000")
    expect(benchmark).toContain("ensureBeforeDeadline")
    expect(benchmark).toContain("deadlineSignal")
    expect(benchmark).toContain("live arXiv source discovery timed out")
    expect(benchmark).toContain("arxivVerificationCandidateLimit")
    expect(benchmark).not.toContain("const maxAttempts = 5")
    expect(benchmark).not.toContain("discovered.ids.slice(0, 8)")
  })

  test("publishes summaries only after a successful benchmark attempt", () => {
    const benchmark = readFileSync(path.join(repoRoot, "scripts", "live-paper-quality-benchmark.ts"), "utf8")

    expect(benchmark).toContain("scenarioOutputRoot")
    expect(benchmark).toContain("attempts")
    expect(benchmark).toContain("publishedSummaryPath")
    expect(benchmark).toContain("last-successful-attempt.txt")
    expect(benchmark).toContain("attempt_summary_path")
    expect(benchmark).not.toContain("await rm(outputDir")
    expect(benchmark).not.toContain("await rm(scenarioOutputRoot")
  })

  test("records failed benchmark attempts without publishing them as successful summaries", () => {
    const benchmark = readFileSync(path.join(repoRoot, "scripts", "live-paper-quality-benchmark.ts"), "utf8")

    expect(benchmark).toContain("LivePaperQualityBenchmarkAttemptError.v1")
    expect(benchmark).toContain("attempt-error.json")
    expect(benchmark).toContain("last-failed-attempt.txt")
    expect(benchmark).toContain("installBenchmarkFailureRecorder")
    expect(benchmark).toContain('process.on("uncaughtException"')
    expect(benchmark).toContain('process.on("unhandledRejection"')
    expect(benchmark).toContain("published_summary_path")
    expect(benchmark).not.toContain("publishBenchmarkSummary(error")
  })
})
