import { createHash } from "crypto"
import { RESEARCH_SCHEMA_VERSION, type ResearchArtifact, type ResearchSource, type ResearchToolTrace } from "./research/contracts"

export type CrawlLicenseStatus = "unknown" | "compatible" | "conflict" | "restricted"
export type CrawlComplianceStatus = "passed" | "blocked" | "needs_review"

export interface WebCrawlPlan {
  schema_version: "WebCrawlPlan.v1"
  plan_id: string
  urls: string[]
  allowed_domains: string[]
  rate_limit_per_domain: {
    requests_per_minute: number
  }
  respect_robots: boolean
  license_policy: "require_compatible" | "allow_unknown_with_review" | "allow_all"
  output_artifact_schema: "CrawledDataset.v1"
}

export interface CrawlExtractionEvidence {
  method: "scrapling" | "html_parser" | "provided_html" | "external_mcp"
  selector?: string
  confidence: number
  source_range?: {
    start?: number
    end?: number
  }
}

export interface CrawlSourceRecord {
  schema_version: "CrawlSourceRecord.v1"
  source_id: string
  url: string
  fetched_at: string
  status: "fetched" | "blocked" | "failed"
  http_status?: number
  content_sha256?: string
  title?: string
  text_excerpt?: string
  robots_allowed: boolean
  license_status: CrawlLicenseStatus
  extraction_evidence: CrawlExtractionEvidence
  tool_trace_id?: string
  diagnostics: string[]
}

export interface CrawledDataset {
  schema_version: "CrawledDataset.v1"
  dataset_id: string
  created_at: string
  records: CrawlSourceRecord[]
}

export interface CrawlComplianceReport {
  schema_version: "CrawlComplianceReport.v1"
  status: CrawlComplianceStatus
  checked_at: string
  blockers: string[]
  warnings: string[]
  record_count: number
}

export interface CrawlGateSummary {
  status: CrawlComplianceStatus
  blockers: string[]
  warnings: string[]
  message: string
}

export interface CrawlerDiagnosticsSummary {
  source_records: number
  blocked_records: number
  license_conflicts: number
  unknown_license_records: number
  source_ids: string[]
}

function nowIso(clock?: () => Date) {
  return (clock?.() ?? new Date()).toISOString()
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return slug || "crawl"
}

function domainOf(url: string) {
  return new URL(url).hostname.toLowerCase()
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items))
}

function metadataArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

export function hashCrawlContent(text: string) {
  return createHash("sha256").update(text).digest("hex")
}

export function createWebCrawlPlan(input: {
  plan_id?: string
  urls: string[]
  allowed_domains?: string[]
  requests_per_minute?: number
  respect_robots?: boolean
  license_policy?: WebCrawlPlan["license_policy"]
}): WebCrawlPlan {
  const urls = unique(input.urls)
  const allowedDomains = unique(input.allowed_domains ?? urls.map(domainOf))
  const firstDomain = allowedDomains[0] ?? "web"
  return {
    schema_version: "WebCrawlPlan.v1",
    plan_id: input.plan_id ?? `crawl-plan-${slugify(firstDomain)}`,
    urls,
    allowed_domains: allowedDomains,
    rate_limit_per_domain: {
      requests_per_minute: input.requests_per_minute ?? 12,
    },
    respect_robots: input.respect_robots ?? true,
    license_policy: input.license_policy ?? "allow_unknown_with_review",
    output_artifact_schema: "CrawledDataset.v1",
  }
}

export function createCrawlSourceRecord(input: {
  source_id?: string
  url: string
  fetched_at?: string
  status?: CrawlSourceRecord["status"]
  http_status?: number
  content?: string
  content_sha256?: string
  title?: string
  text_excerpt?: string
  robots_allowed?: boolean
  license_status?: CrawlLicenseStatus
  extraction_evidence?: Partial<CrawlExtractionEvidence>
  tool_trace_id?: string
  diagnostics?: string[]
  clock?: () => Date
}): CrawlSourceRecord {
  const contentHash = input.content_sha256 ?? (input.content ? hashCrawlContent(input.content) : undefined)
  const robotsAllowed = input.robots_allowed ?? true
  const licenseStatus = input.license_status ?? "unknown"
  return {
    schema_version: "CrawlSourceRecord.v1",
    source_id: input.source_id ?? `crawl-source-${hashCrawlContent(input.url).slice(0, 12)}`,
    url: input.url,
    fetched_at: input.fetched_at ?? nowIso(input.clock),
    status: input.status ?? (robotsAllowed ? "fetched" : "blocked"),
    http_status: input.http_status,
    content_sha256: contentHash,
    title: input.title,
    text_excerpt: input.text_excerpt,
    robots_allowed: robotsAllowed,
    license_status: licenseStatus,
    extraction_evidence: {
      method: input.extraction_evidence?.method ?? "scrapling",
      selector: input.extraction_evidence?.selector,
      confidence: input.extraction_evidence?.confidence ?? 0.7,
      source_range: input.extraction_evidence?.source_range,
    },
    tool_trace_id: input.tool_trace_id,
    diagnostics: [
      ...(input.diagnostics ?? []),
      ...(robotsAllowed ? [] : ["robots_blocked"]),
      ...(licenseStatus === "conflict" ? ["license_conflict"] : []),
    ],
  }
}

export function createCrawledDataset(input: {
  dataset_id?: string
  records: CrawlSourceRecord[]
  created_at?: string
  clock?: () => Date
}): CrawledDataset {
  return {
    schema_version: "CrawledDataset.v1",
    dataset_id: input.dataset_id ?? `crawl-dataset-${hashCrawlContent(input.records.map((record) => record.url).join("\n")).slice(0, 12)}`,
    created_at: input.created_at ?? nowIso(input.clock),
    records: input.records,
  }
}

