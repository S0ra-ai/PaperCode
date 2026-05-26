import type { NoveltyCheckpoint } from "./novelty"

export type PaperSpineClaim = {
  claim_id: string
  text: string
  status: string
  source_ids: string[]
  artifact_ids: string[]
}

export type PaperSpineSource = {
  source_id: string
  title: string
}

export interface PaperSpine {
  schema_version: "PaperSpine.v1"
  spine_id: string
  title: string
  central_claim: string
  motivation_chain: string[]
  contribution_chain: string[]
  evidence_map: Array<{
    claim_id: string
    source_ids: string[]
    artifact_ids: string[]
    status: "supported" | "unsupported" | "needs_review"
  }>
  section_intent: Array<{
    section_id: "abstract" | "introduction" | "method" | "experiments" | "results" | "discussion"
    intent: string
  }>
  figure_plan: Array<{
    figure_id: string
    purpose: string
    source_claim_ids: string[]
  }>
  revision_matrix: Array<{
    risk: string
    revision_action: string
  }>
  readiness: "ready" | "needs_evidence" | "blocked_by_novelty"
  created_at: string
}

function nowIso(now?: string) {
  return now ?? new Date().toISOString()
}

function spineStatus(input: { novelty: NoveltyCheckpoint; claims: PaperSpineClaim[] }): PaperSpine["readiness"] {
  if (input.novelty.status === "redirect_required" || input.novelty.status === "blocked") return "blocked_by_novelty"
  if (input.claims.length === 0) return "needs_evidence"
  if (input.claims.some((claim) => claim.status !== "supported" || claim.source_ids.length === 0)) return "needs_evidence"
  return "ready"
}

export function createPaperSpine(input: {
  run_id: string
  title: string
  novelty: NoveltyCheckpoint
  claims: PaperSpineClaim[]
  sources: PaperSpineSource[]
  now?: string
}): PaperSpine {
  const readiness = spineStatus({ novelty: input.novelty, claims: input.claims })
  const sourceTitles = input.sources.slice(0, 3).map((source) => source.title)
  return {
    schema_version: "PaperSpine.v1",
    spine_id: `${input.run_id}:spine`,
    title: input.title,
    central_claim:
      input.claims[0]?.text ??
      (input.novelty.status === "redirect_required"
        ? "当前研究方向需要先改写贡献边界。"
        : "当前研究方向需要补充 ClaimLedger 后才能形成中心论点。"),
    motivation_chain: [
      "明确问题场景和现有方法限制。",
      input.novelty.decision.summary,
      sourceTitles.length > 0 ? `围绕 ${sourceTitles.join("；")} 建立差异化。` : "补充可验证来源后建立差异化。",
    ],
    contribution_chain:
      input.claims.length > 0
        ? input.claims.map((claim) => claim.text)
        : ["待 ClaimLedger 生成后填充贡献链。"],
    evidence_map: input.claims.map((claim) => ({
      claim_id: claim.claim_id,
      source_ids: claim.source_ids,
      artifact_ids: claim.artifact_ids,
      status: claim.status === "supported" && claim.source_ids.length > 0 ? "supported" : "needs_review",
    })),
    section_intent: [
      { section_id: "abstract", intent: "用一句话说明问题、方法、证据和结论边界。" },
      { section_id: "introduction", intent: "从应用痛点进入 prior work gap，再引出可验证贡献。" },
      { section_id: "method", intent: "描述方法或系统机制，并绑定代码/算法证据。" },
      { section_id: "experiments", intent: "说明数据、baseline、metric、复现设置和失败边界。" },
      { section_id: "results", intent: "只呈现由实验或来源支持的结果。" },
      { section_id: "discussion", intent: "写明限制、适用范围和后续工作。" },
    ],
    figure_plan: [
      {
        figure_id: "fig-overview",
        purpose: "用一张全局图串联问题、方法、实验和证据流。",
        source_claim_ids: input.claims.map((claim) => claim.claim_id),
      },
    ],
    revision_matrix:
      readiness === "ready"
        ? [{ risk: "投稿 profile 仍需检查", revision_action: "执行 profile-aware rewrite 和 figure/table gate。" }]
        : [
            {
              risk: readiness === "blocked_by_novelty" ? "查新冲突" : "证据不足",
              revision_action:
                readiness === "blocked_by_novelty"
                  ? "先改写研究问题或实验设计，再进入正文。"
                  : "补充 source、claim 或实验复现证据。",
            },
          ],
    readiness,
    created_at: nowIso(input.now),
  }
}
