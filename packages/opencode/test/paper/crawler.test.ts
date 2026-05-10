import { describe, expect, test } from "bun:test"
import {
  crawlGateSummary,
  crawlRecordsToResearchSources,
  crawlerDiagnostics,
  crawledDatasetArtifact,
  crawlerToolTrace,
  createCrawlSourceRecord,
  createCrawledDataset,
  createWebCrawlPlan,
  evaluateCrawlCompliance,
  hashCrawlContent,
} from "../../src/paper"

describe("crawler data acquisition contracts", () => {
  test("creates crawl plans from URLs and maps fetched records into the source ledger", () => {
    const plan = createWebCrawlPlan({
      urls: ["https://example.test/data", "https://example.test/paper"],
      requests_per_minute: 6,
    })
    const record = createCrawlSourceRecord({
      url: "https://example.test/data",
      content: "<html><title>Dataset</title><body>sample data</body></html>",
      title: "Dataset",
      text_excerpt: "sample data",
      license_status: "compatible",
      extraction_evidence: { selector: "body", method: "scrapling", confidence: 0.92 },
      fetched_at: "2026-05-11T00:00:00.000Z",
    })
    const sources = crawlRecordsToResearchSources({
      run_id: "run-crawl",
      records: [record],
      created_at: "2026-05-11T00:00:01.000Z",
    })

    expect(plan.allowed_domains).toEqual(["example.test"])
    expect(plan.rate_limit_per_domain.requests_per_minute).toBe(6)
    expect(record.content_sha256).toBe(hashCrawlContent("<html><title>Dataset</title><body>sample data</body></html>"))
    expect(sources[0]).toMatchObject({
      run_id: "run-crawl",
      kind: "web",
      title: "Dataset",
      locator: { uri: "https://example.test/data", selector: "body" },
      metadata: {
        artifact_schema: "CrawlSourceRecord.v1",
        license_status: "compatible",
      },
    })
  })

  test("blocks final evidence use for robots and license conflicts", () => {
    const plan = createWebCrawlPlan({
      urls: ["https://example.test/blocked"],
      allowed_domains: ["example.test"],
      license_policy: "require_compatible",
    })
    const blocked = createCrawlSourceRecord({
      url: "https://example.test/blocked",
      robots_allowed: false,
      license_status: "restricted",
    })
    const report = evaluateCrawlCompliance(plan, [blocked], { checked_at: "2026-05-11T00:00:00.000Z" })
    const gate = crawlGateSummary(report)

    expect(report.status).toBe("blocked")
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        "robots_blocked:https://example.test/blocked",
        "license_restricted:https://example.test/blocked",
        "license_not_compatible:https://example.test/blocked",
      ]),
    )
    expect(gate.message).toContain("blocked from final evidence")
  })

  test("creates auditable dataset artifacts, tool traces, and diagnostics", () => {
    const plan = createWebCrawlPlan({ urls: ["https://example.test/data"] })
    const record = createCrawlSourceRecord({
      url: "https://example.test/data",
      content: "data",
      license_status: "unknown",
    })
    const dataset = createCrawledDataset({
      dataset_id: "crawl-dataset-test",
      records: [record],
      created_at: "2026-05-11T00:00:00.000Z",
    })
    const report = evaluateCrawlCompliance(plan, [record], { checked_at: "2026-05-11T00:00:01.000Z" })
    const artifact = crawledDatasetArtifact({
      run_id: "run-crawl",
      dataset,
      path: ".paper_fucker/runs/run-crawl/artifacts/crawl-dataset-test.json",
    })
    const trace = crawlerToolTrace({
      run_id: "run-crawl",
      trace_id: "trace-crawl",
      plan,
      report,
      started_at: "2026-05-11T00:00:00.000Z",
      ended_at: "2026-05-11T00:00:02.000Z",
    })
    const sources = crawlRecordsToResearchSources({ run_id: "run-crawl", records: [record] })

    expect(artifact).toMatchObject({
      kind: "source_snapshot",
      metadata: { artifact_schema: "CrawledDataset.v1", record_count: 1 },
      source_ids: [record.source_id],
    })
    expect(trace).toMatchObject({
      tool_name: "python.web-crawler.scrapling",
      status: "succeeded",
      input: { plan },
      output: { report },
    })
    expect(crawlerDiagnostics({ sources })).toMatchObject({
      source_records: 1,
      unknown_license_records: 1,
      license_conflicts: 0,
    })
  })
})
