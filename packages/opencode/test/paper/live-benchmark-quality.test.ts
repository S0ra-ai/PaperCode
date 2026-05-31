import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, rmSync } from "fs"
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
    expect(benchmark).toContain("PAPER_FUCKER_BENCHMARK_OUTPUT_ROOT")
    expect(benchmark).toContain("PAPER_FUCKER_BENCHMARK_SELF_TEST_FAILURE")
    expect(benchmark).toContain("attempt-error.json")
    expect(benchmark).toContain('path.join(outputDir, "README.md")')
    expect(benchmark).toContain("writeAttemptReadme")
    expect(benchmark).toContain("last-failed-attempt.txt")
    expect(benchmark).toContain("installBenchmarkFailureRecorder")
    expect(benchmark).toContain('process.on("uncaughtException"')
    expect(benchmark).toContain('process.on("unhandledRejection"')
    expect(benchmark).toContain("published_summary_path")
    expect(benchmark).toContain("benchmarkErrorCode")
    expect(benchmark).toContain("source_discovery_timeout")
    expect(benchmark).toContain("benchmark_interrupted")
    expect(benchmark).toContain("source_discovery_rate_limited")
    expect(benchmark).toContain("schema_validation_failed")
    expect(benchmark).toContain("model_configuration_failed")
    expect(benchmark).toContain("Failed to record live benchmark attempt error")
    expect(benchmark).toContain(".catch((recordError)")
    expect(benchmark).toContain('process.on("SIGINT"')
    expect(benchmark).toContain('process.on("SIGTERM"')
    expect(benchmark).toContain("live benchmark interrupted by SIGINT")
    expect(benchmark).toContain("live benchmark terminated by SIGTERM")
    expect(benchmark).toContain("let finalizing = false")
    expect(benchmark).not.toContain("publishBenchmarkSummary(error")
  })

  test("writes a real attempt-error file for controlled self-test failures", () => {
    const outputRoot = path.join(repoRoot, "tmp", "live-paper-quality-benchmark-self-test", `run-${process.pid}-${Date.now()}`)
    rmSync(outputRoot, { recursive: true, force: true })

    try {
      const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "live-paper-quality-benchmark.ts"), "--scenario", "topic"], {
        cwd: repoRoot,
        env: {
          ...process.env,
          PAPER_FUCKER_BENCHMARK_OUTPUT_ROOT: outputRoot,
          PAPER_FUCKER_BENCHMARK_SELF_TEST_FAILURE: "1",
        },
        encoding: "utf8",
        timeout: 20_000,
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain("attempt_error_path")

      const scenarioRoot = path.join(outputRoot, "topic")
      const lastFailedPath = path.join(scenarioRoot, "last-failed-attempt.txt")
      expect(existsSync(lastFailedPath)).toBe(true)

      const failedAttempt = readFileSync(lastFailedPath, "utf8").trim()
      const attemptErrorPath = path.join(scenarioRoot, failedAttempt, "attempt-error.json")
      const attemptReadmePath = path.join(scenarioRoot, failedAttempt, "README.md")
      expect(existsSync(attemptErrorPath)).toBe(true)
      expect(existsSync(attemptReadmePath)).toBe(true)
      expect(existsSync(path.join(scenarioRoot, "paperrun-summary.json"))).toBe(false)

      const attemptError = JSON.parse(readFileSync(attemptErrorPath, "utf8"))
      expect(attemptError.schema_version).toBe("LivePaperQualityBenchmarkAttemptError.v1")
      expect(attemptError.scenario).toBe("topic")
      expect(attemptError.error.code).toBe("benchmark_failed")
      expect(attemptError.error.message).toContain("live benchmark self-test failure recorder")

      const attemptReadme = readFileSync(attemptReadmePath, "utf8")
      expect(attemptReadme).toContain("status: failed")
      expect(attemptReadme).toContain("scenario: topic")
      expect(attemptReadme).toContain("error_code: benchmark_failed")
      expect(attemptReadme).toContain("Published summaries are updated only after a successful benchmark attempt")
    } finally {
      rmSync(outputRoot, { recursive: true, force: true })
    }
  })
})
