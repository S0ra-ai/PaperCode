import type { PreviewDiagnostics, PreviewSnapshot } from "../../../preview/src/protocol"
import {
  ablationFigureSpec,
  figureSpecFromReport,
  recordExportBundle,
  type ExportBundle,
  type ExportRenderer,
} from "./research/export"
import { paperDocumentClass, paperReferenceStyle } from "./profiles"
import { translateDraftSections, type Translator } from "./translate"
import type { ResearchArtifact } from "./research/contracts"
import type { ExperimentPlan, ResultReport } from "./research/experiments"
import {
  appendResearchEvent,
  loadResearchRun,
  type ResearchFinalGateState,
  type ResearchRuntimeOptions,
  writeResearchArtifact,
} from "./research/runtime"
import type { DataPlan, LiteratureMap } from "./research/sources"
import type { SourceRecord } from "./research/sources/schemas"
import { withSpan } from "./research/telemetry"
import {
  applySectionOverrides,
  composeDraftPaper,
  createDraftRevision,
  recordDraftWriting,
  streamMarkdownDraft,
  type ClaimLedger,
  type DraftPaper,
  type DraftRevision,
  type DraftSectionOverride,
  type PaperAuthor,
  type PaperDeclarations,
} from "./research/writing"
import {
  manuscriptRequirementsForProfile,
  recordVerificationGate,
  type ModelReviewInput,
  type VerificationGateResult,
} from "./research/verification"
import { createRunBoundPreviewSnapshot } from "./preview"

export type PaperSupplementaryBundle = {
  schema_version: "PaperSupplementaryBundle.v1"
  bundle_id: string
  created_at: string
  items: Array<{
    kind: "claim_ledger" | "review_report" | "export_manifest"
    artifact_id?: string
    path?: string
    required: boolean
  }>
}

export type PaperAvailabilityBundle = {
  schema_version: "PaperAvailabilityBundle.v1"
  created_at: string
  data: {
    dataset_ids: string[]
    source_ids: string[]
    license_status: Array<{ dataset_id: string; status: string; expression?: string }>
  }
  code: {
    artifact_ids: string[]
  }
  experiments: {
    reproduction_status: ResultReport["reproduction"]["status"]
    container_run_ids: string[]
    final_claims_allowed: boolean
  }
  notes: string[]
}

/** What the author supplied beyond the generated draft, persisted so a refresh can reapply it. */
export type PaperAuthoringInputs = {
  schema_version: "PaperAuthoringInputs.v1"
  declarations?: PaperDeclarations
  authors?: PaperAuthor[]
  section_overrides?: DraftSectionOverride[]
}

export type RunPaperAuthoringLoopInput = {
  title: string
  ledger: ClaimLedger
  data_plan: DataPlan
  literature_map?: LiteratureMap
  experiment_plan?: ExperimentPlan
  experiment_protocol?: Parameters<typeof composeDraftPaper>[0]["experiment_protocol"]
  experiment_guidance?: Parameters<typeof composeDraftPaper>[0]["experiment_guidance"]
  experiment_starter_pack?: Parameters<typeof composeDraftPaper>[0]["experiment_starter_pack"]
  experiment_runs?: Parameters<typeof composeDraftPaper>[0]["experiment_runs"]
  result_report: ResultReport
  available_source_ids: string[]
  source_records?: SourceRecord[]
  model_reviews: ModelReviewInput[]
  target_profile?: string
  /** Funding, contributions, competing interests, ethics and AI-use text. Absent means "undeclared". */
  declarations?: PaperDeclarations
  /** Named authors and affiliations; absent leaves the anonymous placeholder. */
  authors?: PaperAuthor[]
  /** Section bodies authored or translated by the caller; replaces the generated text. */
  section_overrides?: DraftSectionOverride[]
  /** Latest novelty decision from the orchestrator; absent skips the novelty gate. */
  novelty_status?: "clear" | "needs_review" | "redirect_required" | "blocked"
  /** Supplies English prose when the target venue requires it; absent leaves the generated language. */
  translator?: Translator
  code_artifact_ids?: string[]
  code_metadata?: Parameters<typeof composeDraftPaper>[0]["code_metadata"]
  source_artifact_ids?: string[]
  renderers?: ExportRenderer
  tools?: PreviewDiagnostics["tools"]
  costs?: PreviewDiagnostics["costs"]
  agents?: PreviewDiagnostics["agents"]
  now?: string
}

