import type { PaperProfileId } from "./profiles"
import type { PaperSpine } from "./paper-spine"

export interface JournalFigureProfile {
  schema_version: "JournalFigureProfile.v1"
  profile_id: PaperProfileId
  overview_required: boolean
  preferred_language: "en" | "zh"
  layout_guidance: string[]
  caption_requirements: string[]
  evidence_requirements: string[]
}

export interface FigurePanelPlan {
  panel_id: string
  title: string
  purpose: string
  evidence_refs: string[]
  visual_form: "system_map" | "workflow" | "experiment_matrix" | "result_summary" | "impact_summary"
  caption_seed: string
}

export interface FigureEvidenceMap {
  schema_version: "FigureEvidenceMap.v1"
  figure_id: string
  panels: Array<{
    panel_id: string
    claim_ids: string[]
    source_ids: string[]
    artifact_ids: string[]
    evidence_status: "ready" | "needs_evidence"
  }>
}

export interface GlobalFigureSpec {
  schema_version: "GlobalFigureSpec.v1"
  figure_id: string
  title: string
  target_profile: PaperProfileId
  status: "ready" | "needs_evidence" | "blocked_by_spine"
  profile: JournalFigureProfile
  panels: FigurePanelPlan[]
  evidence_map: FigureEvidenceMap
  checks: Array<{
    check_id: string
    status: "passed" | "warning" | "blocked"
    message: string
  }>
  created_at: string
}

function nowIso(now?: string) {
  return now ?? new Date().toISOString()
}

export function journalFigureProfile(profile_id: PaperProfileId): JournalFigureProfile {
  const nature = profile_id === "nature-paper"
  return {
    schema_version: "JournalFigureProfile.v1",
    profile_id,
    overview_required: nature,
    preferred_language: profile_id === "generic-preprint" ? "zh" : "en",
    layout_guidance: nature
      ? ["采用多 panel overview，先机制后实验再结果。", "每个 panel 只承载一个论证功能。"]
      : ["保持方法流程、实验设置和结果摘要分区清晰。"],
    caption_requirements: ["caption 必须说明 panel 目的、输入、输出和证据来源。"],
    evidence_requirements: ["每个 panel 必须绑定 claim、source 或 artifact。"],
  }
}

export function createGlobalFigureSpec(input: {
  run_id: string
  title: string
  target_profile: PaperProfileId
  spine: PaperSpine
  now?: string
}): GlobalFigureSpec {
  const profile = journalFigureProfile(input.target_profile)
  const claimIds = input.spine.evidence_map.map((item) => item.claim_id)
  const sourceIds = [...new Set(input.spine.evidence_map.flatMap((item) => item.source_ids))]
  const artifactIds = [...new Set(input.spine.evidence_map.flatMap((item) => item.artifact_ids))]
  const evidenceReady = input.spine.evidence_map.length > 0 && input.spine.evidence_map.every((item) => item.status === "supported")
  const panels: FigurePanelPlan[] = [
    {
      panel_id: "A",
      title: "Problem and system context",
      purpose: "展示研究对象、输入材料和系统边界。",
      evidence_refs: [...sourceIds, ...artifactIds].slice(0, 6),
      visual_form: "system_map",
      caption_seed: "Panel A frames the research setting and available evidence.",
    },
    {
      panel_id: "B",
      title: "Method workflow",
      purpose: "展示方法、agent/team 或实验流程的主链路。",
      evidence_refs: claimIds,
      visual_form: "workflow",
      caption_seed: "Panel B summarizes the method pipeline and evidence flow.",
    },
    {
      panel_id: "C",
      title: "Experiment and verification",
      purpose: "展示数据、baseline、metric、复现 gate 和失败边界。",
      evidence_refs: artifactIds,
      visual_form: "experiment_matrix",
      caption_seed: "Panel C records experiment and reproduction evidence.",
    },
    {
      panel_id: "D",
      title: "Claim and contribution summary",
      purpose: "展示最终 claim、贡献链和审查结果。",
      evidence_refs: claimIds,
      visual_form: "result_summary",
      caption_seed: "Panel D links supported claims to the contribution chain.",
    },
  ]
  const status =
    input.spine.readiness === "blocked_by_novelty"
      ? "blocked_by_spine"
      : evidenceReady
        ? "ready"
        : "needs_evidence"
  return {
    schema_version: "GlobalFigureSpec.v1",
    figure_id: `${input.run_id}:figure:overview`,
    title: `${input.title} overview figure`,
    target_profile: input.target_profile,
    status,
    profile,
    panels,
    evidence_map: {
      schema_version: "FigureEvidenceMap.v1",
      figure_id: `${input.run_id}:figure:overview`,
      panels: panels.map((panel) => ({
        panel_id: panel.panel_id,
        claim_ids: claimIds,
        source_ids: sourceIds,
        artifact_ids: artifactIds,
        evidence_status: panel.evidence_refs.length > 0 ? "ready" : "needs_evidence",
      })),
    },
    checks: [
      {
        check_id: "panel-evidence",
        status: panels.every((panel) => panel.evidence_refs.length > 0) ? "passed" : "warning",
        message: "每个 panel 需要绑定 claim、source 或 artifact。",
      },
      {
        check_id: "journal-profile",
        status: status === "blocked_by_spine" ? "blocked" : "passed",
        message: `Figure follows ${input.target_profile} overview guidance.`,
      },
    ],
    created_at: nowIso(input.now),
  }
}