export function evaluateCrawlCompliance(
  plan: WebCrawlPlan,
  records: CrawlSourceRecord[],
  input: { checked_at?: string; clock?: () => Date } = {},
): CrawlComplianceReport {
  const blockers: string[] = []
  const warnings: string[] = []
  const allowed = new Set(plan.allowed_domains.map((domain) => domain.toLowerCase()))

  if (records.length === 0) warnings.push("no_records")

  for (const url of plan.urls) {
    const domain = domainOf(url)
    if (!allowed.has(domain)) blockers.push(`domain_not_allowed:${domain}`)
  }

  for (const record of records) {
    if (plan.respect_robots && !record.robots_allowed) blockers.push(`robots_blocked:${record.url}`)
    if (record.license_status === "conflict" || record.license_status === "restricted") {
      blockers.push(`license_${record.license_status}:${record.url}`)
    }
    if (plan.license_policy === "require_compatible" && record.license_status !== "compatible") {
      blockers.push(`license_not_compatible:${record.url}`)
    }
    if (plan.license_policy === "allow_unknown_with_review" && record.license_status === "unknown") {
      warnings.push(`license_unknown:${record.url}`)
    }
    if (record.status !== "fetched") warnings.push(`record_${record.status}:${record.url}`)
  }

  return {
    schema_version: "CrawlComplianceReport.v1",
    status: blockers.length > 0 ? "blocked" : warnings.length > 0 ? "needs_review" : "passed",
    checked_at: input.checked_at ?? nowIso(input.clock),
    blockers: unique(blockers),
    warnings: unique(warnings),
    record_count: records.length,
  }
}

export function crawlGateSummary(report: CrawlComplianceReport): CrawlGateSummary {
  if (report.status === "passed") {
    return {
      status: "passed",
      blockers: [],
      warnings: report.warnings,
      message: "Crawler data can be used as source evidence.",
    }
  }
  if (report.status === "blocked") {
    return {
      status: "blocked",
      blockers: report.blockers,
      warnings: report.warnings,
      message: "Crawler data is blocked from final evidence until policy conflicts are resolved.",
    }
  }
  return {
    status: "needs_review",
    blockers: [],
    warnings: report.warnings,
    message: "Crawler data can be kept in the ledger but needs review before supporting final claims.",
  }
}

export function crawlRecordsToResearchSources(input: {
  run_id: string
  records: CrawlSourceRecord[]
  created_at?: string
}): ResearchSource[] {
  const createdAt = input.created_at ?? nowIso()
  return input.records.map((record) => ({
    schema_version: RESEARCH_SCHEMA_VERSION,
    source_id: record.source_id,
    run_id: input.run_id,
    kind: "web",
    title: record.title ?? record.url,
    locator: {
      uri: record.url,
      selector: record.extraction_evidence.selector,
    },
    created_at: createdAt,
    metadata: {
      artifact_schema: "CrawlSourceRecord.v1",
      fetched_at: record.fetched_at,
      http_status: record.http_status,
      content_sha256: record.content_sha256,
      robots_allowed: record.robots_allowed,
      license_status: record.license_status,
      extraction_evidence: record.extraction_evidence,
      diagnostics: record.diagnostics,
      tool_trace_id: record.tool_trace_id,
    },
  }))
}

export function crawledDatasetArtifact(input: {
  run_id: string
  dataset: CrawledDataset
  path: string
  created_at?: string
}): ResearchArtifact {
  return {
    schema_version: RESEARCH_SCHEMA_VERSION,
    artifact_id: input.dataset.dataset_id,
    run_id: input.run_id,
    kind: "source_snapshot",
    path: input.path,
    mime_type: "application/json",
    sha256: hashCrawlContent(JSON.stringify(input.dataset)),
    source_ids: input.dataset.records.map((record) => record.source_id),
    created_at: input.created_at ?? input.dataset.created_at,
    metadata: {
      artifact_schema: input.dataset.schema_version,
      record_count: input.dataset.records.length,
    },
  }
}

export function crawlerToolTrace(input: {
  run_id: string
  trace_id: string
  plan: WebCrawlPlan
  report: CrawlComplianceReport
  started_at: string
  ended_at?: string
}): ResearchToolTrace {
  return {
    schema_version: RESEARCH_SCHEMA_VERSION,
    trace_id: input.trace_id,
    run_id: input.run_id,
    tool_name: "python.web-crawler.scrapling",
    status: input.report.status === "blocked" ? "failed" : "succeeded",
    started_at: input.started_at,
    ended_at: input.ended_at,
    input: {
      plan: input.plan,
    },
    output: {
      report: input.report,
    },
    error: input.report.status === "blocked" ? input.report.blockers.join("; ") : undefined,
  }
}

export function crawlerDiagnostics(input: { sources: ResearchSource[] }): CrawlerDiagnosticsSummary {
  const records = input.sources.filter((source) => source.metadata?.artifact_schema === "CrawlSourceRecord.v1")
  return {
    source_records: records.length,
    blocked_records: records.filter((source) => metadataArray(source.metadata?.diagnostics).includes("robots_blocked")).length,
    license_conflicts: records.filter((source) => source.metadata?.license_status === "conflict" || source.metadata?.license_status === "restricted").length,
    unknown_license_records: records.filter((source) => source.metadata?.license_status === "unknown").length,
    source_ids: records.map((source) => source.source_id),
  }
}