export type PaperAuthoringLoopResult = {
  schema_version: "PaperAuthoringLoop.v1"
  final_export_blocked: boolean
  ledger: ClaimLedger
  draft: DraftPaper
  revision: DraftRevision
  verification: VerificationGateResult
  export: {
    bundle: ExportBundle
    artifact: ResearchArtifact
  }
  supplementary_bundle: PaperSupplementaryBundle
  availability_bundle: PaperAvailabilityBundle
  preview: PreviewSnapshot
  artifacts: {
    ledger: ResearchArtifact
    draft: ResearchArtifact
    chunks: ResearchArtifact
    blocking_report: ResearchArtifact
    review_report: ResearchArtifact
    availability_bundle: ResearchArtifact
    supplementary_bundle: ResearchArtifact
    preview_snapshot: ResearchArtifact
  }
}

function nowIso(override?: string) {
  return override ?? new Date().toISOString()
}

function finalGateIssueText(value: string) {
  if (value.startsWith("unsupported claim ")) return `断言缺少证据 ${value.slice("unsupported claim ".length)}`
  if (value.startsWith("dataset license ")) return `数据集许可待处理 ${value.slice("dataset license ".length)}`
  if (value === "experiment reproduction gate") return "实验复现检查未通过"
  return value
}

function displaySubmissionProfile(value: string) {
  if (value === "generic-preprint") return "通用预印本"
  if (value === "nature-paper") return "Nature 投稿配置"
  if (value === "cjc-paper") return "计算机学报投稿配置"
  if (value === "international-q1") return "国际 SCI 一区投稿配置"
  if (value === "acm-paper" || value === "acm") return "ACM 论文配置"
  if (value === "custom-journal") return "自定义期刊投稿配置"
  return value.replace(/[-_]+/g, " ")
}

function cjcEnglishTitle(title: string) {
  if (/^[\x00-\x7F\s:;,.!?()-]+$/.test(title)) return title
  if (title.includes("候选论文排序")) {
    return "An Evidence-Constrained Candidate Paper Ranking Method with Baselines, Ablation, and Container Reproduction"
  }
  if (title.includes("证据约束检索")) {
    return "Evidence-Constrained Retrieval with Verifiable Baselines and Reproduction"
  }
  if (title.includes("Text2Action") || title.includes("text2action")) {
    return "A Text2Action Method for Embodied Service Robot Command Planning"
  }
  return "An Evidence-Constrained Method Study for Computer-System Research"
}

function sectionMarkdown(draft: DraftPaper, sectionId: string) {
  return draft.sections.find((section) => section.section_id === sectionId)?.markdown.trim()
}

function tableCell(markdown: string, key: string) {
  const pattern = new RegExp(`\\|\\s*${key}\\s*\\|\\s*([^|]+?)\\s*\\|`)
  const value = markdown.match(pattern)?.[1]?.trim()
  if (!value || value === "本次材料未提供" || value === "本次材料未提供。") return undefined
  return value
}

function cjcAuthorMetadata(draft: DraftPaper) {
  const authorSection = sectionMarkdown(draft, "author_information") ?? ""
  const authors = tableCell(authorSection, "作者") ?? "匿名作者"
  const affiliation = tableCell(authorSection, "机构") ?? "匿名单位"
  return {
    authors,
    affiliation,
    englishAuthors: authors === "匿名作者" ? "Anonymous author" : authors,
    englishAffiliation: affiliation === "匿名单位" ? "Anonymous affiliation" : affiliation,
  }
}

