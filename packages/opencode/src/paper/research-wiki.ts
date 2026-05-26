import type { NoveltyCheckpoint } from "./novelty"
import type { ResearchIntakeRequest } from "./intake"

export interface IdeaArchiveEntry {
  schema_version: "IdeaArchiveEntry.v1"
  idea_id: string
  topic: string
  hypothesis: string
  novelty_status: NoveltyCheckpoint["status"]
  related_source_ids: string[]
  failed_paths: string[]
  reusable_evidence: string[]
  updated_at: string
}

export interface ResearchWikiPage {
  schema_version: "ResearchWikiPage.v1"
  page_id: string
  title: string
  summary: string
  source_ids: string[]
  artifact_ids: string[]
  updated_at: string
}

export interface ResearchWikiDigest {
  schema_version: "ResearchWikiDigest.v1"
  run_id: string
  updated_at: string
  archive: IdeaArchiveEntry
  pages: ResearchWikiPage[]
  reuse_guidance: string[]
}

function nowIso(now?: string) {
  return now ?? new Date().toISOString()
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "idea"
  )
}

export function createResearchWikiDigest(input: {
  run_id: string
  request: ResearchIntakeRequest
  novelty: NoveltyCheckpoint
  artifact_ids?: string[]
  now?: string
}): ResearchWikiDigest {
  const updatedAt = nowIso(input.now)
  const relatedSourceIds = input.novelty.prior_work_map.works.map((work) => work.source_id)
  return {
    schema_version: "ResearchWikiDigest.v1",
    run_id: input.run_id,
    updated_at: updatedAt,
    archive: {
      schema_version: "IdeaArchiveEntry.v1",
      idea_id: `idea:${slug(input.request.topic)}`,
      topic: input.request.topic,
      hypothesis:
        input.novelty.status === "redirect_required"
          ? "当前方向与 prior work 高重合，需要先改写研究问题。"
          : "当前方向可继续推进，但每个贡献必须绑定 source 和实验复现证据。",
      novelty_status: input.novelty.status,
      related_source_ids: relatedSourceIds,
      failed_paths:
        input.novelty.status === "redirect_required"
          ? input.novelty.conflicts.map((conflict) => conflict.reason)
          : [],
      reusable_evidence: [...relatedSourceIds, ...(input.artifact_ids ?? [])],
      updated_at: updatedAt,
    },
    pages: [
      {
        schema_version: "ResearchWikiPage.v1",
        page_id: `wiki:${slug(input.request.topic)}:novelty`,
        title: `${input.request.topic} 查新摘要`,
        summary: input.novelty.decision.summary,
        source_ids: relatedSourceIds,
        artifact_ids: input.artifact_ids ?? [],
        updated_at: updatedAt,
      },
    ],
    reuse_guidance:
      input.novelty.status === "clear"
        ? ["后续 PaperRun 可复用当前 source ledger 和查新策略。"]
        : ["后续 PaperRun 必须先读取该 archive，避免重复实验或重复 claim。"],
  }
}
