import type { ResearchIntakeRequest } from "./intake"
import type { SourceRecord } from "./research/sources"

export type NoveltyCheckpointStage =
  | "intake"
  | "planning"
  | "literature"
  | "experiment_design"
  | "claim_ledger"

export type NoveltyDecisionStatus = "clear" | "needs_review" | "redirect_required" | "blocked"

export interface SearchStrategy {
  schema_version: "SearchStrategy.v1"
  created_at: string
  topic: string
  checkpoints: NoveltyCheckpointStage[]
  queries: Array<{
    query: string
    purpose: "exact_topic" | "method_overlap" | "dataset_overlap" | "baseline_overlap"
    providers: string[]
  }>
}

export interface PriorWorkMap {
  schema_version: "PriorWorkMap.v1"
  created_at: string
  topic: string
  works: Array<{
    source_id: string
    title: string
    provider?: string
    verification_status: string
    overlap: "unknown" | "low" | "medium" | "high"
    overlap_reason: string
  }>
}

export interface ContributionConflict {
  conflict_id: string
  source_id: string
  severity: "low" | "medium" | "high"
  reason: string
  recommended_action:
    | "continue_with_citation"
    | "narrow_claim"
    | "change_baseline"
    | "change_dataset"
    | "change_metric"
    | "redirect_research_question"
}

export interface NoveltyCheckpoint {
  schema_version: "NoveltyCheckpoint.v1"
  checkpoint_id: string
  stage: NoveltyCheckpointStage
  created_at: string
  topic: string
  status: NoveltyDecisionStatus
  search_strategy: SearchStrategy
  prior_work_map: PriorWorkMap
  conflicts: ContributionConflict[]
  decision: {
    status: NoveltyDecisionStatus
    summary: string
    next_actions: string[]
  }
}

export interface ExperimentNoveltyGate {
  schema_version: "ExperimentNoveltyGate.v1"
  gate_id: string
  created_at: string
  status: "passed" | "review_required" | "redirect_required" | "blocked"
  checkpoint_id: string
  allowed_to_run_expensive_experiments: boolean
  reason: string
  recommended_changes: string[]
}

function nowIso(now?: string) {
  return now ?? new Date().toISOString()
}

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function sourceDiagnostics(source: SourceRecord) {
  return source.verification.diagnostics ?? []
}

function overlapFor(topic: string, source: SourceRecord): PriorWorkMap["works"][number]["overlap"] {
  const title = normalized(source.title)
  const target = normalized(topic)
  if (!title || !target) return "unknown"
  if (sourceDiagnostics(source).some((item) => /novelty:(duplicate|overlap|same)/i.test(item))) return "high"
  if (source.verification.status !== "verified") return title.includes(target) ? "low" : "unknown"
  if (title === target) return "high"
  if (title.includes(target) || target.includes(title)) return "medium"
  const topicTerms = new Set(target.split(/[^a-z0-9\u4e00-\u9fa5]+/i).filter((term) => term.length > 2))
  if (topicTerms.size === 0) return "unknown"
  const hits = [...topicTerms].filter((term) => title.includes(term)).length
  const ratio = hits / topicTerms.size
  if (ratio >= 0.66) return "medium"
  if (ratio > 0) return "low"
  return "unknown"
}

function recommendationFor(overlap: PriorWorkMap["works"][number]["overlap"]): ContributionConflict["recommended_action"] {
  if (overlap === "high") return "redirect_research_question"
  if (overlap === "medium") return "narrow_claim"
  return "continue_with_citation"
}

function statusFor(conflicts: ContributionConflict[], sourceCount: number): NoveltyDecisionStatus {
  if (conflicts.some((item) => item.severity === "high")) return "redirect_required"
  if (conflicts.some((item) => item.severity === "medium")) return "needs_review"
  if (sourceCount === 0) return "needs_review"
  return "clear"
}