function cjcEnglishAbstract(draft: DraftPaper, abstract: string) {
  if (/^[\x00-\x7F\s:;,.!?;'"()[\]-]+$/.test(abstract)) return abstract
  if (draft.title.includes("候选论文排序")) {
    return cjcRankingEnglishAbstract(abstract)
  }
  if (draft.title.includes("Text2Action") || draft.title.includes("text2action")) {
    return [
      "This paper presents a Text2Action method for embodied service robot command planning.",
      "It studies how natural-language tasks are transformed into executable action sequences under semantic planning, action registration, and safe execution constraints.",
      "The Chinese manuscript reports the benchmark, ablation, and container reproduction boundaries used to support the stated results.",
    ].join(" ")
  }
  const englishTitle = cjcEnglishTitle(draft.title).replace(/^(A|An) /, (article) => article.toLowerCase())
  return [
    `This paper presents ${englishTitle}.`,
    "The manuscript follows a Chinese Computer Journal oriented structure and keeps research questions, method claims, experiment records, and reproducibility boundaries traceable to the submitted materials.",
  ].join(" ")
}

function cjcRankingEnglishAbstract(abstract: string) {
  const metric = englishMetricName(abstract.match(/实验以([^，。]+)为主指标/)?.[1]?.trim() ?? "ranking nDCG@3")
  const proposed = abstract.match(/本文方法达到\s*([0-9.]+)/)?.[1]
  const baseline = abstract.match(/词项匹配基线为\s*([0-9.]+)/)?.[1]
  const baselineDelta = abstract.match(/较词项匹配基线的绝对差值为\s*([0-9.]+)/)?.[1]
  const ablationDelta = abstract.match(/无证据覆盖消融的[^。]*绝对差值为\s*([0-9.]+)/)?.[1]
  const candidateCount = abstract.match(/候选数\s*([0-9]+)/)?.[1]
  const labelBoundary = abstract.includes("不是人工相关性标注")
    ? "The evaluation labels are derived from live arXiv search rank, topic matching, metadata completeness, and publication time, rather than manual relevance annotation."
    : "The evaluation labels are bounded by the current dataset construction policy."
  const reproduction = abstract.includes("容器复现通过")
    ? "Container reproduction passes, indicating that the current protocol can be repeated in the controlled environment."
    : "Container reproduction has not passed, so the results should be interpreted as exploratory observations."
  const result =
    proposed && baseline && baselineDelta
      ? `The proposed method reaches ${proposed} on ${metric}, compared with ${baseline} for the lexical matching baseline, with an absolute difference of ${baselineDelta}.`
      : `The experiment uses ${metric} as the primary metric.`
  const ablation = ablationDelta
    ? `The no-claim-coverage ablation is lower than the proposed method by ${ablationDelta}, suggesting that the claim-coverage term is associated with the observed ranking difference on the current candidate set.`
    : "The ablation study is used to separate lexical matching from the claim-coverage component."
  const dataset = candidateCount ? `The benchmark contains ${candidateCount} candidate papers.` : "The benchmark has a limited candidate set."
  return [
    "This study addresses candidate paper ranking under an evidence-constrained setting.",
    "The ranking interface consists of rankAgentTeamPapers and scorePaper, where scorePaper combines relevance, claim coverage, and recency into a unified score.",
    result,
    ablation,
    `${dataset} ${labelBoundary}`,
    reproduction,
  ].join(" ")
}

function englishMetricName(value: string) {
  const normalized = value.trim()
  if (normalized === "排序 nDCG@3") return "ranking nDCG@3"
  return normalized.replace(/排序/g, "ranking")
}

function cjcKeywordList(value: string) {
  return value
    .split(/[；;、,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function cjcEnglishKeywords(value: string) {
  const dictionary: Record<string, string> = {
    可复现研究: "reproducible research",
    代码实验: "code experiment",
    代码生成: "code generation",
    智能体: "agent",
    多智能体: "multi-agent system",
    检索: "retrieval",
    排序: "ranking",
    测试通过率: "test pass rate",
    基线对照: "baseline comparison",
    消融实验: "ablation study",
    容器复现: "container reproduction",
    语义规划: "semantic planning",
    安全执行: "safe execution",
    服务机器人: "service robot",
    论文生成: "paper generation",
    证据链: "evidence traceability",
    候选论文排序: "candidate paper ranking",
    证据覆盖: "evidence coverage",
    "排序 nDCG@3": "ranking nDCG@3",
    词项匹配基线: "lexical matching baseline",
    机器人: "robotics",
    具身智能: "embodied intelligence",
  }
  const keywords = cjcKeywordList(value)
    .map((item) => dictionary[item] ?? item)
    .slice(0, 6)
  return keywords.length > 0 ? keywords.join("; ") : "computer systems; reproducible research"
}

const cjcSectionPlan: Record<string, { order: number; heading: string; level: 2 | 3 }> = {
  introduction: { order: 100, heading: "1 引言", level: 2 },
  research_questions: { order: 110, heading: "1.1 研究问题", level: 3 },
  contributions: { order: 120, heading: "1.2 主要贡献", level: 3 },
  related_work: { order: 200, heading: "2 相关工作", level: 2 },
  study_design: { order: 300, heading: "3 研究设计与方法", level: 2 },
  method: { order: 310, heading: "3.1 方法", level: 3 },
  evidence_traceability: { order: 320, heading: "3.2 证据与可追踪性", level: 3 },
  data_availability: { order: 400, heading: "4 实验设置与材料", level: 2 },
  experimental_setup: { order: 410, heading: "4.2 实验协议", level: 3 },
  results: { order: 500, heading: "5 结果与分析", level: 2 },
  reproducibility: { order: 600, heading: "6 可复现性", level: 2 },
  discussion: { order: 700, heading: "7 讨论", level: 2 },
  threats_to_validity: { order: 800, heading: "8 效度威胁", level: 2 },
  limitations: { order: 810, heading: "8.1 限制与未来工作", level: 3 },
  conclusion: { order: 900, heading: "9 结论", level: 2 },
  declarations: { order: 1000, heading: "声明", level: 2 },
  references: { order: 1100, heading: "参考文献", level: 2 },
  appendix_evidence_trace: { order: 1200, heading: "附录 A：证据追踪", level: 2 },
  appendix_operational_reproducibility_checklist: { order: 1210, heading: "附录 B：复现清单", level: 2 },
  appendix_experiment_protocol_guidance: { order: 1220, heading: "附录 C：实验协议修复清单", level: 2 },
  appendix_experiment_protocol_starter_pack: { order: 1230, heading: "附录 D：实验启动包", level: 2 },
  appendix_claim_ledger: { order: 1240, heading: "附录 E：断言证据表", level: 2 },
  appendix_artifacts: { order: 1250, heading: "附录 F：证据记录索引", level: 2 },
}

function cjcOrderedSections(draft: DraftPaper) {
  return draft.sections
    .filter((section) => !["author_information", "abstract", "keywords"].includes(section.section_id))
    .map((section, index) => ({
      section,
      plan: cjcSectionPlan[section.section_id],
      index,
    }))
    .sort((left, right) => (left.plan?.order ?? 2000 + left.index) - (right.plan?.order ?? 2000 + right.index))
}

function cjcEffectiveSectionPlan(draft: DraftPaper, sectionId: string) {
  const plan = cjcSectionPlan[sectionId]
  if (!plan) return undefined
  const hasStudyDesign = draft.sections.some((section) => section.section_id === "study_design")
  if (sectionId === "method" && !hasStudyDesign) return { order: 300, heading: "3 方法", level: 2 as const }
  return plan
}

function cjcHeadingPrefix(heading: string) {
  const numeric = heading.match(/^(\d+(?:\.\d+)*)\s+/)?.[1]
  if (numeric) return numeric
  const appendix = heading.match(/^附录\s*([A-Z])[:：]\s*/i)?.[1]
  if (appendix) return `附录 ${appendix.toUpperCase()}`
  return undefined
}

function cjcHeadingAlreadyNumbered(title: string) {
  return /^\d+(?:\.\d+)*\s+/.test(title) || /^附录\s+[A-Z](?:\.\d+)*\s+/.test(title)
}

function cjcNumberedChildMarkdown(markdown: string, parentHeading: string, parentLevel: 2 | 3) {
  const parentPrefix = cjcHeadingPrefix(parentHeading)
  if (!parentPrefix) return markdown.trim()

  const counters: number[] = []
  let inFence = false
  const lines = markdown.trim().split(/\r?\n/)
  return lines
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence
        return line
      }
      if (inFence) return line

      const match = line.match(/^(\s*)(#{1,6})\s+(.+?)\s*$/)
      if (!match) return line

      const [, indent, marker, rawTitle] = match
      const title = rawTitle.trim()
      if (cjcHeadingAlreadyNumbered(title)) return line

      const depth = Math.max(marker.length, Math.min(parentLevel + 1, 6))
      const relativeDepth = Math.max(1, depth - parentLevel)
      while (counters.length > relativeDepth) counters.pop()
      for (let index = 0; index < relativeDepth - 1; index++) {
        if (!counters[index]) counters[index] = 1
      }
      counters[relativeDepth - 1] = (counters[relativeDepth - 1] ?? 0) + 1

      const prefix = [parentPrefix, ...counters.slice(0, relativeDepth)].join(".")
      return `${indent}${"#".repeat(depth)} ${prefix} ${title}`
    })
    .join("\n")
}

function splitMarkdownTableRow(line: string) {
  const trimmed = line.trim()
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return undefined
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim())
}

function isMarkdownTableSeparator(line: string, expectedCells: number) {
  const cells = splitMarkdownTableRow(line)
  return Boolean(cells && cells.length === expectedCells && cells.every((cell) => /^:?-{3,}:?$/.test(cell)))
}

function cjkDisplayWidth(value: string) {
  const plain = value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
  return Array.from(plain).reduce((total, char) => total + (/[\u1100-\u11ff\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(char) ? 2 : 1), 0)
}

function cjcTableWidthHint(maxDisplayWidth: number) {
  if (maxDisplayWidth <= 6) return 3
  if (maxDisplayWidth <= 12) return 6
  return Math.max(8, Math.min(36, Math.ceil(maxDisplayWidth / 2)))
}

function cjcTableSeparatorForRows(rows: string[][]) {
  const columnCount = rows[0]?.length ?? 0
  const widths = Array.from({ length: columnCount }, (_, column) =>
    cjcTableWidthHint(Math.max(...rows.map((row) => cjkDisplayWidth(row[column] ?? "")))),
  )
  return `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`
}

function cjcTableWidthHintMarkdown(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  const output: string[] = []
  let inFence = false
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      output.push(line)
      continue
    }
    if (inFence) {
      output.push(line)
      continue
    }

    const header = splitMarkdownTableRow(line)
    if (!header || !isMarkdownTableSeparator(lines[index + 1] ?? "", header.length)) {
      output.push(line)
      continue
    }

    const rows = [header]
    let cursor = index + 2
    while (cursor < lines.length) {
      const row = splitMarkdownTableRow(lines[cursor])
      if (!row || row.length !== header.length) break
      rows.push(row)
      cursor++
    }

    output.push(line)
    output.push(cjcTableSeparatorForRows(rows))
    for (let rowIndex = index + 2; rowIndex < cursor; rowIndex++) output.push(lines[rowIndex])
    index = cursor - 1
  }
  return output.join("\n")
}

function cjcBodyMarkdown(draft: DraftPaper) {
  return cjcOrderedSections(draft).map(({ section, plan }) => {
    const effectivePlan = cjcEffectiveSectionPlan(draft, section.section_id) ?? plan
    const heading = effectivePlan?.heading ?? section.title
    const level = effectivePlan?.level ?? 2
    return `${"#".repeat(level)} ${heading}\n\n${cjcNumberedChildMarkdown(section.markdown, heading, level)}`
  })
}

function cjcFrontMatterMarkdown(draft: DraftPaper) {
  const abstract = sectionMarkdown(draft, "abstract") ?? "摘要待生成。"
  const keywords = sectionMarkdown(draft, "keywords") ?? "关键词待生成。"
  const author = cjcAuthorMetadata(draft)
  return [
    `# ${draft.title}`,
    "",
    author.authors,
    "",
    `（${author.affiliation}）`,
    "",
    "## 摘要",
    "",
    abstract,
    "",
    `**关键词**：${cjcKeywordList(keywords).join("；") || "关键词待生成"}`,
    "",
    "## 英文摘要",
    "",
    `**Title**: ${cjcEnglishTitle(draft.title)}`,
    "",
    `**Authors**: ${author.englishAuthors}`,
    "",
    `**Affiliation**: ${author.englishAffiliation}`,
    "",
    "**Abstract**:",
    "",
    cjcEnglishAbstract(draft, abstract),
    "",
    `**Keywords**: ${cjcEnglishKeywords(keywords)}`,
    "",
    cjcBodyMarkdown(draft).join("\n\n"),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
}

type ProfileFormattingInput = {
  target_profile?: RunPaperAuthoringLoopInput["target_profile"]
  ledger: RunPaperAuthoringLoopInput["ledger"]
  data_plan?: RunPaperAuthoringLoopInput["data_plan"]
  result_report: RunPaperAuthoringLoopInput["result_report"]
  code_artifact_ids?: RunPaperAuthoringLoopInput["code_artifact_ids"]
}

export function formatDraftPaperForProfile(draft: DraftPaper, input: ProfileFormattingInput) {
  const profile = input.target_profile ?? "cjc-paper"
  const markdown = profile === "cjc-paper" ? cjcFrontMatterMarkdown(draft) : draft.markdown
  const profiled = appendProfileAppendix(markdown, input)
  return profile === "cjc-paper" ? cjcTableWidthHintMarkdown(profiled) : profiled
}

function appendProfileAppendix(markdown: string, input: ProfileFormattingInput) {
  const profile = input.target_profile ?? "cjc-paper"
  // The readiness appendix is Chinese internal prose; only the Chinese venue's manuscript carries it.
  if (profile !== "cjc-paper") return markdown
  const appendixLabel = nextAppendixLabel(markdown)
  const datasetCount = input.data_plan?.datasets.length ?? 0
  const failedChecks = [
    ...input.ledger.unsupported_claim_ids.map((claimId) => `unsupported claim ${claimId}`),
    ...(input.data_plan?.license_conflicts ?? []).map((conflict) => `dataset license ${conflict.dataset_id}`),
    ...(input.result_report.final_claims_allowed ? [] : ["experiment reproduction gate"]),
  ]
  return [
    markdown,
    "",
    `## 附录 ${appendixLabel}：投稿准备度`,
    "",
    `目标稿件配置：${displaySubmissionProfile(profile)}。`,
    datasetCount > 0
      ? `数据可用性：已纳入 ${datasetCount} 个数据集，详细清单见数据与代码可用性章节和证据清单。`
      : "数据可用性：尚未纳入数据集。",
    (input.code_artifact_ids ?? []).length > 0
      ? `代码可用性：已纳入 ${input.code_artifact_ids!.length} 个代码证据条目，详细清单见证据清单。`
      : "代码可用性：尚未纳入代码证据条目。",
    failedChecks.length === 0
      ? "成稿条件：已满足当前成稿条件。"
      : `成稿条件：仍需处理 ${failedChecks.map(finalGateIssueText).join("；")}。`,
  ].join("\n")
}

function nextAppendixLabel(markdown: string) {
  const labels = Array.from(markdown.matchAll(/^##\s+附录\s+([A-Z])(?=[:：\s])/gim)).map((match) =>
    match[1].toUpperCase().charCodeAt(0),
  )
  const maxLabel = labels.length > 0 ? Math.max(...labels) : "A".charCodeAt(0) - 1
  return String.fromCharCode(Math.min(maxLabel + 1, "Z".charCodeAt(0)))
}

function applyRevision(draft: DraftPaper, revision: DraftRevision): DraftPaper {
  return {
    ...draft,
    version: draft.version + 1,
    markdown: revision.next_markdown,
    applied_guidance_ids: [...draft.applied_guidance_ids, "profile-aware-authoring-loop"],
  }
}

export function createProfileAwareDraftRevision(input: {
  draft: DraftPaper
  authoring: RunPaperAuthoringLoopInput
  now?: string
}) {
  return createDraftRevision({
    previous_markdown: input.draft.markdown,
    next_markdown: formatDraftPaperForProfile(input.draft, input.authoring),
    now: input.now,
  })
}

export function buildPaperAvailabilityBundle(
  input: Pick<RunPaperAuthoringLoopInput, "data_plan" | "result_report" | "code_artifact_ids" | "now">,
): PaperAvailabilityBundle {
  return {
    schema_version: "PaperAvailabilityBundle.v1",
    created_at: nowIso(input.now),
    data: {
      dataset_ids: input.data_plan.datasets.map((dataset) => dataset.dataset_id),
      source_ids: input.data_plan.datasets.map((dataset) => dataset.source_id),
      license_status: input.data_plan.datasets.map((dataset) => ({
        dataset_id: dataset.dataset_id,
        status: dataset.license.status,
        expression: dataset.license.expression,
      })),
    },
    code: {
      artifact_ids: input.code_artifact_ids ?? [],
    },
    experiments: {
      reproduction_status: input.result_report.reproduction.status,
      container_run_ids: input.result_report.reproduction.container_run_ids,
      final_claims_allowed: input.result_report.final_claims_allowed,
    },
    notes: [
      "Final claims may only use reproduced results or explicitly exploratory results.",
      "Dataset and code availability are generated from run artifacts, not free-form prose.",
    ],
  }
}

export function buildPaperSupplementaryBundle(input: {
  created_at?: string
  ledger_artifact_id?: string
  review_artifact_id?: string
  export_bundle: ExportBundle
}): PaperSupplementaryBundle {
  return {
    schema_version: "PaperSupplementaryBundle.v1",
    bundle_id: `supplementary:${input.export_bundle.bundle_id}`,
    created_at: nowIso(input.created_at),
    items: [
      {
        kind: "claim_ledger",
        artifact_id: input.ledger_artifact_id,
        path: "writing/claim-ledger.json",
        required: true,
      },
      {
        kind: "review_report",
        artifact_id: input.review_artifact_id,
        path: "verification/review-report.json",
        required: true,
      },
      {
        kind: "export_manifest",
        path: "exports/export-bundle.json",
        required: true,
      },
    ],
  }
}

function finalGateFromVerification(verification: VerificationGateResult): ResearchFinalGateState {
  return {
    status: verification.blocking_report.status === "passed" ? "passed" : "blocked",
    blockers: verification.blocking_report.blockers.map((finding) => finding.category),
    updated_at: verification.blocking_report.created_at,
  }
}

async function writeAvailabilityBundle(
  runDir: string,
  availability: PaperAvailabilityBundle,
  options?: ResearchRuntimeOptions,
) {
  return writeResearchArtifact(
    runDir,
    {
      kind: "export",
      logical_path: "exports/availability-bundle.json",
      data: availability,
      metadata: { artifact_schema: "PaperAvailabilityBundle.v1" },
    },
    options,
  )
}

async function writeSupplementaryBundle(
  runDir: string,
  supplementary: PaperSupplementaryBundle,
  options?: ResearchRuntimeOptions,
) {
  return writeResearchArtifact(
    runDir,
    {
      kind: "export",
      logical_path: "exports/supplementary-bundle.json",
      data: supplementary,
      metadata: { artifact_schema: "PaperSupplementaryBundle.v1" },
    },
    options,
  )
}

async function writePreviewSnapshot(runDir: string, preview: PreviewSnapshot, options?: ResearchRuntimeOptions) {
  return writeResearchArtifact(
    runDir,
    {
      kind: "export",
      logical_path: "preview/preview-snapshot.json",
      data: preview,
      metadata: { artifact_schema: "PreviewSnapshot.v1", readonly: true },
    },
    options,
  )
}

export async function runPaperAuthoringLoop(
  runDir: string,
  input: RunPaperAuthoringLoopInput,
  options?: ResearchRuntimeOptions,
): Promise<PaperAuthoringLoopResult> {
  return withSpan(
    "paper.authoring.loop",
    {
      "papercode.paper.authoring.title": input.title,
      "papercode.paper.authoring.profile": input.target_profile ?? "cjc-paper",
    },
    async (span) => {
      const run = await loadResearchRun(runDir)
      const figure = figureSpecFromReport(input.result_report)
      const ablationFigure = input.experiment_runs
        ? ablationFigureSpec({
            metric: input.result_report.primary_metric,
            runs: [...input.experiment_runs.host_runs, ...input.experiment_runs.container_runs],
            statistics: input.result_report.statistics,
          })
        : undefined
      const baseDraft = composeDraftPaper({
        title: input.title,
        ledger: input.ledger,
        data_plan: input.data_plan,
        literature_map: input.literature_map,
        declarations: input.declarations,
        authors: input.authors,
        reference_style: paperReferenceStyle(input.target_profile),
        figure,
        experiment_plan: input.experiment_plan,
        experiment_protocol: input.experiment_protocol,
        experiment_guidance: input.experiment_guidance,
        experiment_starter_pack: input.experiment_starter_pack,
        experiment_runs: input.experiment_runs,
        result_report: input.result_report,
        code_metadata: input.code_metadata,
        now: input.now,
      })
      const composedBase = input.section_overrides?.length
        ? applySectionOverrides(baseDraft, input.section_overrides)
        : baseDraft
      // An English venue cannot read the generated Chinese scaffold; translate it when a translator
      // is available and keep the result as overrides so a later export refresh reproduces it.
      const translated =
        manuscriptRequirementsForProfile(input.target_profile).language === "en" && input.translator
          ? await translateDraftSections(composedBase, input.translator)
          : undefined
      const effectiveOverrides = [...(input.section_overrides ?? []), ...(translated ?? [])]
      const composed = effectiveOverrides.length ? applySectionOverrides(baseDraft, effectiveOverrides) : baseDraft
      const revision = createProfileAwareDraftRevision({ draft: composed, authoring: input, now: input.now })
      const draft = applyRevision(composed, revision)
      const writing = await recordDraftWriting(
        runDir,
        {
          ledger: input.ledger,
          draft,
          chunks: [...streamMarkdownDraft(draft)],
        },
        options,
      )
      // Persist the author's own text (and any translation) so a later final-export refresh
      // recomposes the same manuscript instead of silently reverting to the generated sections.
      if (input.declarations || input.authors?.length || effectiveOverrides.length) {
        const authored: PaperAuthoringInputs = {
          schema_version: "PaperAuthoringInputs.v1",
          declarations: input.declarations,
          authors: input.authors,
          section_overrides: effectiveOverrides.length ? effectiveOverrides : undefined,
        }
        await writeResearchArtifact(
          runDir,
          {
            kind: "draft",
            logical_path: "authoring/inputs.json",
            data: authored,
            metadata: { artifact_schema: "PaperAuthoringInputs.v1" },
          },
          options,
        )
      }
      const designRuns = input.experiment_runs
        ? [...input.experiment_runs.host_runs, ...input.experiment_runs.container_runs]
        : undefined
      const verification = await recordVerificationGate(
        runDir,
        {
          ledger: input.ledger,
          draft,
          data_plan: input.data_plan,
          result_report: input.result_report,
          available_source_ids: input.available_source_ids,
          source_records: input.source_records,
          model_reviews: input.model_reviews,
          manuscript_requirements: manuscriptRequirementsForProfile(input.target_profile),
          novelty_status: input.novelty_status,
          experiment_design: designRuns
            ? {
                baselines: new Set(designRuns.filter((run) => run.role === "baseline").map((run) => run.experiment_id)).size,
                ablations: new Set(designRuns.filter((run) => run.role === "ablation").map((run) => run.experiment_id)).size,
              }
            : undefined,
          now: input.now,
        },
        options,
      )
      const finalGate = finalGateFromVerification(verification)
      const availabilityBundle = buildPaperAvailabilityBundle(input)
      const availabilityArtifact = await writeAvailabilityBundle(runDir, availabilityBundle, options)
      const sourceArtifactIds = Array.from(
        new Set([
          ...(input.source_artifact_ids ?? []),
          ...(input.code_artifact_ids ?? []),
          writing.artifacts.ledger.artifact_id,
          writing.artifacts.draft.artifact_id,
          writing.artifacts.chunks.artifact_id,
          verification.artifacts.blocking_report.artifact_id,
          verification.artifacts.review_report.artifact_id,
          availabilityArtifact.artifact_id,
        ]),
      )

      let finalExportBlocked = false
      let exported: Awaited<ReturnType<typeof recordExportBundle>>
      if (finalGate.status === "passed") {
        exported = await recordExportBundle(
          runDir,
          {
            mode: "final",
            draft,
            final_gate: finalGate,
            source_artifact_ids: sourceArtifactIds,
            figure,
            ablation_figure: ablationFigure,
            documentclass: paperDocumentClass(input.target_profile),
            renderers: input.renderers,
            now: input.now,
          },
          options,
        )
      } else {
        finalExportBlocked = true
        exported = await recordExportBundle(
          runDir,
          {
            mode: "forced_draft",
            draft,
            final_gate: finalGate,
            source_artifact_ids: sourceArtifactIds,
            figure,
            ablation_figure: ablationFigure,
            documentclass: paperDocumentClass(input.target_profile),
            renderers: input.renderers,
            now: input.now,
          },
          options,
        )
      }

      const supplementaryBundle = buildPaperSupplementaryBundle({
        created_at: input.now,
        ledger_artifact_id: writing.artifacts.ledger.artifact_id,
        review_artifact_id: verification.artifacts.review_report.artifact_id,
        export_bundle: exported.bundle,
      })
      const supplementaryArtifact = await writeSupplementaryBundle(runDir, supplementaryBundle, options)
      const preview = createRunBoundPreviewSnapshot({
        run_id: run.run_id,
        title: draft.title,
        draft,
        ledger: input.ledger,
        blocking_report: verification.blocking_report,
        review_report: verification.review_report,
        export_bundle: exported.bundle,
        tools: input.tools,
        costs: input.costs,
        agents: input.agents,
        now: input.now,
      })
      const previewArtifact = await writePreviewSnapshot(runDir, preview, options)
      await appendResearchEvent(
        runDir,
        {
          type: "paper.authoring.completed",
          actor: "agent",
          payload: {
            draft_id: draft.draft_id,
            export_bundle_id: exported.bundle.bundle_id,
            final_export_blocked: finalExportBlocked,
            preview_artifact_id: previewArtifact.artifact_id,
            supplementary_artifact_id: supplementaryArtifact.artifact_id,
            availability_artifact_id: availabilityArtifact.artifact_id,
          },
        },
        options,
      )
      span.setAttribute("papercode.paper.authoring.final_blocked", finalExportBlocked)
      span.setAttribute("papercode.paper.authoring.export_status", exported.bundle.status)

      return {
        schema_version: "PaperAuthoringLoop.v1",
        final_export_blocked: finalExportBlocked,
        ledger: input.ledger,
        draft,
        revision,
        verification,
        export: exported,
        supplementary_bundle: supplementaryBundle,
        availability_bundle: availabilityBundle,
        preview,
        artifacts: {
          ledger: writing.artifacts.ledger,
          draft: writing.artifacts.draft,
          chunks: writing.artifacts.chunks,
          blocking_report: verification.artifacts.blocking_report,
          review_report: verification.artifacts.review_report,
          availability_bundle: availabilityArtifact,
          supplementary_bundle: supplementaryArtifact,
          preview_snapshot: previewArtifact,
        },
      }
    },
  )
}
