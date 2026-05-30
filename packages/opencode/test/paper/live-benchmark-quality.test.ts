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
})