export function createSearchStrategy(input: {
  request: ResearchIntakeRequest
  stage: NoveltyCheckpointStage
  now?: string
}): SearchStrategy {
  const topic = input.request.topic
  return {
    schema_version: "SearchStrategy.v1",
    created_at: nowIso(input.now),
    topic,
    checkpoints: ["intake", "planning", "literature", "experiment_design", "claim_ledger"],
    queries: [
      {
        query: `"${topic}"`,
        purpose: "exact_topic",
        providers: ["exa", "crossref", "semantic-scholar", "arxiv", "web-crawler"],
      },
      {
        query: `${topic} method benchmark dataset baseline`,
        purpose: "method_overlap",
        providers: ["exa", "semantic-scholar", "github", "huggingface"],
      },
      {
        query: `${topic} dataset evaluation metric`,
        purpose: "dataset_overlap",
        providers: ["exa", "huggingface", "semantic-scholar"],
      },
    ],
  }
}

export function createPriorWorkMap(input: {
  request: ResearchIntakeRequest
  sources: SourceRecord[]
  now?: string
}): PriorWorkMap {
  return {
    schema_version: "PriorWorkMap.v1",
    created_at: nowIso(input.now),
    topic: input.request.topic,
    works: input.sources.map((source) => {
      const overlap = overlapFor(input.request.topic, source)
      return {
        source_id: source.source_id,
        title: source.title,
        provider: source.provider,
        verification_status: source.verification.status,
        overlap,
        overlap_reason:
          overlap === "high"
            ? "标题、诊断或主题高度重合，实验设计前必须改写贡献边界。"
            : overlap === "medium"
              ? "存在明显主题重叠，需要收窄 claim、baseline 或数据集。"
              : overlap === "low"
                ? "存在弱相关工作，写作时需要引用和区分。"
                : "尚无足够证据判断重合度。",
      }
    }),
  }
}

export function createNoveltyCheckpoint(input: {
  request: ResearchIntakeRequest
  stage: NoveltyCheckpointStage
  sources?: SourceRecord[]
  now?: string
}): NoveltyCheckpoint {
  const createdAt = nowIso(input.now)
  const sources = input.sources ?? []
  const searchStrategy = createSearchStrategy({ request: input.request, stage: input.stage, now: createdAt })
  const priorWorkMap = createPriorWorkMap({ request: input.request, sources, now: createdAt })
  const conflicts = priorWorkMap.works
    .filter((work) => work.overlap === "medium" || work.overlap === "high")
    .map((work, index): ContributionConflict => ({
      conflict_id: `${input.stage}:conflict:${index + 1}`,
      source_id: work.source_id,
      severity: work.overlap === "high" ? "high" : "medium",
      reason: work.overlap_reason,
      recommended_action: recommendationFor(work.overlap),
    }))
  const status = statusFor(conflicts, sources.length)
  return {
    schema_version: "NoveltyCheckpoint.v1",
    checkpoint_id: `${input.stage}:${createdAt}`,
    stage: input.stage,
    created_at: createdAt,
    topic: input.request.topic,
    status,
    search_strategy: searchStrategy,
    prior_work_map: priorWorkMap,
    conflicts,
    decision: {
      status,
      summary:
        status === "clear"
          ? "未发现阻断性重复研究；后续 claim 仍需引用相关工作。"
          : status === "redirect_required"
            ? "发现高重合 prior work；实验设计前需要改道或收窄贡献。"
            : "查新证据不足或存在中等重合；继续前需要补充检索或明确差异。",
      next_actions:
        status === "redirect_required"
          ? ["重新定义研究问题", "替换 baseline / dataset / metric", "把重复部分降级为 related work 或 reproduction"]
          : status === "needs_review"
            ? ["补充多库检索", "明确与 prior work 的差异", "限制昂贵实验范围"]
            : ["继续实验设计", "保留引用和 source ledger 证据"],
    },
  }
}

export function createExperimentNoveltyGate(input: {
  checkpoint: NoveltyCheckpoint
  now?: string
}): ExperimentNoveltyGate {
  const status =
    input.checkpoint.status === "redirect_required"
      ? "redirect_required"
      : input.checkpoint.status === "blocked"
        ? "blocked"
        : input.checkpoint.status === "needs_review"
          ? "review_required"
          : "passed"
  return {
    schema_version: "ExperimentNoveltyGate.v1",
    gate_id: `experiment-novelty:${input.checkpoint.checkpoint_id}`,
    created_at: nowIso(input.now),
    status,
    checkpoint_id: input.checkpoint.checkpoint_id,
    allowed_to_run_expensive_experiments: status === "passed",
    reason: input.checkpoint.decision.summary,
    recommended_changes: input.checkpoint.decision.next_actions,
  }
}
