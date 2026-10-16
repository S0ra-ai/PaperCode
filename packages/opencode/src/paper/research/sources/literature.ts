import { withSpan } from "../telemetry"
import type { LiteratureCluster, LiteratureMap, SourceCandidate, SourceRecord } from "./schemas"

export type LiteratureDiscoveryInput = {
  topic: string
  candidates?: SourceCandidate[]
  min_verified_sources?: number
  now?: string
}

function nowIso(override?: string) {
  return override ?? new Date().toISOString()
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
}

function defaultLiteratureCandidates(_topic: string, _now: string): SourceCandidate[] {
  return []
}

function verificationFailure(source: SourceRecord) {
  if (source.verification.status !== "failed") return undefined
  return {
    source_id: source.source_id,
    reason: source.verification.diagnostics?.[0] ?? "source verification failed",
  }
}

function normalizeSource(candidate: SourceCandidate, now: string): SourceRecord {
  return {
    schema_version: "SourceRecord.v1",
    ...candidate,
    retrieved_at: candidate.version.retrieved_at || now,
  }
}

function clusterLabel(source: SourceRecord) {
  return source.topics?.[0] ?? source.title.split(/\s+/).slice(0, 3).join(" ")
}

function buildClusters(sources: SourceRecord[]): LiteratureCluster[] {
  const groups = new Map<string, SourceRecord[]>()
  for (const source of sources.filter((item) => item.verification.status === "verified")) {
    const label = clusterLabel(source)
    groups.set(label, [...(groups.get(label) ?? []), source])
  }
  return Array.from(groups.entries()).map(([label, items], index) => ({
    cluster_id: `cluster:${slug(label) || index + 1}`,
    label,
    keywords: Array.from(new Set(items.flatMap((item) => item.topics ?? [label]))).slice(0, 8),
    source_ids: items.map((item) => item.source_id),
    confidence: Math.min(0.95, 0.55 + items.length * 0.12),
  }))
}

export function discoverLiterature(input: LiteratureDiscoveryInput): LiteratureMap {
  const createdAt = nowIso(input.now)
  return withSpan(
    "research.sources.literature_discover",
    {
      "papercode.research.topic": input.topic,
      "papercode.research.sources.candidates": input.candidates?.length ?? 0,
    },
    (span) => {
      const sources = (input.candidates && input.candidates.length > 0
        ? input.candidates
        : defaultLiteratureCandidates(input.topic, createdAt)
      ).map((candidate) => normalizeSource(candidate, createdAt))
      const verified = sources.filter((source) => source.verification.status === "verified")
      const clear = verified.filter((source) => source.license.status === "clear")
      const failures = sources.map(verificationFailure).filter((item): item is { source_id: string; reason: string } =>
        Boolean(item),
      )
      const gaps: string[] = []
      const minVerified = input.min_verified_sources ?? 3
      if (verified.length < minVerified) gaps.push("insufficient_verified_literature")

      span.setAttribute("papercode.research.sources.verified", verified.length)
      span.setAttribute("papercode.research.sources.verification_failures", failures.length)
      return {
        schema_version: "LiteratureMap.v1",
        topic: input.topic,
        created_at: createdAt,
        sources,
        clusters: buildClusters(sources),
        summary: {
          total_sources: sources.length,
          verified_sources: verified.length,
          open_license_sources: clear.length,
        },
        diagnostics: {
          verification_failures: failures,
          gaps,
        },
      }
    },
  )
}
