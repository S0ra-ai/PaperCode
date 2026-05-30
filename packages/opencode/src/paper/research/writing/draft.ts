import { withSpan } from "../telemetry"
import type {
  ExperimentPlan,
  ExperimentProtocol,
  ExperimentProtocolGuidance,
  ExperimentProtocolStarterPack,
  ExperimentRun,
  ResultReport,
} from "../experiments"
import type { DataPlan, LiteratureMap } from "../sources"
import type { CheckpointGuidance, ClaimLedger, ClaimLedgerEntry, DraftPaper, DraftSection } from "./schemas"

export type CodeAvailabilityMetadata = {
  package_name?: string
  repository_url?: string
  version?: string
  commit_hash?: string
  worktree_dirty?: boolean
  license?: string
}

export type ComposeDraftPaperInput = {
  title: string
  ledger: ClaimLedger
  data_plan?: Pick<DataPlan, "datasets" | "license_conflicts" | "access_constraints" | "diagnostics" | "recommendation">
  literature_map?: LiteratureMap
  experiment_plan?: Pick<ExperimentPlan, "objective" | "metrics" | "proposed" | "baselines" | "ablations" | "resource_budget" | "downgrade_policy">
  experiment_protocol?: Pick<ExperimentProtocol, "entries" | "gaps" | "discovered_from">
  experiment_guidance?: Pick<ExperimentProtocolGuidance, "status" | "summary" | "suggestions" | "final_export_blocked">
  experiment_starter_pack?: Pick<
    ExperimentProtocolStarterPack,
    "status" | "summary" | "package_json_scripts" | "files" | "next_steps"
  >
  experiment_runs?: {
    host_runs: Pick<ExperimentRun, "experiment_id" | "role" | "status" | "command" | "environment" | "metrics" | "stdout" | "stderr" | "exit_code" | "resource_usage">[]
    container_runs: Pick<ExperimentRun, "experiment_id" | "role" | "status" | "command" | "environment" | "metrics" | "stdout" | "stderr" | "exit_code" | "resource_usage">[]
  }
  result_report?: Pick<ResultReport, "best_baseline" | "blockers" | "final_claims_allowed" | "primary_metric" | "proposed" | "recommendation" | "reproduction">
  code_metadata?: CodeAvailabilityMetadata
  now?: string
}

function nowIso(override?: string) {
  return override ?? new Date().toISOString()
}

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ")
}

function citationText(entry: ClaimLedgerEntry) {
  if (entry.citations.length === 0) return ""
  return ` ${entry.citations.map((_, index) => `[来源 ${index + 1}]`).join(" ")}`
}

function normalizeCjkSpacing(value: string) {
  return value.replace(/([。！？])\s+([\u3400-\u9fff])/g, "$1$2")
}

function paperProseText(value: string) {
  return normalizeCjkSpacing(value)
    .replace(/The workflow links /g, "该证据链连接")
    .replace(/The proposed workflow matches the declared baseline on the primary reproducibility metric\./g, "本文方法在主复现指标上与已声明基线保持一致。")
    .replace(/declared baseline/g, "已声明基线")
    .replace(/primary reproducibility metric/g, "主复现指标")
    .replace(/experiment runs/g, "实验运行记录")
    .replace(/export gates/g, "证据链完整性约束")
    .replace(/before final paper generation/g, "并在形成结果表述前完成")
    .replace(/final paper generation/g, "结果表述")
    .replace(/, and /g, "和")
    .replace(/, /g, "、")
    .replace(/source-range-grounded/g, "基于源码范围的")
    .replace(/baseline:ranking-lexical/g, "词项匹配基线")
    .replace(/ablation:ranking-no-coverage/g, "无证据覆盖消融")
    .replace(/repro:container/g, "容器复现")
    .replace(/test:ranking/g, "排名测试")
    .replace(/source ranges/g, "源码范围")
    .replace(/source range/g, "源码范围")
    .replace(/系统抽取到/g, "分析阶段抽取到")
    .replace(/导出方法\/类表面/g, "导出方法或类接口")
    .replace(/package script/g, "实验入口")
    .replace(/提交代码库/g, "研究代码")
    .replace(/final gate/g, "证据链完整性约束")
    .replace(/final claim/g, "结论性表述")
    .replace(/最终 claim/g, "结论性表述")
    .replace(/final export/g, "最终结果表述")
    .replace(/(?<![A-Za-z0-9_])ClaimLedger(?![A-Za-z0-9_])/g, "证据台账")
    .replace(/(?<!:)\bbaseline\b(?!:)/g, "基线")
    .replace(/(?<!:)\bablation\b(?!:)/g, "消融")
    .replace(/(?<!:)\bhost\b/g, "本机")
    .replace(/(?<!:)\bcontainer\b/g, "容器")
    .replace(/进行\s+基于源码范围的\s+分析/g, "进行基于源码范围的分析")
    .replace(/和\s+源码范围/g, "和源码范围")
    .replace(/和证据链完整性约束\s+并在形成结果表述前完成/g, "，并在形成结果表述前完成证据链完整性约束")
    .replace(/完成\./g, "完成。")
    .replace(/检查\./g, "检查。")
}

function claimMarkdown(entry: ClaimLedgerEntry) {
  const annotation =
    entry.status === "supported"
      ? ""
      : `\n<!-- unsupported-claim: ${entry.claim_id} needs evidence before final export -->`
  return `${paperProseText(entry.text)}${citationText(entry)}${annotation}`
}

function buildSection(sectionId: string, entries: ClaimLedgerEntry[]): DraftSection {
  const body = entries.map(claimMarkdown).join("\n\n")
  let cursor = 0
  const ranges = entries.map((entry) => {
    const text = claimMarkdown(entry)
    const start = body.indexOf(text, cursor)
    const end = start + text.length
    cursor = end
    return {
      claim_id: entry.claim_id,
      section_id: sectionId,
      start,
      end,
      source_ids: entry.source_ids,
    }
  })
  return {
    section_id: sectionId,
    title: titleCase(sectionId),
    level: 2,
    markdown: body,
    claim_ids: entries.map((entry) => entry.claim_id),
    source_ranges: ranges,
  }
}

function buildPlainSection(sectionId: string, title: string, markdown: string): DraftSection {
  return {
    section_id: sectionId,
    title,
    level: 2,
    markdown,
    claim_ids: [],
    source_ranges: [],
  }
}

function authorInformationSummary() {
  return [
    "作者：待补充",
    "机构：待补充",
    "通信作者：待补充",
  ].join("\n")
}

function declarationsSummary() {
  return [
    "基金项目：待补充。",
    "作者贡献：待补充。",
    "利益冲突：待补充。",
    "伦理审批：待补充；若研究涉及人类受试者、动物实验、个人敏感数据或受限数据，投稿前必须补齐伦理审批和数据授权信息。",
  ].join("\n")
}

function claimStatusSummary(ledger: ClaimLedger) {
  const unsupported = ledger.unsupported_claim_ids.length
  const supported = ledger.entries.filter((entry) => entry.status === "supported").length
  if (ledger.entries.length === 0) return "当前还没有证据台账条目，不能生成结论性表述。"
  if (unsupported > 0) return `当前 ${unsupported}/${ledger.entries.length} 条断言尚缺证据，结论性表述必须保持阻断。`
  return `当前 ${supported}/${ledger.entries.length} 条断言已绑定证据，可进入更严格的审稿与导出检查。`
}

function finalReady(input: ComposeDraftPaperInput) {
  return input.ledger.unsupported_claim_ids.length === 0 && input.result_report?.final_claims_allowed === true
}

function formatMetricValue(value: number) {
  const normalized = Object.is(value, -0) ? 0 : value
  return normalized.toFixed(4)
}

function displayMetricName(value: string) {
  if (value === "typecheck_pass") return "类型检查通过状态"
  if (value === "test_pass_rate") return "测试通过率"
  if (value === "ranking_ndcg_at_3") return "排序 nDCG@3"
  if (value === "container_reproduction_pass") return "容器复现通过状态"
  return value.replace(/_/g, " ")
}

function isRankingMetric(value?: string) {
  return Boolean(value && /ranking|ndcg|rank/i.test(value))
}

function primaryMetricPhrase(metric: string) {
  if (/^[A-Za-z0-9]/.test(metric)) return `以 ${metric} 作为主指标`
  const suffixSpace = /[A-Za-z0-9]$/.test(metric) ? " " : ""
  return `以${metric}${suffixSpace}作为主指标`
}

function primaryMetricLocus(metric: string) {
  return `在“${metric}”这一主指标上`
}

function constructValidityExample(metricId: string, metricLabel: string) {
  if (metricId === "typecheck_pass") return "例如类型检查通过状态可以证明代码可运行，却不能证明算法效果更好。"
  if (metricId === "ranking_ndcg_at_3") {
    return "例如排序 nDCG@3 可以评价当前候选排序协议，却不能单独证明方法在其他数据集、人工相关性标注或开放研究任务中同样有效。"
  }
  if (metricId === "container_reproduction_pass") return "例如容器复现通过状态可以证明当前环境声明可重放，却不能单独证明算法在更多任务上泛化有效。"
  const subject = /^[A-Za-z0-9]/.test(metricLabel) ? `${metricLabel} ` : metricLabel
  return `例如${subject}可以验证当前协议中的观测结果，却不能单独证明更广泛的学术贡献。`
}

function displayMetricDirection(value: string) {
  if (value === "higher_better") return "越高越好"
  if (value === "lower_better") return "越低越好"
  return value.replace(/_/g, " ")
}

function displayMetricValue(metric: string, value: number) {
  if (metric === "typecheck_pass") return value >= 1 ? "通过" : "未通过"
  return formatMetricValue(value)
}

function displayMetricUnit(metric: string, unit?: string) {
  if (!unit || metric === "typecheck_pass" || unit === "ratio") return ""
  return ` ${unit}`
}

function displayExperimentLabel(value: string) {
  const normalized = value.trim().replace(/[_\s]+/g, "-").toLowerCase()
  if (normalized === "proposed") return "证据驱动工作流"
  if (value.startsWith("container:") || normalized.startsWith("container-")) return "容器复现"
  const baseline = normalized.match(/^baseline[:-](.+)$/)
  if (baseline) return displayExperimentLabel(baseline[1])
  const ablation = normalized.match(/^ablation[:-](.+)$/)
  if (ablation) return displayExperimentLabel(ablation[1])
  if (normalized.match(/^proposed[:-]/)) return "证据驱动工作流"
  if (normalized === "ranking-lexical") return "词项匹配基线"
  if (normalized === "ranking-no-coverage") return "无证据覆盖消融"
  return value.replace(/[-_]+/g, " ")
}

function contextualProposedLabel(input: ComposeDraftPaperInput) {
  const metric = input.result_report?.primary_metric ?? input.experiment_plan?.proposed.expected_metric
  if (isRankingMetric(metric)) return "证据约束的论文排序方法"
  return "证据驱动工作流"
}

function contextualExperimentLabel(input: ComposeDraftPaperInput, experimentId: string, role?: string) {
  const normalized = experimentId.trim().replace(/[_\s]+/g, "-").toLowerCase()
  if (role === "proposed" || normalized === "proposed" || normalized.match(/^proposed[:-]/)) {
    return contextualProposedLabel(input)
  }
  return displayExperimentLabel(experimentId)
}

function displayExperimentRole(value: string) {
  if (value === "proposed") return "本文方法"
  if (value === "baseline") return "基线"
  if (value === "ablation") return "消融"
  if (value === "container_reproduction") return "容器复现"
  return value.replace(/_/g, " ")
}

function displayRunStatus(value: string) {
  if (value === "succeeded") return "通过"
  if (value === "failed") return "失败"
  if (value === "environment_failed") return "环境失败"
  if (value === "resource_exceeded") return "超出资源"
  if (value === "missing") return "缺失"
  return value
}

function displayVerificationStatus(value: string) {
  if (value === "verified") return "已验证"
  if (value === "unverified") return "未验证"
  if (value === "failed") return "验证失败"
  return value
}

function displayLicenseStatus(value: string) {
  if (value === "clear") return "许可清晰"
  if (value === "unclear") return "许可待核验"
  if (value === "restricted") return "许可受限"
  if (value === "conflict") return "许可冲突"
  return value
}

function displayReady(value: boolean) {
  return value ? "是" : "否"
}

function displayProtocolSource(value: string) {
  if (value === "package_scripts") return "项目声明的实验入口"
  if (value === "manifest") return "实验清单"
  if (value === "manual") return "手工协议"
  return value
}

function displayEnvironment(value: string) {
  if (value === "container:repro-env") return "容器复现环境"
  if (value.startsWith("host:")) {
    const platform = value.slice("host:".length)
    if (platform === "win32") return "本机 Windows"
    if (platform === "darwin") return "本机 macOS"
    if (platform === "linux") return "本机 Linux"
    return `本机 ${platform}`
  }
  return value
}

function resultMetricSummary(input: ComposeDraftPaperInput) {
  const report = input.result_report
  if (!report?.proposed) return "尚未形成可比较的主指标结果。"
  const metric = displayMetricName(report.primary_metric)
  const metricPhrase = primaryMetricPhrase(metric)
  const proposed = displayMetricValue(report.primary_metric, report.proposed.value)
  if (!report.best_baseline) return `${metricPhrase}：本文方法为 ${proposed}，仍缺少基线对照。`
  const baseline = report.best_baseline.value
  const delta = report.proposed.value - baseline
  if (Math.abs(delta) < 1e-9) {
    return `${metricPhrase}：本文方法与最佳基线（${displayExperimentLabel(report.best_baseline.experiment_id)}）均为 ${proposed}。`
  }
  const formattedDelta = `${delta >= 0 ? "+" : ""}${formatMetricValue(delta)}`
  return `${metricPhrase}：本文方法为 ${proposed}，最佳基线（${displayExperimentLabel(report.best_baseline.experiment_id)}）为 ${displayMetricValue(report.primary_metric, baseline)}，差值 ${formattedDelta}。`
}

function paperTitle(input: ComposeDraftPaperInput) {
  if (isRankingContext(input)) return "证据约束的候选论文排序方法：显式基线、消融与容器复现"
  return input.title
}

function markdownTable(headers: string[], rows: string[][]) {
  if (rows.length === 0) return ""
  const escape = (value: string) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ")
  return [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n")
}

function joinBlocks(blocks: Array<string | undefined>) {
  return blocks.filter((block): block is string => Boolean(block?.trim())).join("\n\n")
}

function compactId(value: string) {
  if (value.length <= 36) return value
  return `${value.slice(0, 18)}...${value.slice(-8)}`
}

function sourceKindLabel(sourceId: string) {
  if (sourceId.startsWith("material:code:")) return "代码材料"
  if (sourceId.startsWith("material:data:")) return "数据材料"
  if (sourceId.startsWith("material:paper:")) return "论文材料"
  if (sourceId.startsWith("material:log:")) return "实验日志"
  if (sourceId.startsWith("paper:")) return "已验证论文来源"
  if (sourceId.startsWith("dataset:") || sourceId.startsWith("source-dataset")) return "数据集来源"
  return compactId(sourceId)
}

function claimSourceIds(input: ComposeDraftPaperInput) {
  return [...new Set(input.ledger.entries.flatMap((entry) => entry.source_ids))]
}

function evidenceSourceIds(input: ComposeDraftPaperInput) {
  const sourceIds = new Set(claimSourceIds(input))
  for (const source of input.literature_map?.sources ?? []) {
    if (source.verification.status === "verified") sourceIds.add(source.source_id)
  }
  for (const dataset of input.data_plan?.datasets ?? []) {
    sourceIds.add(dataset.source_id || dataset.dataset_id)
  }
  return [...sourceIds]
}

function sourceSummary(input: ComposeDraftPaperInput) {
  const sourceIds = evidenceSourceIds(input)
  if (sourceIds.length === 0) return "本研究尚未登记可引用来源，因此正文只能作为研究骨架。"
  return `本研究使用 ${sourceIds.length} 个可核验材料来源，其中${countedSummary(sourceIds, sourceKindLabel, "个")}。`
}

function artifactSummary(input: ComposeDraftPaperInput) {
  const artifactIds = [...new Set(input.ledger.entries.flatMap((entry) => entry.artifact_ids))]
  if (artifactIds.length === 0) return "当前还没有可审查证据记录。"
  if (isRankingContext(input)) return "附录列出实现位置和复现实验入口；主文保留排序规则、对照设计和结果解释。"
  return `正文结论绑定 ${artifactIds.length} 个复核记录；完整证据索引保留在附录中，正文只保留必要说明。`
}

function countedSummary(values: string[], label: (value: string) => string, unit: string) {
  if (values.length === 0) return "无"
  const counts = new Map<string, number>()
  for (const value of values) {
    const key = label(value)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].map(([key, count]) => `${key} ${count} ${unit}`).join("、")
}

function evidenceCountSummary(artifactIds: string[], label = "结构化证据") {
  return artifactIds.length > 0 ? `${label} ${artifactIds.length} 条` : "无"
}

function displayClaimAction(value: string) {
  if (!value || value === "none") return "无需处理"
  if (value === "add_evidence") return "补充证据"
  if (value === "downgrade_claim") return "降低表述强度"
  if (value === "remove_claim") return "移出终稿断言"
  return paperProseText(value)
}

function displaySectionID(value: string) {
  if (value === "method") return "方法"
  if (value === "results") return "结果"
  if (value === "discussion") return "讨论"
  if (value === "introduction") return "引言"
  if (value === "related_work") return "相关工作"
  return titleCase(value)
}

function displayDatasetAccess(value: string) {
  if (value === "open") return "开放"
  if (value === "registration_required") return "需注册"
  if (value === "restricted") return "受限"
  if (value === "unavailable") return "不可用"
  return value
}

function displayDatasetLicense(value: string) {
  if (value === "workspace-authorized local dataset") return "工作区授权本地数据集"
  return paperProseText(value)
}

function displaySubmissionProfile(value: string) {
  if (value === "generic-preprint") return "通用预印本"
  if (value === "nature-paper") return "Nature 投稿配置"
  if (value === "acm") return "ACM 论文配置"
  return value.replace(/[-_]+/g, " ")
}

function compactClaimText(value: string, maxLength = 180) {
  const compacted = paperProseText(value.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ")).trim()
  if (compacted.length <= maxLength) return compacted
  const chineseSentences = compacted.match(/[^。！？]+[。！？]/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? []
  const englishSentences =
    chineseSentences.length === 0
      ? compacted.match(/[^.!?]+[.!?](?=\s|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? []
      : []
  const sentences = chineseSentences.length > 0 ? chineseSentences : englishSentences
  const kept: string[] = []
  for (const sentence of sentences) {
    const candidate = [...kept, sentence].join(" ")
    if (candidate.length > maxLength) break
    kept.push(sentence)
  }
  if (kept.length > 0) return kept.join(chineseSentences.length > 0 ? "" : " ")
  const boundary = compacted.lastIndexOf(" ", maxLength - 1)
  const cut = boundary > Math.floor(maxLength * 0.5) ? boundary : maxLength - 1
  return `${compacted.slice(0, cut).trim()}…`
}

function trimTerminalPunctuation(value: string) {
  return value.replace(/[。！？.!?]+$/g, "")
}

function firstClaimText(input: ComposeDraftPaperInput, sectionID: string) {
  const preferred = input.ledger.entries.find((entry) => entry.section_id === sectionID && entry.status === "supported")
  const fallback = input.ledger.entries.find((entry) => entry.section_id === sectionID)
  return preferred || fallback ? compactClaimText((preferred ?? fallback)!.text) : undefined
}

function resultEvidenceText(input: ComposeDraftPaperInput) {
  return firstClaimText(input, "results") ?? (input.result_report?.proposed ? resultMetricSummary(input) : undefined)
}

function literatureDisplayTitle(source: LiteratureMap["sources"][number]) {
  return source.title.trim() || source.title
}

function literatureRoleTags(source: LiteratureMap["sources"][number]) {
  const text = `${source.title} ${source.abstract ?? ""} ${(source.topics ?? []).join(" ")}`.toLowerCase()
  const tags: string[] = []
  if (/tool|agent|multi-agent|workflow|autonomous|harness/.test(text)) tags.push("工具调用与智能体协作")
  if (/reproduc|validat|baseline|ablation|benchmark|experiment|evaluation/.test(text)) tags.push("实验复现与验证风险")
  if (/paper[-\s]?to[-\s]?code|code generation|execution|program|software|source/.test(text)) tags.push("论文到代码执行链路")
  if (/data|dataset|spatial|multimodal|modeling|neuroimaging/.test(text)) tags.push("任务数据与领域评测")
  if (/language model|llm|large language/.test(text)) tags.push("大模型方法基础")
  return [...new Set(tags)].slice(0, 3)
}

function rankingLiteratureRoleScore(source: LiteratureMap["sources"][number], role: "explanation" | "retrieval" | "validation") {
  const title = source.title.toLowerCase()
  const text = `${source.title} ${source.abstract ?? ""} ${(source.topics ?? []).join(" ")}`.toLowerCase()
  let score = 0
  if (role === "explanation") {
    if (/explain|hidden group|ranking explanation|ranking outcome/.test(text)) score += 3
    if (/ranking|rankings|rank/.test(title)) score += 1
  }
  if (role === "retrieval") {
    if (/retrieval|recommendation|recommender|document indexing|tokenizer perspective|scientific literature/.test(text)) score += 3
    if (/ranking and retrieval|retrieval|recommendation/.test(title)) score += 2
  }
  if (role === "validation") {
    if (/benchmark|evaluation|baseline|ablation|scoring target|different winner|reproduc|validat/.test(text)) score += 3
    if (/benchmark|winner|evaluation/.test(title)) score += 1
  }
  return score
}

function rankingRoleRepresentatives(
  sources: LiteratureMap["sources"],
  role: "explanation" | "retrieval" | "validation",
  usedTitles: Set<string>,
  limit = 2,
) {
  const ranked = sources
    .map((source, index) => ({ source, index, score: rankingLiteratureRoleScore(source, role) }))
    .filter((item) => item.score > 0 && !usedTitles.has(literatureDisplayTitle(item.source)))
    .sort((left, right) => right.score - left.score || left.index - right.index)
  const selected = ranked.slice(0, limit).map((item) => literatureDisplayTitle(item.source))
  for (const title of selected) usedTitles.add(title)
  return selected
}

function sourceReferenceNumber(map: LiteratureMap, source: LiteratureMap["sources"][number]) {
  const verified = map.sources.filter((item) => item.verification.status === "verified")
  const referenceSources = verified.length > 0 ? verified : map.sources
  const index = referenceSources.findIndex((item) => item.source_id === source.source_id)
  return index >= 0 ? index + 1 : undefined
}

function literatureDisplayTitleWithCitation(map: LiteratureMap, source: LiteratureMap["sources"][number]) {
  const number = sourceReferenceNumber(map, source)
  return `${literatureDisplayTitle(source)}${number ? ` [${number}]` : ""}`
}

function rankingRoleRepresentativesWithCitations(
  map: LiteratureMap,
  sources: LiteratureMap["sources"],
  role: "explanation" | "retrieval" | "validation",
  usedTitles: Set<string>,
  limit = 2,
) {
  const ranked = sources
    .map((source, index) => ({ source, index, title: literatureDisplayTitle(source), score: rankingLiteratureRoleScore(source, role) }))
    .filter((item) => item.score > 0 && !usedTitles.has(item.title))
    .sort((left, right) => right.score - left.score || left.index - right.index)
  const selected = ranked.slice(0, limit)
  for (const item of selected) usedTitles.add(item.title)
  return selected.map((item) => literatureDisplayTitleWithCitation(map, item.source))
}

function literatureClusterSummary(cluster: LiteratureMap["clusters"][number]) {
  const label = literatureTopicText(cluster.label)
  const keywords = cluster.keywords
    .map(literatureTopicText)
    .filter((keyword) => keyword && keyword !== label)
    .slice(0, 4)
  if (keywords.length === 0) return label
  return `${label}（${keywords.join("、")}）`
}

function literatureTopicText(value: string) {
  return paperProseText(value).replace(/可复现代码论文/g, "可复现论文到代码执行").replace(/代码论文/g, "论文到代码执行")
}

function literatureRelevanceSummary(source: LiteratureMap["sources"][number]) {
  const topics = (source.topics ?? []).map(paperProseText).filter(Boolean)
  const abstract = source.abstract?.trim()
  const roles = literatureRoleTags(source)
  if (abstract && /[\u3400-\u9fff]/.test(abstract)) return compactClaimText(paperProseText(abstract), 130)
  if (abstract && roles.length > 0) return `已核验英文摘要；作用：${roles.join("、")}。`
  if (abstract && topics.length > 0) return `已核验英文摘要；主题：${topics.join("、")}。`
  if (abstract) return "已核验英文摘要；详细内容保留在来源清单。"
  if (roles.length > 0) return roles.join("、")
  return topics.join("、") || "无摘要"
}

function literatureSynthesisSummary(map: LiteratureMap, sources: LiteratureMap["sources"]) {
  if (sources.length === 0) return undefined
  const roleTags = [...new Set(sources.flatMap(literatureRoleTags))]
  const clusterLabels = map.clusters.map((cluster) => literatureTopicText(cluster.label)).filter(Boolean)
  const taxonomy = roleTags.length > 0 ? roleTags : clusterLabels
  if (taxonomy.length === 0) return undefined
  const taxonomyText = taxonomy.slice(0, 4).join("、")
  const clusterText = clusterLabels.length > 0 ? `${clusterLabels.slice(0, 3).join("、")}等主题线索说明这些方向已经形成可追踪背景；` : ""
  return `综合来看，相关工作可分为 ${taxonomy.length} 类：${taxonomyText}。${clusterText}本文不把这些工作简单当作背景罗列，而是用它们界定本研究的比较边界：已有研究说明工具调用、智能体协作或复现评测为何重要，本文进一步要求代码证据、实验协议和容器复现同时支撑正文结论。`
}

function literatureContrastSummary(sources: LiteratureMap["sources"]) {
  const sourceRoles = sources.map((source) => ({
    source,
    roles: literatureRoleTags(source),
    title: literatureDisplayTitle(source),
  }))
  const roles = [...new Set(sourceRoles.flatMap((item) => (item.roles.length > 0 ? item.roles : ["未归类背景"])))]
  const usedTitles = new Set<string>()
  const roleGroups = new Map<string, string[]>()
  for (const role of roles) {
    const titles: string[] = []
    for (const item of sourceRoles) {
      const itemRoles = item.roles.length > 0 ? item.roles : ["未归类背景"]
      if (!itemRoles.includes(role) || usedTitles.has(item.title)) continue
      titles.push(item.title)
      usedTitles.add(item.title)
      if (titles.length >= 2) break
    }
    if (titles.length > 0) roleGroups.set(role, titles)
  }
  for (const source of sources) {
    if (usedTitles.has(literatureDisplayTitle(source))) continue
    const roles = literatureRoleTags(source)
    const role = roles[0] ?? "未归类背景"
    const titles = roleGroups.get(role) ?? []
    if (titles.length < 2) {
      titles.push(literatureDisplayTitle(source))
      usedTitles.add(literatureDisplayTitle(source))
      roleGroups.set(role, titles)
    }
  }
  const grouped = [...roleGroups.entries()].slice(0, 3)
  if (grouped.length === 0) return undefined
  const fragments = grouped.map(([role, titles]) => `${role}方向以 ${titles.join("、")} 为代表`).join("；")
  return `对比这些方向，${fragments}。而本文的差异在于：相关工作只提供外部参照，正文结论必须同时经过代码证据、显式基线、消融和容器复现约束，不能把执行链路本身写成未经验证的性能贡献。`
}

function literatureEvidenceSummary(input: ComposeDraftPaperInput) {
  const map = input.literature_map
  if (!map || map.sources.length === 0) return undefined
  const verified = map.sources.filter((source) => source.verification.status === "verified")
  const selected = verified.length > 0 ? verified : map.sources
  const rows = selected.slice(0, 5).map((source) => [
    literatureDisplayTitle(source),
    displayVerificationStatus(source.verification.status),
    referenceLocator(source),
    literatureRelevanceSummary(source),
  ])
  const clusterText =
    map.clusters.length > 0
      ? `这些文献形成 ${map.clusters.length} 条主题线索：${map.clusters
          .slice(0, 3)
          .map(literatureClusterSummary)
          .join("；")}。`
      : "这些文献尚未形成稳定主题线索。"
  const gapText = map.diagnostics.gaps.length > 0 ? `剩余缺口：${map.diagnostics.gaps.map(paperProseText).join("、")}。` : "当前相关工作没有登记阻断性缺口。"
  const verifiedHeading = verified.length > 0 ? "相关工作" : "候选文献"
  const verifiedClaim =
    verified.length > 0
      ? `本文纳入 ${map.summary.total_sources} 条相关文献记录，其中 ${map.summary.verified_sources} 条已验证，${map.summary.open_license_sources} 条${displayLicenseStatus("clear")}。`
      : `本文仅纳入 ${map.summary.total_sources} 条候选文献，尚未完成来源验证；这些条目只能提示检索方向，不能作为已验证相关工作。`
  return joinBlocks([
    `${verifiedClaim}${clusterText}${gapText}`,
    verified.length > 0 ? literatureSynthesisSummary(map, selected) : undefined,
    markdownTable([verifiedHeading, "验证状态", "定位信息", "相关性"], rows),
    verified.length > 0
      ? literatureContrastSummary(selected)
      : "由于当前文献记录未验证，正文不能把这些条目写成领域共识或新颖性证明；需要后续用授权检索、DOI/arXiv 元数据或来源核验补齐相关工作。",
  ])
}

function rankingRelatedWorkSummary(input: ComposeDraftPaperInput) {
  const map = input.literature_map
  if (!map || map.sources.length === 0) {
    return joinBlocks([
      "候选论文排序任务与三类研究相邻：排序解释研究关注排序结果为何发生变化，检索与推荐评测研究关注候选集合和相关性标注，复现与验证研究关注实验结果能否被重复。",
      "本文与这些方向的交点在于排序结果必须同时有接口定义、显式对照和复现记录支撑；缺少任一环节时，候选论文排序只能作为探索性结果呈现。",
    ])
  }
  const verified = map.sources.filter((source) => source.verification.status === "verified")
  const selected = (verified.length > 0 ? verified : map.sources).slice(0, 5)
  const usedTitles = new Set<string>()
  const explanationWorks = rankingRoleRepresentativesWithCitations(map, selected, "explanation", usedTitles, 1)
  const retrievalWorks = rankingRoleRepresentativesWithCitations(map, selected, "retrieval", usedTitles, 1)
  const reproducibilityWorks = rankingRoleRepresentativesWithCitations(map, selected, "validation", usedTitles)
  const representativeLead = (label: string, values: string[]) =>
    values.length > 0 ? `${label}以 ${values.join("、")} 为代表，强调` : `${label}强调`
  return joinBlocks([
    `候选论文排序任务连接了三条研究线索。${representativeLead("排序解释研究", explanationWorks)}排序结果如何因评分因素、群体约束或解释目标而变化；这类研究为 rankAgentTeamPapers 的结果解释提供背景。`,
    `${representativeLead("检索与推荐评测研究", retrievalWorks)}候选集合、相关性标注和检索目标如何影响排序质量；本文据此把排序 nDCG@3、词项匹配基线和候选论文集合放入同一评价协议。`,
    `${representativeLead("复现与验证研究", reproducibilityWorks)}基线、消融、评价目标和重复执行对结果解释的重要性；本文据此加入无证据覆盖消融和容器复现。`,
    "因此，本文的相关工作边界不是一般的长文生成或工具调用，而是候选论文排序方法如何在显式对照、检索评测和可复现执行约束下形成可比较结果。",
  ])
}

function referenceLocator(source: LiteratureMap["sources"][number]) {
  const url = source.url?.trim()
  if (source.doi) return url ? `doi:${source.doi} (${url})` : `doi:${source.doi}`
  if (source.arxiv_id) {
    const arxivUrl = url || `https://arxiv.org/abs/${source.arxiv_id}`
    return `arXiv:${source.arxiv_id} (${arxivUrl})`
  }
  return url || "缺少可核验定位信息"
}

function referenceAuthors(source: LiteratureMap["sources"][number]) {
  const authors = source.authors?.map((author) => author.trim()).filter(Boolean) ?? []
  if (authors.length === 0) return undefined
  if (authors.length <= 6) return authors.join("; ")
  return `${authors.slice(0, 6).join("; ")} et al.`
}

function referenceEntry(source: LiteratureMap["sources"][number], index: number) {
  const published = source.version.published_at ? ` 发表时间：${source.version.published_at}。` : ""
  const retrieved = source.version.retrieved_at ? ` 检索时间：${source.version.retrieved_at}。` : ""
  const title = literatureDisplayTitle(source)
  const authors = referenceAuthors(source)
  const head = authors ? `${authors}. ${title}` : title
  return `${index + 1}. ${head}. ${referenceLocator(source)}.${published}${retrieved}`
}

function referencesSummary(input: ComposeDraftPaperInput) {
  const map = input.literature_map
  if (!map || map.sources.length === 0) {
    return "当前运行没有登记可验证参考文献。进入投稿前必须补充 DOI、arXiv、出版社页面或其他可复核来源。"
  }
  const verified = map.sources.filter((source) => source.verification.status === "verified")
  if (verified.length === 0) {
    return "当前只有未验证候选文献；这些条目不能进入正式参考文献。进入投稿前必须完成 DOI、arXiv 元数据或来源核验。"
  }
  return joinBlocks([
    verified.slice(0, 20).map(referenceEntry).join("\n"),
    verified.length < map.sources.length
      ? `另有 ${map.sources.length - verified.length} 条候选文献尚未验证，未列入正式参考文献。`
      : undefined,
  ])
}

function humanizeExperimentText(value: string) {
  return value
    .replace(/^Create a reproducible evaluation plan before allowing final paper claims\.$/, "为结论性表述提供可复现的评价依据。")
    .replace(/^Strong sparse retrieval baseline for retrieval-style CS\/AI papers\.$/, "作为检索类任务的稀疏检索对照。")
    .replace(/^Common neural retrieval baseline for embedding-based methods\.$/, "作为嵌入式方法的神经检索对照。")
    .replace(/^End-to-end retrieval augmented generation baseline\.$/, "作为端到端 RAG 流水线对照。")
    .replace(/^Tests whether claim-ledger evidence tracking contributes to the result\.$/, "检验移除证据追踪后结果是否下降。")
    .replace(/^Baseline runner declared by package script\.$/, "仓库 package.json 显式声明的基线运行入口。")
    .replace(/^Ablation runner declared by package script\.$/, "仓库 package.json 显式声明的消融运行入口。")
    .replace(/^If fewer than two baselines can run, downgrade to an engineering report\.$/, "少于两个基线可运行时降级为工程报告。")
    .replace(/^If datasets are unavailable, turn to the nearest open verified benchmark\.$/, "数据集不可用时转向最近的开放可验证 benchmark。")
    .replace(/^If container reproduction fails, block final paper claims\.$/, "容器复现失败时阻断结论性表述。")
}

function humanizeLabel(value: string) {
  const normalizedLabel = displayExperimentLabel(value)
  if (normalizedLabel !== value.replace(/[-_]+/g, " ")) return normalizedLabel
  return value
    .replace(/^Code-grounded paper_fucker workflow$/, "代码证据驱动工作流")
    .replace(/^baseline:ranking-lexical$/, "词项匹配基线")
    .replace(/^ablation:ranking-no-coverage$/, "无证据覆盖消融")
    .replace(/^BM25 lexical retrieval$/, "BM25 稀疏检索")
    .replace(/^Dense bi-encoder retrieval$/, "Dense bi-encoder 检索")
    .replace(/^Standard RAG pipeline$/, "标准 RAG 流水线")
    .replace(/^Ablation without claim ledger$/, "移除证据台账的消融设置")
    .replace(/^baseline:(.+)$/, (_, name) => `基线：${displayExperimentLabel(String(name))}`)
    .replace(/^ablation:(.+)$/, (_, name) => `消融：${displayExperimentLabel(String(name))}`)
}

function humanizeProposedLabel(input: ComposeDraftPaperInput) {
  const label = input.experiment_plan?.proposed.label
  if (!label) return contextualProposedLabel(input)
  if (/paper_fucker workflow|code-grounded/i.test(label) && isRankingMetric(input.experiment_plan?.proposed.expected_metric ?? input.result_report?.primary_metric)) {
    return contextualProposedLabel(input)
  }
  return humanizeLabel(label)
}

function isRankingContext(input: ComposeDraftPaperInput) {
  return isRankingMetric(input.result_report?.primary_metric ?? input.experiment_plan?.proposed.expected_metric)
}

function semanticExperimentRationale(input: ComposeDraftPaperInput, role: "baseline" | "ablation", experimentId: string, label: string, fallback: string) {
  if (!isRankingContext(input)) return humanizeExperimentText(fallback)
  const text = `${experimentId} ${label} ${fallback}`.toLowerCase()
  if (role === "baseline" && /lexical|词项/.test(text)) {
    return "词项匹配基线用于只依赖查询词重合的排序对照，检验代码证据排序是否优于简单词项排序。"
  }
  if (role === "ablation" && /(no[-_\s]?coverage|coverage|证据覆盖)/.test(text)) {
    return "无证据覆盖消融用于移除 claim_coverage 对排序得分的贡献，检验证据覆盖特征是否影响候选排序。"
  }
  return humanizeExperimentText(fallback)
}

function dataAvailabilitySummary(input: ComposeDraftPaperInput) {
  const data = input.data_plan
  if (!data) return "尚未生成数据计划；数据来源、许可和访问约束需要补充。"
  if (data.datasets.length === 0) {
    const codeSources = input.ledger.entries.some((entry) => entry.source_ids.some((source) => source.startsWith("material:code:")))
    const visibleGaps = codeSources
      ? data.diagnostics.gaps.filter((gap) => gap !== "missing_dataset_candidates")
      : data.diagnostics.gaps
    const gaps = visibleGaps.length > 0 ? `缺口：${visibleGaps.join("; ")}。` : ""
    if (codeSources) {
      const codeAvailability = codeAvailabilitySummary(input)
      return [
        "本次研究使用代码仓库和实验脚本作为主要证据，未登记外部数据集。",
        gaps,
        codeAvailability,
        "因此结果解释限定在当前代码工作区、显式实验协议和复现记录内。",
      ]
        .filter(Boolean)
        .join("\n\n")
    }
    return `本研究尚未登记可用数据集。${gaps} 因此实验结果只能依赖用户提供的显式实验记录；若缺少实验记录，结论性表述必须保持阻断。`
  }
  const datasetLines = data.datasets.slice(0, 5).map((dataset) => {
    const license = displayDatasetLicense(dataset.license.expression ?? dataset.license.status)
    const metadata = dataset.verification.diagnostics
      ?.map(displayDatasetDiagnostic)
      .filter(Boolean)
      .join("；") || "无补充说明"
    return [dataset.title, displayDatasetAccess(dataset.access), license, displayVerificationStatus(dataset.verification.status), metadata]
  })
  const conflicts =
    data.license_conflicts.length > 0
      ? `\n\n许可冲突：${data.license_conflicts.length} 个数据集仍需处理。`
      : ""
  const constraints =
    data.access_constraints.length > 0
      ? `\n\n访问约束：${data.access_constraints.map((constraint) => displayDatasetAccess(constraint.access)).join("、")}。`
      : ""
  const codeAvailability = codeAvailabilitySummary(input)
  return [
    `本研究使用 ${data.datasets.length} 个可核验数据集，数据来源、许可和核验结果如下。`,
    "",
    markdownTable(["数据集", "访问", "许可", "验证", "说明"], datasetLines),
    codeAvailability ? `\n\n${codeAvailability}` : "",
    conflicts,
    constraints,
  ].join("\n")
}

function codeAvailabilitySummary(input: ComposeDraftPaperInput) {
  const ranges = methodSourceRangeSummaries(input)
  const entrypoints = experimentEntrypointLabels(input)
  if (ranges.length === 0 && entrypoints.length === 0) return undefined
  const implementation = ranges.length > 0 ? `方法实现包括 ${ranges.join("、")}。` : "方法实现入口尚未登记。"
  const reproduction = entrypoints.length > 0 ? `复现实验入口包括${chineseList(entrypoints)}。` : "复现实验入口尚未登记。"
  const packageName = input.code_metadata?.package_name ?? "未登记"
  const repository = input.code_metadata?.repository_url ?? "未登记"
  const version = input.code_metadata?.version ?? "未登记"
  const revision = input.code_metadata?.commit_hash
  const worktreeDirty = input.code_metadata?.worktree_dirty
  const license = input.code_metadata?.license ?? "未登记"
  const revisionText = revision ? `；代码修订：${revision}` : ""
  const worktreeText =
    typeof worktreeDirty === "boolean" ? `；代码工作区状态：${worktreeDirty ? "含未提交或未跟踪变更" : "干净"}` : ""
  return [
    "代码可用性：",
    implementation,
    reproduction,
    `代码包：${packageName}；代码仓库地址：${repository}；代码版本：${version}${revisionText}${worktreeText}；代码许可证：${license}。`,
  ].join("\n")
}

function displayDatasetDiagnostic(value: string) {
  if (value.startsWith("schema_version:")) {
    const schema = value.slice("schema_version:".length)
    if (schema === "LiveArxivRankingDataset.v1") return "实时 arXiv 排名评测集"
    return schema.replace(/\.v\d+$/i, "").replace(/[-_]+/g, " ")
  }
  if (value.startsWith("provenance:")) {
    const provenance = value.slice("provenance:".length)
    if (provenance === "live-arxiv-search+abs-page") return "来源为实时 arXiv 检索和摘要页核验"
    return `来源为${provenance.replace(/[-_+]+/g, " ")}`
  }
  if (value.startsWith("candidate_count:")) return `候选数 ${value.slice("candidate_count:".length)}`
  if (value.startsWith("label_policy:")) {
    const policy = value.slice("label_policy:".length)
    if (/Deterministic validation labels derived from live arXiv search rank/i.test(policy)) {
      return "标签由实时 arXiv 检索排序、论文排序主题匹配、来源元数据完整度和发表时间确定，不是人工相关性标注"
    }
    if (/Deterministic validation labels derived from query-term overlap/i.test(policy)) {
      return "标签由检索词重合、来源元数据完整度和发表时间确定，不是人工相关性标注"
    }
    return `标签策略为${paperProseText(policy)}`
  }
  return ""
}

function experimentProtocolSummary(input: ComposeDraftPaperInput) {
  const plan = input.experiment_plan
  if (!plan) return "尚未生成实验计划；需要补充评估目标、指标、基线、消融、资源预算和降级策略。"
  const protocol = input.experiment_protocol
  const downgradePolicy = plan.downgrade_policy
    .map(humanizeExperimentText)
    .map((item) =>
      isRankingContext(input)
        ? item
            .replace("少于两个基线可运行时降级为工程报告", "少于两个基线可运行时只报告探索性实验记录")
            .replace("数据集不可用时转向最近的开放可验证 benchmark", "数据集不可用时转向最近的开放可验证评测集")
            .replace("容器复现失败时阻断结论性表述", "容器复现失败时将跨环境结果标为探索性观察")
        : item,
    )
    .map((item) => item.replace(/[。.]$/, ""))
    .join("；")
  const metricTable = markdownTable(
    ["指标", "方向", "角色"],
    plan.metrics.map((metric) => [displayMetricName(metric.name), displayMetricDirection(metric.direction), metric.primary ? "主指标" : "辅助指标"]),
  )
  const baselineTable = markdownTable(
    ["编号", "设置", "理由"],
    plan.baselines
      .slice(0, 8)
      .map((baseline) => [
        displayExperimentLabel(baseline.experiment_id),
        humanizeLabel(baseline.label),
        semanticExperimentRationale(input, "baseline", baseline.experiment_id, baseline.label, baseline.rationale),
      ]),
  )
  const ablationTable = markdownTable(
    ["编号", "设置", "理由"],
    plan.ablations
      .slice(0, 8)
      .map((ablation) => [
        displayExperimentLabel(ablation.experiment_id),
        humanizeLabel(ablation.label),
        semanticExperimentRationale(input, "ablation", ablation.experiment_id, ablation.label, ablation.rationale),
      ]),
  )
  const intro = isRankingContext(input)
    ? "实验协议围绕评价对象、主指标、基线和消融展开，目的是比较排序规则在同一候选集上的表现。评价目标是候选论文排序质量。"
    : `实验协议围绕评价对象、主指标、基线和消融展开，用来判断结果是否足以支撑结论性表述。评价目标是${humanizeExperimentText(plan.objective).replace(/[。.]$/, "")}。`
  const missingBaseline = isRankingContext(input)
    ? "当前没有基线运行入口；该缺口会使结果只能作为探索性观察。"
    : "当前没有基线运行入口；该缺口会阻断结论性表述。"
  return [
    intro,
    "",
    "### 指标",
    metricTable,
    "",
    `本文方法的评价对象为“${humanizeProposedLabel(input)}”，主指标为“${displayMetricName(plan.proposed.expected_metric)}”。`,
    "",
    "### 基线",
    baselineTable || missingBaseline,
    "",
    "### 消融",
    ablationTable || "当前没有消融运行入口；贡献强度需要保持保守。",
    "",
    protocol
      ? `实验协议包含 ${protocol.entries.length} 个可执行入口，来源为${isRankingContext(input) && protocol.discovered_from === "package_scripts" ? "复现实验入口" : displayProtocolSource(protocol.discovered_from)}；${protocol.gaps.length > 0 ? `仍需处理的协议缺口包括：${protocol.gaps.map(paperProseText).join("、")}。` : "当前实验协议完整。"}`
      : "当前没有显式仓库实验协议；流程只能根据已登记证据和受控执行结果组织评价。",
    "",
    `资源预算为运行时间<=${plan.resource_budget.max_wall_time_seconds}s、内存<=${plan.resource_budget.max_memory_mb}MB、GPU<=${plan.resource_budget.max_gpu_hours ?? 0} 小时。降级策略：${downgradePolicy}。`,
  ].join("\n")
}

function experimentGuidanceSummary(input: ComposeDraftPaperInput) {
  const guidance = input.experiment_guidance
  if (!guidance || guidance.status === "complete" || guidance.suggestions.length === 0) return undefined
  const lines = guidance.suggestions.slice(0, 8).map((item) => {
    const example = item.package_json_example ? `; package.json scripts ${JSON.stringify(item.package_json_example)}` : ""
    return `- ${item.gap}: ${item.next_action}; recommended=${item.recommended_script}${example}`
  })
  return [
    guidance.summary,
    guidance.final_export_blocked ? "在这些协议缺口补齐前，结论性表述必须保持阻断；待修复草稿只能作为待补实验清单。" : "",
    ...lines,
  ]
    .filter(Boolean)
    .join("\n")
}

function experimentStarterPackSummary(input: ComposeDraftPaperInput) {
  const starter = input.experiment_starter_pack
  if (!starter || starter.status !== "ready") return undefined
  const scripts = Object.entries(starter.package_json_scripts)
    .slice(0, 8)
    .map(([name, command]) => `- ${name}: ${command}`)
  const files = starter.files.slice(0, 8).map((file) => {
    const artifact = file.artifact_path ? `; artifact=${file.artifact_path}` : ""
    return `- ${file.path}: ${file.purpose}${artifact}`
  })
  return [
    starter.summary,
    "",
    "Suggested package.json scripts:",
    ...scripts,
    "",
    "Starter files:",
    ...files,
    "",
    "Next steps:",
    ...starter.next_steps.map((step) => `- ${step}`),
  ].join("\n")
}

function experimentRunSummary(input: ComposeDraftPaperInput) {
  const runs = input.experiment_runs
  if (!runs) return "尚未登记具体实验执行结果。"
  const rows = [...runs.host_runs, ...runs.container_runs].slice(0, 12).map((run) => {
    const metrics = run.metrics.length > 0 ? run.metrics.map((metric) => `${displayMetricName(metric.name)}=${displayMetricValue(metric.name, metric.value)}${displayMetricUnit(metric.name, metric.unit)}`).join(", ") : "无指标"
    const mode = run.environment.mode
    const environment = mode === "container" ? "container:repro-env" : `${mode}:${run.environment.platform}`
    return [
      displayEnvironment(environment),
      contextualExperimentLabel(input, run.experiment_id, run.role),
      displayExperimentRole(run.role),
      displayRunStatus(run.status),
      metrics,
      `${run.resource_usage.wall_time_seconds}s`,
    ]
  })
  return rows.length > 0
    ? [
        "表 3 汇总本机与容器实验的状态、主指标和耗时，用于说明复现一致性。",
        "该摘要只保留解释结果所需的信息：环境、实验角色、状态、主指标和耗时。这样可以让读者直接判断复现是否支持正文结论，而不把可复现性章节变成运行记录清单。若状态或指标不一致，相应结论应降级为探索性观察。",
        "",
        markdownTable(["环境", "实验", "角色", "状态", "指标", "耗时"], rows),
      ].join("\n")
    : "没有可展示的实验执行摘要。"
}

function experimentResourceBoundarySummary(input: ComposeDraftPaperInput) {
  const runs = input.experiment_runs
  if (!runs) return undefined
  const allRuns = [...runs.host_runs, ...runs.container_runs]
  if (allRuns.length === 0) return undefined
  const hasWallTime = allRuns.some((run) => typeof run.resource_usage.wall_time_seconds === "number")
  const hasMemory = allRuns.some((run) => typeof run.resource_usage.peak_memory_mb === "number")
  const hasGpu = allRuns.some((run) => typeof run.resource_usage.gpu_hours === "number")
  const recorded = [
    hasWallTime ? "耗时" : undefined,
    hasMemory ? "峰值内存" : undefined,
    hasGpu ? "GPU 用量" : undefined,
  ].filter((item): item is string => Boolean(item))
  const missing = [
    hasMemory ? undefined : "峰值内存",
    hasGpu ? undefined : "GPU 用量",
  ].filter((item): item is string => Boolean(item))
  const formatResourceList = (values: string[]) => chineseList(values).replace(/和([A-Za-z0-9])/g, "和 $1")
  const recordedText = recorded.length > 0 ? formatResourceList(recorded) : "运行状态"
  const missingText =
    missing.length > 0
      ? `；未登记${formatResourceList(missing)}，因此不能把资源结论外推到未记录维度`
      : "，资源记录覆盖当前可用运行维度"
  return `资源记录边界：当前实验记录包含${recordedText}${missingText}。`
}

function displayPlatformName(platform: NodeJS.Platform | "container") {
  if (platform === "win32") return "Windows"
  if (platform === "darwin") return "macOS"
  if (platform === "linux") return "Linux"
  if (platform === "container") return "容器"
  return platform
}

function experimentEnvironmentDeclaration(input: ComposeDraftPaperInput) {
  const runs = input.experiment_runs
  if (!runs) return undefined
  const host = runs.host_runs.find((run) => run.environment.mode === "host")?.environment
  const container = runs.container_runs.find((run) => run.environment.mode === "container")?.environment
  const rows: string[] = []
  if (host) {
    const node = host.node ? `，Node.js ${host.node}` : ""
    rows.push(`本机平台：${displayPlatformName(host.platform)}${node}。`)
  }
  if (container) {
    const digest = container.digest ? `，摘要 ${container.digest}` : ""
    rows.push(container.image ? `容器镜像：${container.image}${digest}。` : "容器环境：已登记隔离复现环境。")
  }
  if (rows.length === 0) return undefined
  return ["实验环境声明：", ...rows.map((row) => `- ${row}`)].join("\n")
}

function commandText(command: { argv: string[] }) {
  return command.argv.join(" ")
}

function metricLookup(run: Pick<ExperimentRun, "metrics">, metric: string) {
  return run.metrics.find((item) => item.name === metric)?.value
}

function experimentDesignCounts(input: ComposeDraftPaperInput) {
  const baseline = input.experiment_plan?.baselines.length ?? 0
  const ablation = input.experiment_plan?.ablations.length ?? 0
  const protocolContainer = input.experiment_protocol?.entries.filter((entry) => entry.role === "container_reproduction").length ?? 0
  const containerRuns = input.experiment_runs?.container_runs.length ?? 0
  const hostRuns = input.experiment_runs?.host_runs.length ?? 0
  return {
    baseline,
    ablation,
    container: protocolContainer > 0 ? protocolContainer : containerRuns,
    hostRuns,
    containerRuns,
  }
}

function experimentDesignCountsText(input: ComposeDraftPaperInput) {
  const counts = experimentDesignCounts(input)
  return `基线=${counts.baseline}、消融=${counts.ablation}、容器复现=${counts.container}`
}

function researchQuestionsSummary(input: ComposeDraftPaperInput) {
  const ready = finalReady(input)
  const metric = displayMetricName(input.result_report?.primary_metric ?? input.experiment_plan?.proposed.expected_metric ?? "primary_metric")
  if (isRankingContext(input)) {
    return joinBlocks([
      "本文围绕候选论文排序任务提出三项研究问题：排序机制是否明确，证据覆盖特征是否带来增益，运行环境是否影响观察结果。",
      "RQ1 排序机制：relevance、claim_coverage 和 recency 的组合能否形成明确的候选论文排序规则？",
      `RQ2 特征贡献：引入 claim_coverage 后，相比词项匹配基线和无证据覆盖消融，在${metric} 上是否改善前三位排序？`,
      `RQ3 环境一致性：本机和容器环境能否得到一致的${metric} 结果？`,
      ready
        ? "方法章节回答 RQ1，结果章节回答 RQ2，可复现性章节回答 RQ3；附录列出实现定位和复现实验入口。"
        : "方法章节给出排序机制，结果与可复现性章节只报告已有观察；缺失实验会在限制中说明。",
    ])
  }
  const design = experimentDesignCountsText(input)
  return joinBlocks([
    `本文将研究目标拆分为三项可复核问题：证据是否足以支撑方法，${design} 的对照是否能形成可比较结果，以及复现状态是否支撑结果表述。`,
    "RQ1 证据边界：提交的代码、方法描述和源码范围是否足以支撑正文中的方法断言？",
    `RQ2 对照有效性：本文方法、基线和消融是否围绕“${metric}”这一主指标形成可比较记录？`,
    "RQ3 复现一致性：本机与隔离环境中的状态和主指标是否一致，从而支撑结果表述？",
    ready
      ? "当前证据链已满足结果表述条件，正文只保留已绑定来源和实验结果的结论；完整证据索引放在附录。"
      : "当前证据链尚未满足结果表述条件，正文会把结论限定为探索性观察，并把缺口写成修复清单。",
  ])
}

function methodSymbolNames(value?: string) {
  if (!value) return []
  const matches = value.match(/\b[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b/g) ?? []
  return [...new Set(matches)].slice(0, 3)
}

function contributionEvidenceSubject(input: ComposeDraftPaperInput, methodClaim?: string) {
  const metric = input.result_report?.primary_metric ?? input.experiment_plan?.proposed.expected_metric
  const methodText = [
    methodClaim,
    ...input.ledger.entries.filter((entry) => entry.section_id === "method").map((entry) => entry.text),
  ]
    .filter(Boolean)
    .join(" ")
  const symbols = methodSymbolNames(methodText)
  if (isRankingMetric(metric)) {
    if (symbols.length >= 2) return `${codeSymbolPhrase(symbols)} 构成的候选论文排序接口`
    return symbols.length === 1 ? `${symbols[0]} 构成的候选论文排序接口` : "论文排序接口"
  }
  return symbols.length > 0 ? `${symbols.slice(0, 2).join("、")} 等代码接口` : "源码范围"
}

function methodEvidenceText(input: ComposeDraftPaperInput) {
  return input.ledger.entries
    .filter((entry) => entry.section_id === "method")
    .map((entry) => entry.text)
    .join(" ")
}

function codeSymbolPhrase(symbols: string[]) {
  if (symbols.length === 0) return ""
  if (symbols.length === 1) return symbols[0]
  return `${symbols[0]} 和 ${symbols[1]}`
}

function commandPurposeLabel(command?: { argv: string[] }) {
  const raw = command?.argv.at(-1)
  const token = raw?.trim().split(/\s+/).at(-1)
  if (!token || /^(proposed|baseline|ablation)$/i.test(token)) return undefined
  return token ? paperProseText(token) : undefined
}

function experimentEntrypointLabels(input: ComposeDraftPaperInput) {
  const labels = [
    commandPurposeLabel(input.experiment_plan?.proposed.command),
    ...(input.experiment_plan?.baselines.map((item) => commandPurposeLabel(item.command)) ?? []),
    ...(input.experiment_plan?.ablations.map((item) => commandPurposeLabel(item.command)) ?? []),
    ...(input.experiment_runs?.container_runs.map((item) => commandPurposeLabel(item.command)) ?? []),
    ...(input.experiment_protocol?.entries.map((item) => commandPurposeLabel(item.command)) ?? []),
  ].filter((item): item is string => Boolean(item))
  return [...new Set(labels)].slice(0, 4)
}

function chineseList(values: string[]) {
  if (values.length <= 1) return values[0] ?? ""
  if (values.length === 2) return `${values[0]}和${values[1]}`
  return `${values.slice(0, -1).join("、")}和${values.at(-1)}`
}

function methodFocusSummary(input: ComposeDraftPaperInput, fallback?: string, style: "abstract" | "introduction" | "related" = "abstract") {
  const metric = input.result_report?.primary_metric ?? input.experiment_plan?.proposed.expected_metric
  const symbols = methodSymbolNames(methodEvidenceText(input))
  if (isRankingMetric(metric) && symbols.length > 0) {
    const symbolPhrase = codeSymbolPhrase(symbols)
    const entrypoints = experimentEntrypointLabels(input)
    const entrypointText = entrypoints.length > 0 ? `，并以${chineseList(entrypoints)}约束排序结果` : ""
    if (style === "introduction") {
      return `本文聚焦 ${symbolPhrase} 构成的候选论文排序接口${entrypointText}；正文围绕排序接口、实验入口、基线/消融和结论边界展开。`
    }
    if (style === "related") {
      return `与既有工具使用、智能体协作或实验复现研究相比，本研究把相关工作边界放在候选论文排序任务上：${symbolPhrase} 提供可复核排序接口${entrypointText}。`
    }
    return `本文方法围绕 ${symbolPhrase} 构成的候选论文排序接口展开${entrypointText}。`
  }
  return fallback
}

function parsedScoreFeatures(input: ComposeDraftPaperInput) {
  const text = methodEvidenceText(input)
  const combines = text.match(/scorePaper\s+combines\s+(.+?)(?:[.。]|$)/i)
  if (combines?.[1]) {
    return combines[1]
      .split(/\s*,\s*|\s+and\s+|、|和/)
      .map((item) => item.trim().replace(/^and\s+/i, ""))
      .filter(Boolean)
      .slice(0, 5)
  }
  const scorePaperIndex = text.search(/scorePaper\b/i)
  if (scorePaperIndex < 0) return []
  const scorePaperText = text.slice(scorePaperIndex)
  if (!/\breturns\b/i.test(scorePaperText)) return []
  return [...scorePaperText.matchAll(/\bitem\.([A-Za-z0-9_]+)/g)].map((match) => match[1]).filter(Boolean).slice(0, 5)
}

function parsedScoreWeights(input: ComposeDraftPaperInput) {
  const text = methodEvidenceText(input)
  const scorePaperIndex = text.search(/scorePaper\b/i)
  if (scorePaperIndex < 0) return []
  const scorePaperText = text.slice(scorePaperIndex)
  if (!/\breturns\b/i.test(scorePaperText)) return []
  return [...scorePaperText.matchAll(/\bitem\.([A-Za-z0-9_]+)\s*\*\s*([0-9]+(?:\.[0-9]+)?)/g)]
    .map((match) => ({ feature: match[1] ?? "", weight: match[2] ?? "" }))
    .filter((item) => item.feature.length > 0 && item.weight.length > 0)
    .slice(0, 5)
}

function rankingScoreFormulaSummary(input: ComposeDraftPaperInput) {
  const weights = parsedScoreWeights(input)
  const required = ["relevance", "claim_coverage", "recency"]
  if (!required.every((feature) => weights.some((item) => item.feature === feature))) return undefined
  const byFeature = new Map(weights.map((item) => [item.feature, item.weight]))
  return `评分公式为：score(p) = ${byFeature.get("relevance")} * relevance(p) + ${byFeature.get("claim_coverage")} * claim_coverage(p) + ${byFeature.get("recency")} * recency(p)。其中 p 表示待排序候选论文，三项特征均按候选论文逐项计算；三个权重来自 scorePaper 的当前实现。`
}

function readableAsciiList(values: string[]) {
  if (values.length <= 1) return values[0] ?? ""
  if (values.length === 2) return `${values[0]} 和 ${values[1]}`
  return `${values.slice(0, -1).join("、")} 和 ${values.at(-1)}`
}

function methodSourceRangeSummaries(input: ComposeDraftPaperInput) {
  const matches = methodEvidenceText(input).matchAll(/\b([a-z][A-Za-z0-9]*)\(([^)]*:[0-9]+)\)/g)
  return [...matches].map((match) => `${match[1]}(${match[2]})`).slice(0, 5)
}

function methodEntrypointRoles(input: ComposeDraftPaperInput) {
  const entrypoints = experimentEntrypointLabels(input)
  if (entrypoints.length === 0) return undefined
  return `${chineseList(entrypoints)}分别约束本文方法、词项基线、证据覆盖贡献和环境可重复性`
}

function rankingMethodNarrative(input: ComposeDraftPaperInput) {
  const metric = input.result_report?.primary_metric ?? input.experiment_plan?.proposed.expected_metric
  if (!isRankingMetric(metric)) return undefined
  const symbols = methodSymbolNames(methodEvidenceText(input))
  if (!symbols.includes("rankAgentTeamPapers") || !symbols.includes("scorePaper")) return undefined
  const features = parsedScoreFeatures(input)
  const featureSentence =
    features.length > 0
      ? `scorePaper 把 ${readableAsciiList(features)} 压缩为可比较分数。`
      : "scorePaper 作为统一评分入口输出可比较分数。"
  const featureDetail =
    features.includes("relevance") && features.includes("claim_coverage") && features.includes("recency")
      ? "其中，relevance 衡量候选论文与研究主题的匹配程度，claim_coverage 衡量候选论文对当前研究问题关键断言的覆盖，recency 作为发表时间相关的弱排序信号。"
      : undefined
  const formula = rankingScoreFormulaSummary(input)
  const entrypointSentence = methodEntrypointRoles(input)
  return [
    "候选论文排序方法由 rankAgentTeamPapers 和 scorePaper 两个核心接口组成。",
    "rankAgentTeamPapers 接收候选论文集合，并按 scorePaper 输出的得分进行降序排列。",
    featureSentence,
    formula,
    featureDetail,
    entrypointSentence ? `${entrypointSentence}。` : undefined,
  ]
    .filter(Boolean)
    .join("")
}

function rankingMethodFigureSummary(input: ComposeDraftPaperInput) {
  if (!isRankingContext(input)) return undefined
  const features = parsedScoreFeatures(input)
  const featureText =
    features.includes("relevance") && features.includes("claim_coverage") && features.includes("recency")
      ? "relevance / claim_coverage / recency"
      : features.length > 0
      ? features.join(" / ")
      : "排序特征"
  const metric = displayMetricName(input.result_report?.primary_metric ?? input.experiment_plan?.proposed.expected_metric ?? "ranking_ndcg_at_3")
  const entrypoints = experimentEntrypointLabels(input).filter((entrypoint) => entrypoint !== "排名测试")
  const branch =
    entrypoints.length > 0
      ? `对照分支包括${chineseList(entrypoints)}。`
      : "对照分支包括基线、消融和复现检查。"
  const branchText = entrypoints.length > 0 ? chineseList(entrypoints) : "基线、消融和复现检查"
  return [
    "框 1 候选论文排序与复现实验流程。",
    "",
    "| 环节 | 论文角色 | 输出 |",
    "| --- | --- | --- |",
    "| 候选论文集合 | 输入 | 待排序论文列表 |",
    `| 特征计算 | ${featureText} | 候选级特征向量 |`,
    "| scorePaper 评分 | 加权评分函数 | 候选分数 |",
    "| rankAgentTeamPapers 排序 | 排序接口 | 候选顺序 |",
    `| ${metric} 评测 | 主指标 | 排序质量 |`,
    "",
    `分支检查：${branchText}。`,
    branch,
  ].join("\n")
}

function methodEvidenceNote(input: ComposeDraftPaperInput) {
  const preferred = input.ledger.entries.find((entry) => entry.section_id === "method" && entry.status === "supported")
  const fallback = input.ledger.entries.find((entry) => entry.section_id === "method")
  const entry = preferred ?? fallback
  const ranges = methodSourceRangeSummaries(input)
  const entrypoints = experimentEntrypointLabels(input)
  if (!entry && ranges.length === 0 && entrypoints.length === 0) return undefined
  if (isRankingContext(input)) {
    const rangeText = ranges.length > 0 ? `实现上，${ranges.join("、")} 标明了排序入口和评分入口` : "实现上，排序入口和评分入口均保留了可定位实现"
    const entrypointText = entrypoints.length > 0 ? `；${chineseList(entrypoints)}用于比较完整排序、词项基线、证据覆盖消融和环境一致性` : ""
    return `${rangeText}${entrypointText}。具体实现位置见附录 A。`
  }
  const rangeText = ranges.length > 0 ? `源码证据记录保留了 ${ranges.join("、")} 等接口位置` : "源码证据记录保留了接口位置"
  const entrypointText = entrypoints.length > 0 ? `，并覆盖${chineseList(entrypoints)}等可复现实验入口` : ""
  return `${rangeText}${entrypointText}。${entry ? citationText(entry) : ""}`.trim()
}

function rankingContributionsSummary(input: ComposeDraftPaperInput) {
  const metricId = input.result_report?.primary_metric ?? input.experiment_plan?.proposed.expected_metric ?? "ranking_ndcg_at_3"
  const metric = displayMetricName(metricId)
  const features = parsedScoreFeatures(input)
  const featureText = features.length > 0 ? readableAsciiList(features) : "relevance、claim_coverage 和 recency"
  const counts = experimentDesignCounts(input)
  const reproduction =
    counts.hostRuns > 0 || counts.containerRuns > 0
      ? `，并用 ${counts.hostRuns} 个本机运行和 ${counts.containerRuns} 个容器运行检查复现一致性`
      : ""
  return joinBlocks([
    "本文贡献如下：",
    [
      `1. 提出由 ${featureText} 组成的候选论文排序评分，并通过 rankAgentTeamPapers 和 scorePaper 形成候选论文排序接口。`,
      "2. 构造词项匹配基线和无证据覆盖消融，以区分简单查询词匹配、证据覆盖特征和完整排序接口的影响。",
      `3. 以${metric} 评价当前候选集的前三位排序质量${reproduction}，使性能差异与复现状态同时可见。`,
    ].join("\n"),
  ])
}

function contributionsSummary(input: ComposeDraftPaperInput) {
  const metricId = input.result_report?.primary_metric ?? input.experiment_plan?.proposed.expected_metric
  if (isRankingMetric(metricId)) return rankingContributionsSummary(input)
  const metric = displayMetricName(metricId ?? "primary_metric")
  const methodClaim = firstClaimText(input, "method")
  const resultClaim = firstClaimText(input, "results")
  const counts = experimentDesignCounts(input)
  const evidenceSubject = contributionEvidenceSubject(input, methodClaim)
  const evidenceObject = /^[A-Za-z0-9_]/.test(evidenceSubject) ? ` ${evidenceSubject}` : evidenceSubject
  const methodClaimClause = methodClaim && !isRankingMetric(metricId) ? `；核心方法断言为：${trimTerminalPunctuation(methodClaim)}` : ""
  const runEvidence =
    counts.hostRuns > 0 || counts.containerRuns > 0
      ? `，并记录 ${counts.hostRuns} 个本机运行和 ${counts.containerRuns} 个容器运行`
      : ""
  return joinBlocks([
    "本文贡献集中在三条可审查链路：",
    [
      `1. 第一项贡献是把${evidenceObject}、来源和实验记录统一为可审查证据${methodClaimClause}。`,
      `2. 第二项贡献是将本文方法与 ${counts.baseline} 个基线、${counts.ablation} 个消融放入同一评价协议，并${primaryMetricPhrase(metric).replace("主指标", "主比较指标")}${resultClaim ? `；核心结果断言为：${trimTerminalPunctuation(resultClaim)}` : ""}。`,
      `3. 第三项贡献是用本机/容器一致性检查约束结果表述${runEvidence}，避免把未复现或只在单一环境中成立的观察写成结论性表述。`,
    ].join("\n"),
    "这些贡献共同保证方法比较、复现检查和正文表述共享同一套证据边界。",
  ])
}

function systemArchitectureSummary(input: ComposeDraftPaperInput) {
  const stageRows = [
    ["Intake", "登记主题、工作区、代码/论文/数据材料和数据外传策略。", "MaterialIndex, ResearchBrief"],
    ["Planning", "生成研究图、阶段目标、模型角色和预算边界。", "ResearchRunGraph, ResearchRunController"],
    ["Code analysis", "解析代码表面、入口脚本、source range 和方法 claim。", "CodebaseMap, MethodExtraction"],
    ["Experiment design", "选择指标、本文方法、基线、消融、资源预算和降级策略。", "ExperimentPlan, ExperimentProtocol"],
    ["Execution", "在 host 和可复现环境中运行实验命令，并记录 stdout/stderr、exit code、耗时和指标。", "ExperimentRun.v1[]"],
    ["Reproduction", "比较 host/container 结果，决定 final claim 是否允许。", "ResultReport, ReproductionPlan"],
    ["Authoring", "根据 claim ledger、实验结果和审稿意见生成论文正文。", "DraftPaper, ReviewReport"],
    ["Export", "执行 final gate，写出 Markdown、LaTeX、PDF、DOCX 和 manifest。", "ExportBundle"],
  ]
  return joinBlocks([
    "PaperRun 的架构目标是让每个阶段都可重放、可诊断、可被 Preview 展示。实现上，运行目录位于用户本机 `.paper_fucker/runs/<run_id>`，阶段产物通过 artifact store 统一登记；TUI、Preview、导出器和后续 `/resume` 都读取同一份 run 状态。",
    markdownTable(["Stage", "Responsibility", "Primary Artifacts"], stageRows),
    "这条链路刻意把内部执行状态和用户可见论文分开：artifact 记录原始证据，draft 只引用已经绑定的 claim，export manifest 则说明哪些文件被写出、哪些 gate 检查已经通过。这样做的直接收益是：当模型、脚本、容器或引用检查失败时，失败会停在具体阶段，而不是把错误扩散成一篇看似完整但不可审查的论文。",
    input.experiment_runs
      ? `本次运行登记了 ${input.experiment_runs.host_runs.length} 个 host run 和 ${input.experiment_runs.container_runs.length} 个 container run，因此 Preview 可以把实验执行状态直接展示给用户。`
      : "本次运行尚未登记 ExperimentRun，因此 Preview 只能展示协议缺口和 starter pack。",
  ])
}

function studyDesignSummary(input: ComposeDraftPaperInput) {
  const metric = displayMetricName(input.result_report?.primary_metric ?? input.experiment_plan?.proposed.expected_metric ?? "primary_metric")
  const sourceCount = evidenceSourceIds(input).length
  const evidenceCount = [...new Set(input.ledger.entries.flatMap((entry) => entry.artifact_ids))].length
  const hostCount = input.experiment_runs?.host_runs.length ?? 0
  const containerCount = input.experiment_runs?.container_runs.length ?? 0
  const rows = [
    ["材料边界", `${sourceCount} 个代码、数据、论文或日志来源`, "限定正文可以讨论的范围。"],
    ["代码证据", `${evidenceCount} 个绑定方法或结果的证据记录`, "把方法表述绑定到文件、源码范围和生成证据。"],
    ["实验协议", `指标=${metric}；基线=${input.experiment_plan?.baselines.length ?? 0}；消融=${input.experiment_plan?.ablations.length ?? 0}`, "形成可比较的本文方法、基线和消融运行。"],
    ["复现执行", `本机=${hostCount}；容器=${containerCount}`, "检查同一观察能否在受控环境中重复出现。"],
    ["证据链完整性", finalReady(input) ? "通过" : "阻断", "决定结果是否可以作为结论性表述呈现。"],
  ]
  return joinBlocks([
    "下表展示研究设计与证据流。研究设计由五类证据约束构成：材料边界、代码证据、显式实验协议、本机/容器执行和证据链完整性约束；每一类约束都会收窄正文可以声称的内容。",
    markdownTable(["阶段", "观测状态", "在论文中的作用"], rows),
    "这个设计把论文结构完整性与结论可支持性分开处理。结构完整性要求研究问题、方法、实验和结论齐备；结论可支持性要求来源记录、实验结果和复现检查能够支撑这些表述。",
    "因此，研究设计不是简单的执行说明，而是正文可信度的约束机制。材料边界决定可以讨论哪些对象，代码证据决定方法描述是否有源码范围支撑，实验协议决定结果是否有对照，复现执行决定结果是否可以重复，证据链完整性约束则决定这些结果能否进入结论。任一环节缺失时，相关结论应降级为探索性观察，而不是用完整段落掩盖证据缺口。",
    "这种分层也让复核路径更直接：读者可以先查看主文中的研究问题和结果表，再沿着附录中的来源、断言和实验执行摘要回到具体文件、命令和输出摘要。对计算机类论文而言，这比单纯给出一段生成式解释更重要，因为代码路径、运行脚本、数据版本和环境差异都会影响结果能否成立。",
    "这一设计还能区分两类证据不足：一类是材料不足，例如缺少论文来源或数据许可；另一类是实验链路不足，例如没有基线、消融或隔离环境复现。前者影响背景与引用可信度，后者影响结果与贡献可信度。将两类问题分开呈现，可以避免将结构完整误认为证据充分。",
    "因此，主文中的每个强结论都应能在附录中找到对应证据，而附录中的每条证据也应能解释它为何足以支撑或限制该结论完整成立。",
  ])
}

function implementationTraceSummary(input: ComposeDraftPaperInput) {
  const artifactIds = [...new Set(input.ledger.entries.flatMap((entry) => entry.artifact_ids))]
  const sourceIds = claimSourceIds(input)
  const evidenceSources = evidenceSourceIds(input)
  const evidenceLabel = isRankingContext(input) ? "复核材料" : "结构化证据"
  if (isRankingContext(input)) {
    const rows = input.ledger.entries.slice(0, 10).map((entry) => [
      entry.section_id === "method" ? "排序方法实现" : displaySectionID(entry.section_id),
      displaySectionID(entry.section_id),
      countedSummary(entry.source_ids, sourceKindLabel, "个"),
      evidenceCountSummary(entry.artifact_ids, evidenceLabel),
    ])
    return joinBlocks([
      "本附录汇总主文所依赖的材料类型、实现位置和复核材料，便于读者定位排序接口与实验入口。",
      `本研究共有 ${evidenceSources.length} 个可核验材料来源，其中 ${sourceIds.length} 个来源直接支撑正文方法或结果表述。`,
      rows.length > 0 ? markdownTable(["条目", "对应章节", "材料类型", "复核材料"], rows) : "当前没有可列出的材料定位条目。",
      "这些材料用于定位方法实现、数据来源和实验复现路径；结果解释仍以主文结果与讨论为准。",
    ])
  }
  const claimStatusRule = isRankingContext(input)
    ? "断言状态会影响终稿表述条件：待补证据的断言不能进入终稿结论，已支持断言才允许进入结论性表述。"
    : "断言状态会影响证据链完整性判断：待补证据的断言只能出现在待修复草稿中，已支持断言才允许进入结论性表述。"
  const claimRows = input.ledger.entries.slice(0, 10).map((entry, index) => [
    `断言 ${index + 1}`,
    displaySectionID(entry.section_id),
    entry.status === "supported" ? "已支持" : "待补证据",
    countedSummary(entry.source_ids, sourceKindLabel, "个"),
    evidenceCountSummary(entry.artifact_ids, evidenceLabel),
  ])
  return joinBlocks([
    "证据追踪表汇总来源、断言和复核记录，用于说明正文结论如何连接到材料、实验协议和运行结果。",
    `本研究共有 ${input.ledger.entries.length} 条断言、${evidenceSources.length} 个可核验材料来源（其中 ${sourceIds.length} 个直接绑定断言）和 ${artifactIds.length} 个证据记录。${claimStatusRule}`,
    claimRows.length > 0
      ? markdownTable(["断言", "章节", "状态", "来源类型", "证据概况"], claimRows)
      : "当前没有断言行。",
    "读者如果需要复核某个结果，可以从正文断言跳到附录证据清单，再定位到代码分析、实验执行和复核记录。",
  ])
}

function registeredCommandsSummary(input: ComposeDraftPaperInput) {
  const protocolRows =
    input.experiment_protocol?.entries.map((entry) => [
      displayExperimentRole(entry.role),
      contextualExperimentLabel(input, entry.protocol_id, entry.role === "container_reproduction" ? undefined : entry.role),
      commandText(entry.command),
      displayMetricName(entry.expected_metric),
      displayProtocolSource(input.experiment_protocol?.discovered_from ?? "unknown"),
    ]) ?? []
  const planRows = input.experiment_plan
    ? [input.experiment_plan.proposed, ...input.experiment_plan.baselines, ...input.experiment_plan.ablations].map((spec) => [
        displayExperimentRole(spec.role),
        contextualExperimentLabel(input, spec.experiment_id, spec.role),
        commandText(spec.command),
        displayMetricName(spec.expected_metric),
        "实验计划",
      ])
    : []
  const rows = protocolRows.length > 0 ? protocolRows : planRows
  return joinBlocks([
    "### 复现实验入口",
    rows.length > 0
      ? markdownTable(["角色", "编号", "命令", "指标", "来源"], rows.slice(0, 12))
      : "当前没有复现实验入口；需要先声明本文方法、基线、消融与复现入口。",
    "这些入口用于说明可复核实验路径，并不等同于实验结果。结果章节仅报告已经执行并留下输出摘要的实验；未执行入口保留在协议章节或修复清单中。",
  ])
}

function hostContainerConsistencySummary(input: ComposeDraftPaperInput) {
  const runs = input.experiment_runs
  const metric = input.result_report?.primary_metric ?? input.experiment_plan?.proposed.expected_metric ?? "primary_metric"
  const metricLabel = displayMetricName(metric)
  if (!runs) {
    return "尚未登记本机/容器实验运行，因此无法比较复现一致性。当前论文只能说明协议设计，不能说明执行结果。"
  }
  const ids = [...new Set([...runs.host_runs.map((run) => run.experiment_id), ...runs.container_runs.map((run) => run.experiment_id)])]
  const comparisons = ids.map((id) => {
    const host = runs.host_runs.find((run) => run.experiment_id === id)
    const container = runs.container_runs.find((run) => run.experiment_id === id)
    const hostValue = host ? metricLookup(host, metric) : undefined
    const containerValue = container ? metricLookup(container, metric) : undefined
    const delta = typeof hostValue === "number" && typeof containerValue === "number" ? containerValue - hostValue : undefined
    const mismatch =
      host?.status !== container?.status ||
      typeof hostValue !== "number" ||
      typeof containerValue !== "number" ||
      Math.abs(delta ?? Number.POSITIVE_INFINITY) > 1e-9
    return {
      mismatch,
      row: [
        contextualExperimentLabel(input, id, host?.role ?? container?.role),
        displayRunStatus(host?.status ?? "missing"),
        typeof hostValue === "number" ? displayMetricValue(metric, hostValue) : "无",
        displayRunStatus(container?.status ?? "missing"),
        typeof containerValue === "number" ? displayMetricValue(metric, containerValue) : "无",
        typeof delta === "number" ? formatMetricValue(delta) : "无",
      ],
    }
  })
  const rows = comparisons.map((item) => item.row)
  const mismatches = comparisons.filter((item) => item.mismatch)
  return joinBlocks([
    isRankingContext(input)
      ? `可复现性分析比较本机与容器结果，${primaryMetricPhrase(metricLabel)}。该比较用于检查同一协议在两个环境中的稳定性。`
      : `可复现性分析比较本机与容器结果，${primaryMetricPhrase(metricLabel)}。只有当本文方法、基线和消融在可复现环境中有一致记录时，相关结果才有资格进入结论性表述。`,
    "表 2 汇总本机与容器主指标差异，用于检查复现一致性。",
    markdownTable(["实验", "本机状态", `本机 ${metricLabel}`, "容器状态", `容器 ${metricLabel}`, "差值"], rows),
    mismatches.length === 0
      ? isRankingContext(input)
        ? "本机与容器比较没有发现状态或主指标差异，说明当前排序协议在两个环境中保持一致。"
        : "本机与容器比较没有发现状态或主指标差异，复现检查可以把这些实验作为结论性表述的支撑证据。"
      : `本机与容器比较发现 ${mismatches.length} 个状态或主指标差异，相关断言应降级为探索性观察，直到复现脚本或环境被修复。`,
    "该检查不等价于证明方法泛化有效；它只证明当前工作区、当前协议和当前环境声明可以复现同一组观测结果。泛化结论仍需要更多数据集、更多随机种子和领域基线。",
  ])
}

function reproducibilityChecklistSummary(input: ComposeDraftPaperInput) {
  if (isRankingContext(input)) return rankingReproducibilityAppendixSummary(input)
  const hasPlan = Boolean(input.experiment_plan)
  const hasProtocol = Boolean(input.experiment_protocol && input.experiment_protocol.entries.length > 0)
  const hasHostRuns = Boolean(input.experiment_runs?.host_runs.length)
  const hasContainerRuns = Boolean(input.experiment_runs?.container_runs.length)
  const hasResultReport = Boolean(input.result_report)
  const hasDataBoundary = Boolean(input.data_plan)
  const finalGateLabel = isRankingContext(input) ? "结论表述条件" : "证据链完整性"
  const rows = [
    ["研究简报", displayReady(true), "主题、语言、目标模板和预算已明确。"],
    ["数据/代码边界", displayReady(hasDataBoundary), hasDataBoundary ? "已生成数据计划或代码材料边界。" : "需要补充数据许可、访问和代码材料范围。"],
    ["实验计划", displayReady(hasPlan), hasPlan ? "指标、基线、消融和资源预算已登记。" : "缺少评价目标和对照设计。"],
    ["实验入口", displayReady(hasProtocol), hasProtocol ? "已登记可执行入口。" : "缺少本文方法、基线、消融和复现入口。"],
    ["本机执行", displayReady(hasHostRuns), hasHostRuns ? "已记录本机输出、退出码、耗时和指标。" : "需要真实执行本机实验。"],
    ["容器复现", displayReady(hasContainerRuns), hasContainerRuns ? "已记录容器复现结果。" : "需要容器或等价隔离环境复现。"],
    ["结果报告", displayReady(hasResultReport), hasResultReport ? "已生成主指标比较、阻断项和建议。" : "需要生成结果报告。"],
    [finalGateLabel, displayReady(finalReady(input)), finalReady(input) ? "允许结论性表述。" : "保持阻断或待修复草稿。"],
  ]
  return joinBlocks([
    "复现清单汇总结论性表述所需的最小证据条件。每一项都来自复核记录，而不是人工勾选。",
    markdownTable(["项目", "就绪", "证据"], rows),
    registeredCommandsSummary(input),
    "当清单中任一关键项为“否”时，相关结论应降级为探索性观察，并在正文或附录中说明缺失的证据类型。这样可以避免把完整段落误读为完整研究。",
  ])
}

function rankingReproducibilityAppendixSummary(input: ComposeDraftPaperInput) {
  const planRows = input.experiment_plan
    ? [input.experiment_plan.proposed, ...input.experiment_plan.baselines, ...input.experiment_plan.ablations].map((spec) => [
        displayExperimentRole(spec.role),
        contextualExperimentLabel(input, spec.experiment_id, spec.role),
        commandText(spec.command),
        displayMetricName(spec.expected_metric),
      ])
    : []
  const protocolRows =
    input.experiment_protocol?.entries.map((entry) => [
      displayExperimentRole(entry.role),
      contextualExperimentLabel(input, entry.protocol_id, entry.role === "container_reproduction" ? undefined : entry.role),
      commandText(entry.command),
      displayMetricName(entry.expected_metric),
    ]) ?? []
  const rows = protocolRows.length > 0 ? protocolRows : planRows
  return joinBlocks([
    "本附录列出复现实验入口，便于读者复核本文方法、词项匹配基线、无证据覆盖消融和容器复现。结果数值以结果章节和可复现性章节为准。",
    rows.length > 0 ? markdownTable(["角色", "实验", "命令", "指标"], rows.slice(0, 12)) : "当前没有可列出的复现实验入口。",
    "这些入口用于复现评价协议，不替代主文中的结果解释；若入口、环境或指标发生变化，应重新生成结果表和效度分析。",
  ])
}

function threatsToValiditySummary(input: ComposeDraftPaperInput) {
  const report = input.result_report
  const metricId = report?.primary_metric ?? "primary_metric"
  const metric = displayMetricName(metricId)
  if (isRankingContext(input)) return rankingThreatsToValiditySummary(input, metric)
  return joinBlocks([
    `构念效度：主指标来自实验协议和运行结果，能够评价当前任务的执行质量，但不能覆盖方法价值的全部维度。${constructValidityExample(metricId, metric)}`,
    report?.best_baseline && report.proposed
      ? `内部效度：本文方法与最佳基线${primaryMetricLocus(metric)}的差异为 ${formatMetricValue(report.proposed.value - report.best_baseline.value)}。如果差异很小，正文不能把流程完整性写成性能优势；如果差异很大，也需要检查随机种子、数据划分和脚本等价性。`
      : "内部效度：缺少本文方法与基线的可比较结果时，正文不能声称方法优于对照。",
    "外部效度：结论范围限于本研究的工作区、数据/代码材料和实验环境。要扩展到更一般的计算机类论文场景，还需要更多任务、更多仓库、更多基线和更严格的复核协议。",
    "复现效度：容器复现能降低环境差异，但不能证明依赖来源永久可用。复核材料需要保存命令、镜像、摘要、输出摘要和证据清单，必要时还需要锁定数据版本。",
    "解释效度：代码证据、显式对照和容器复现提高了结论的可复核性，但不能单独证明研究问题已经覆盖所有应用场景。正文解释应把性能差异、证据范围和任务规模同时呈现。",
  ])
}

function rankingCandidateCount(input: ComposeDraftPaperInput) {
  for (const dataset of input.data_plan?.datasets ?? []) {
    const diagnostic = dataset.verification.diagnostics?.find((item) => /^candidate_count:\d+$/i.test(item.trim()))
    const value = diagnostic?.split(":").at(1)?.trim()
    if (value) return value
  }
  return undefined
}

function rankingDatasetScopeSummary(input: ComposeDraftPaperInput) {
  const candidateCount = rankingCandidateCount(input)
  const diagnostics = input.data_plan?.datasets.flatMap((dataset) => dataset.verification.diagnostics ?? []) ?? []
  const hasLiveArxivLabelPolicy = diagnostics.some((diagnostic) =>
    /^label_policy:Deterministic validation labels derived from live arXiv search rank/i.test(diagnostic.trim()),
  )
  if (!candidateCount && !hasLiveArxivLabelPolicy) return undefined
  const countText = candidateCount ? `候选数 ${candidateCount}` : "候选集规模有限"
  const labelText = hasLiveArxivLabelPolicy
    ? "标签由实时 arXiv 检索排序、主题匹配、元数据完整度和发表时间派生，不是人工相关性标注"
    : "标签策略限定了结果解释范围"
  return `评测集${countText}，${labelText}。`
}

function rankingNoCoverageAblationValue(input: ComposeDraftPaperInput, metric: string) {
  const runs = input.experiment_runs
  if (!runs) return undefined
  const run = runs.host_runs.find((item) => {
    const label = `${item.experiment_id} ${contextualExperimentLabel(input, item.experiment_id, item.role)}`.toLowerCase()
    return item.role === "ablation" && /(no[-_\s]?coverage|coverage|无证据覆盖)/.test(label)
  })
  return run ? metricLookup(run, metric) : undefined
}

function rankingThreatsToValiditySummary(input: ComposeDraftPaperInput, metric: string) {
  const candidateCount = rankingCandidateCount(input)
  const candidateText = candidateCount ? `候选数 ${candidateCount}` : "候选集规模有限"
  return joinBlocks([
    `标注效度：当前评测集${candidateText}，标签由实时 arXiv 检索排序、主题匹配、元数据完整度和发表时间确定，不是人工相关性标注。因此结果更适合解释自动筛选协议，而不能直接等同于专家相关性判断。`,
    `指标效度：${metric} 只评价前三位排序质量，能够反映综述准备时最先阅读候选的排序效果，但不能覆盖长列表排序、多主题覆盖或引用多样性。`,
    "基线效度：词项匹配基线偏弱，主要检验查询词重合能否解释排序收益；后续需要加入 BM25、向量检索、学习排序或人工标注基线，才能判断该评分函数相对强检索系统的价值。",
    "消融效度：无证据覆盖消融隔离了 claim_coverage 的影响，但 relevance、claim_coverage 和 recency 之间可能存在相关性；更细粒度的特征消融和随机种子重复能够提高解释稳定性。",
    "外部效度：当前结论限于候选论文排序任务和当前主题。要推广到更广泛的文献推荐或研究助手场景，需要更多主题、更多候选规模和人工相关性标注。容器复现说明运行环境一致，但不替代跨数据集验证。",
  ])
}

function experimentResultTable(input: ComposeDraftPaperInput) {
  const runs = input.experiment_runs
  const report = input.result_report
  if (!runs || !report) return undefined
  const metric = report.primary_metric
  const rows = runs.host_runs
    .filter((run) => run.metrics.some((item) => item.name === metric))
    .map((run) => {
      const value = run.metrics.find((item) => item.name === metric)?.value
      const reproduced = runs.container_runs.some((item) => item.experiment_id === run.experiment_id && item.status === "succeeded")
      return [
        contextualExperimentLabel(input, run.experiment_id, run.role),
        displayExperimentRole(run.role),
        typeof value === "number" ? displayMetricValue(metric, value) : "无",
        displayRunStatus(run.status),
        reproduced ? "是" : "否",
      ]
    })
  if (rows.length === 0) return undefined
  return markdownTable(["实验", "角色", displayMetricName(metric), "本机状态", "容器复现"], rows)
}

function rankingAblationInterpretation(input: ComposeDraftPaperInput) {
  const runs = input.experiment_runs
  const report = input.result_report
  if (!runs || !report?.proposed || !isRankingContext(input)) return undefined
  const noCoverage = runs.host_runs.find((run) => {
    const label = `${run.experiment_id} ${contextualExperimentLabel(input, run.experiment_id, run.role)}`.toLowerCase()
    return run.role === "ablation" && /(no[-_\s]?coverage|coverage|无证据覆盖)/.test(label)
  })
  const ablationValue = noCoverage ? metricLookup(noCoverage, report.primary_metric) : undefined
  if (typeof ablationValue !== "number") return undefined
  const delta = report.proposed.value - ablationValue
  if (delta <= 0) return "消融分析显示，无证据覆盖消融没有低于本文方法，claim_coverage 特征在当前候选集上的贡献仍需进一步验证。"
  return `消融分析显示，无证据覆盖消融低于本文方法 ${formatMetricValue(delta)}，claim_coverage 特征在当前候选集上提供了可观测贡献。`
}

function resultStatisticalScopeSummary(input: ComposeDraftPaperInput) {
  const runs = input.experiment_runs
  if (!runs) return undefined
  const orderedRoles: Array<ExperimentRun["role"]> = ["proposed", "baseline", "ablation"]
  const roles = orderedRoles.filter((role) => runs.host_runs.some((run) => run.role === role) || runs.container_runs.some((run) => run.role === role))
  if (roles.length === 0) return undefined
  const roleText = chineseList(roles.map(displayExperimentRole))
  const hasHost = runs.host_runs.length > 0
  const hasContainer = runs.container_runs.length > 0
  const environmentText =
    hasHost && hasContainer
      ? "本机与容器环境"
      : hasHost
      ? "本机环境"
      : hasContainer
      ? "容器环境"
      : "当前环境"
  const frequencyText = roles.length > 1 ? `${roleText}各在${environmentText}执行一次` : `${roleText}在${environmentText}执行一次`
  return `统计解释：${frequencyText}；当前数值是确定性协议观测，不计算置信区间或显著性检验。若后续引入随机采样、模型生成或更大候选集，应报告重复次数、方差和置信区间。`
}

function recommendationLabel(value: ResultReport["recommendation"]) {
  if (value === "accept") return "接受"
  if (value === "revise") return "需要修订"
  return "阻断"
}

function experimentSummary(input: ComposeDraftPaperInput) {
  const report = input.result_report
  if (!report) {
    return "实验章节必须包含基线、消融、主指标、运行环境和复现结果。若复现检查未通过，相关结果只能标为探索性观察。"
  }
  let metrics = "实验尚未记录可比较主指标。"
  if (report.proposed && report.best_baseline) {
    const metric = displayMetricName(report.primary_metric)
    const proposed = displayMetricValue(report.primary_metric, report.proposed.value)
    const baseline = displayMetricValue(report.primary_metric, report.best_baseline.value)
    const delta = report.proposed.value - report.best_baseline.value
    if (Math.abs(delta) < 1e-9) {
      metrics = `${primaryMetricLocus(metric)}，本文方法与最佳基线（${displayExperimentLabel(report.best_baseline.experiment_id)}）均为 ${proposed}，说明当前协议下没有观察到性能差异。`
    } else {
      const direction = delta > 0 ? "高于" : "低于"
      metrics = `${primaryMetricLocus(metric)}，本文方法为 ${proposed}，最佳基线（${displayExperimentLabel(report.best_baseline.experiment_id)}）为 ${baseline}，本文方法${direction}基线 ${formatMetricValue(Math.abs(delta))}。`
    }
  } else if (report.proposed) {
    metrics = `${primaryMetricLocus(displayMetricName(report.primary_metric))}，本文方法为 ${displayMetricValue(report.primary_metric, report.proposed.value)}；由于缺少基线，对比性结论仍需保守。`
  }
  if (report.reproduction.status === "passed" && report.final_claims_allowed) {
    if (isRankingContext(input)) return `${metrics}\n\n容器复现已通过，本机与容器结果一致。`
    return `${metrics}\n\n容器复现已通过，本机与容器结果可以支撑当前结论性表述。`
  }
  const blockers = report.blockers.length > 0 ? report.blockers.map(paperProseText).join("、") : "复现检查"
  if (isRankingContext(input)) return `${metrics}\n\n复现检查未通过，阻断项：${blockers}。相关结果应标为探索性观察。`
  return `${metrics}\n\n复现检查未通过，阻断项：${blockers}。相关结果只能标为探索性证据，不能进入结论性表述。`
}

function discussionSummary(input: ComposeDraftPaperInput) {
  const report = input.result_report
  if (!report) {
    return "讨论部分需要以主指标、基线、消融和复现环境为依据；缺少这些记录时，结论范围应限于研究设计。"
  }
  if (isRankingContext(input)) return rankingDiscussionSummary(input, report)
  const rows: string[] = []
  if (report.proposed && report.best_baseline) {
    const delta = report.proposed.value - report.best_baseline.value
    if (Math.abs(delta) < 1e-9) {
      rows.push("主指标与最佳基线持平，因此本文不能声称本文方法在性能上优于基线；较稳妥的解释是，当前方法与对照在该复现指标上表现一致，并且实验链路保留了可复核证据。")
    } else if (delta > 0) {
      if (isRankingMetric(report.primary_metric)) {
        rows.push(`在候选论文排序任务中，${displayMetricName(report.primary_metric)} 高于最佳基线 ${formatMetricValue(Math.abs(delta))}，说明本文方法在前三位排序上更接近当前证据标注；但该结论仍需要结合候选集规模、标注策略和容器复现稳定性解释，避免把单次运行写成泛化结论。`)
      } else {
        rows.push("主指标高于最佳基线，但该结论仍需要结合任务规模、数据代表性和容器复现稳定性解释，避免把单次运行写成泛化结论。")
      }
    } else {
      rows.push("主指标低于最佳基线，正文应把贡献限定为流程、可观测性或工程可靠性，而不是性能提升。")
    }
  }
  if (isRankingContext(input)) {
    rows.push("词项匹配基线和无证据覆盖消融分别约束词项匹配与证据覆盖特征，使结果解释能够区分简单词项排序、证据覆盖特征和完整排序接口的影响。")
  }
  if (report.reproduction.status === "passed") {
    rows.push("代码证据、显式对照和容器复现共同说明，当前结果不是孤立脚本输出，而是可以沿材料、命令和指标回溯的观察。")
  } else {
    rows.push("复现检查尚未通过时，所有实验结果只能作为探索性证据；正文应保留限制说明，并把缺失环节转化为可执行修复清单。")
  }
  rows.push("结果解释必须与证据边界保持一致；代码证据决定方法表述能否成立，显式对照决定性能差异能否比较，容器复现决定观察是否能在受控环境中重复出现。")
  rows.push("对于需要写代码跑实验的论文，关键不在于生成完整文本，而在于让评价指标、运行环境和结论强度保持一致。类型检查通过、单一数据集通过或单次脚本通过都不能直接解释成普遍性能优势。")
  return rows.join("\n\n")
}

function rankingDiscussionSummary(input: ComposeDraftPaperInput, report: NonNullable<ComposeDraftPaperInput["result_report"]>) {
  const metric = report.primary_metric
  const metricLabel = displayMetricName(metric)
  const candidateCount = rankingCandidateCount(input)
  const candidateText = candidateCount ? `候选数 ${candidateCount}` : "当前候选集"
  const rows: string[] = []
  if (report.proposed && report.best_baseline) {
    const baselineDelta = report.proposed.value - report.best_baseline.value
    const ablationValue = rankingNoCoverageAblationValue(input, metric)
    const ablationDelta = typeof ablationValue === "number" ? report.proposed.value - ablationValue : undefined
    if (typeof ablationDelta === "number") {
      rows.push(`在候选论文排序任务中，完整排序同时高于词项匹配基线和无证据覆盖消融：在${metricLabel} 上，相对词项匹配基线提升 ${formatMetricValue(baselineDelta)}，相对无证据覆盖消融提升 ${formatMetricValue(ablationDelta)}。这说明当前候选集的前三位排序不只来自查询词重合，证据覆盖特征也参与了排序差异。`)
    } else {
      rows.push(`在候选论文排序任务中，完整排序相对词项匹配基线提升 ${formatMetricValue(baselineDelta)}；该差异说明本文评分在当前候选集上优于只看查询词重合的排序。`)
    }
  }
  rows.push("词项匹配基线提供了一个低成本检索对照：如果完整排序不能超过该基线，relevance、claim_coverage 和 recency 的组合就缺少实际意义。当前结果中完整排序优于词项匹配基线，说明评分函数至少捕捉到了查询词之外的排序信号。")
  rows.push(`无证据覆盖消融去掉 claim_coverage 后排名下降，说明 claim_coverage 对前三位排序产生直接影响。这一结果与任务设定一致：候选论文不仅要与主题相关，还需要覆盖当前研究问题中的关键断言。`)
  rows.push(`结果仍需要保守解释。${candidateText}，且标签不是人工相关性标注，而是由实时 arXiv 检索排序、主题匹配、元数据完整度和发表时间派生；因此当前结论更适合作为自动筛选协议的证据，而不是人工文献综述质量的最终证明。`)
  if (report.reproduction.status === "passed") {
    rows.push("本机和容器结果一致，说明上述比较不是由当前宿主环境偶然触发；但复现一致性只验证同一协议可重复，不证明该评分函数已覆盖更多主题、更多候选规模或人工标注场景。")
  } else {
    rows.push("容器复现尚未通过时，排序差异只能作为探索性观察；需要先修复复现环境，再讨论性能差异。")
  }
  return rows.join("\n\n")
}

function abstractSummary(input: ComposeDraftPaperInput) {
  if (isRankingContext(input)) return rankingAbstractSummary(input)
  const ready = finalReady(input)
  const status = ready ? "在当前证据边界内，证据链已满足本文的结果表述条件。" : "在当前证据边界内，证据链尚未满足结果表述条件。"
  const metric = resultMetricSummary(input)
  const methodClaim = firstClaimText(input, "method")
  const resultClaim = firstClaimText(input, "results")
  return [
    "计算机类论文若缺少可追踪代码证据、显式对照和隔离复现，容易把缺少依据的过程记录误写成研究结论。",
    `本文以“${input.title}”为对象，检验材料、实验协议和结果断言能否形成同一条可复核证据链。`,
    methodClaim ? `方法证据显示：${methodFocusSummary(input, methodClaim, "abstract")}` : undefined,
    resultClaim ? `结果证据显示：${resultClaim}` : undefined,
    metric,
    status,
    ready
      ? "结果表明，当来源、实验协议和复现记录均具备时，正文可以只保留被证据支持的结果和限制。"
      : "当基线、消融或容器复现缺失时，结果只能作为探索性观察，并把缺口转化为可执行修复步骤。",
  ]
    .filter(Boolean)
    .join("")
}

function keywordsSummary(input: ComposeDraftPaperInput) {
  if (isRankingContext(input)) {
    return "候选论文排序；证据覆盖；排序 nDCG@3；词项匹配基线；容器复现"
  }
  const metric = input.result_report?.primary_metric ?? input.experiment_plan?.proposed.expected_metric
  const keywords = [
    "可复现研究",
    "代码实验",
    metric ? displayMetricName(metric) : undefined,
    input.experiment_plan?.baselines.length ? "基线对照" : undefined,
    input.experiment_plan?.ablations.length ? "消融实验" : undefined,
    input.experiment_runs?.container_runs.length ? "容器复现" : undefined,
  ].filter((item): item is string => Boolean(item))
  return [...new Set(keywords)].slice(0, 6).join("；")
}

function rankingAbstractSummary(input: ComposeDraftPaperInput) {
  const metric = displayMetricName(input.result_report?.primary_metric ?? input.experiment_plan?.proposed.expected_metric ?? "ranking_ndcg_at_3")
  const result = input.result_report
  const proposed = result?.proposed ? displayMetricValue(result.primary_metric, result.proposed.value) : undefined
  const baseline = result?.best_baseline ? displayMetricValue(result.primary_metric, result.best_baseline.value) : undefined
  const delta =
    result?.proposed && result.best_baseline
      ? `，较词项匹配基线提升 ${formatMetricValue(result.proposed.value - result.best_baseline.value)}`
      : ""
  const ablation = rankingAblationInterpretation(input)
  return [
    "本文研究候选论文排序任务，目标是在给定研究主题下对候选论文进行可复核排序。",
    "候选论文排序接口由 rankAgentTeamPapers 和 scorePaper 组成：rankAgentTeamPapers 对候选集合排序，scorePaper 将 relevance、claim_coverage 和 recency 合成为统一评分。",
    `实验以${metric} 为主指标，并设置排名测试、词项匹配基线、无证据覆盖消融和容器复现。`,
    proposed && baseline
      ? `结果显示，本文方法达到 ${proposed}，词项匹配基线为 ${baseline}${delta}。`
      : resultMetricSummary(input),
    ablation ? ablation.replace(/消融分析显示，/, "") : undefined,
    rankingDatasetScopeSummary(input),
    input.result_report?.reproduction.status === "passed"
      ? "容器复现通过，说明当前实验协议在受控环境中可以重复。"
      : "容器复现尚未通过，因此相关结果应保持为探索性观察。",
  ]
    .filter(Boolean)
    .join("")
}

function introductionSummary(input: ComposeDraftPaperInput) {
  if (isRankingContext(input)) return rankingIntroductionSummary(input)
  const methodClaim = firstClaimText(input, "method")
  const resultEvidence = resultEvidenceText(input)
  const methodFocus = methodFocusSummary(input, methodClaim, "introduction")
  return [
    `面向计算机类论文，正文完整性必须与代码依据、实验协议、运行结果和复现边界同时成立。${sourceSummary(input)}`,
    methodFocus
      ? methodFocus
      : "本文首先整理来源和可验证断言，再根据实验计划执行或校验结果，最后用证据链完整性约束结论强度。",
    resultEvidence
      ? `结果部分需要解释的是：${resultEvidence}因此，本文需要同时呈现基线、消融、主指标和复现一致性，避免把缺少对照的观察写成贡献。`
      : undefined,
    finalReady(input)
      ? "本文据此将讨论范围限定在已有来源、实验与复现记录能够支撑的结论上。"
      : "本文据此把未被来源、实验或复现记录支撑的表述标为探索性观察。",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function rankingIntroductionSummary(input: ComposeDraftPaperInput) {
  const metric = displayMetricName(input.result_report?.primary_metric ?? input.experiment_plan?.proposed.expected_metric ?? "ranking_ndcg_at_3")
  const result = input.result_report
  const resultEvidence =
    result?.proposed && result.best_baseline
      ? `当前结果显示，本文方法为 ${displayMetricValue(result.primary_metric, result.proposed.value)}，词项匹配基线为 ${displayMetricValue(result.primary_metric, result.best_baseline.value)}，差值 ${formatMetricValue(result.proposed.value - result.best_baseline.value)}。`
      : resultEvidenceText(input)
  return [
    "候选论文排序常用于文献检索、综述准备和研究选题：系统需要在有限候选集内判断哪些论文最能支持当前研究问题。仅依赖词项匹配的排序容易忽略候选论文是否覆盖关键断言，单独报告排序结果又难以解释差异来自何处。",
    "本文研究由 rankAgentTeamPapers 和 scorePaper 构成的候选论文排序接口。scorePaper 将 relevance、claim_coverage 和 recency 合成为排序分数，rankAgentTeamPapers 根据该分数生成候选顺序。",
    `为检验证据覆盖特征是否带来排序收益，本文设置排名测试、词项匹配基线和无证据覆盖消融，并以${metric} 作为主指标。${resultEvidence ?? ""}`,
    input.result_report?.reproduction.status === "passed"
      ? "容器复现用于确认同一协议在受控环境中能重复得到相同观察；因此本文只讨论当前候选集、标注策略和复现条件能够支持的结论。"
      : "容器复现尚未通过时，本文只把排序结果作为探索性观察，并把缺失环节转化为后续实验任务。",
  ].join("\n\n")
}

function relatedWorkSummary(input: ComposeDraftPaperInput) {
  if (isRankingContext(input)) return rankingRelatedWorkSummary(input)
  const methodClaim = firstClaimText(input, "method")
  const resultEvidence = resultEvidenceText(input)
  const methodFocus = methodFocusSummary(input, methodClaim, "related")
  return joinBlocks([
    literatureEvidenceSummary(input),
    methodFocus
      ? methodFocus
      : "相关工作通常强调检索、规划或长文生成；本文关注的是代码证据、实验日志和复现环境如何共同约束论文正文。",
    resultEvidence
      ? `与只报告单次运行结果的研究相比，本文把结果断言限定在显式对照内：${resultEvidence}`
      : "如果没有基线、消融和复现记录，相关结论只能保留为探索性观察。",
    "本文采用的约束是：结果表述必须限制在已登记来源、断言和证据记录范围内；没有通过复现检查时，相关结论应保持为探索性观察。",
    sourceSummary(input),
  ])
}

function methodSummary(input: ComposeDraftPaperInput, claimSections: DraftSection[]) {
  const methodClaims = claimSections.find((section) => section.section_id === "method")?.markdown
  const rankingNarrative = rankingMethodNarrative(input)
  const rankingFigure = rankingMethodFigureSummary(input)
  return [
    rankingNarrative ??
      "本文的方法由三部分组成：材料边界定义、代码证据抽取和可复现实验约束。材料边界先限定可讨论对象，代码分析再绑定接口、源码范围和实验入口，最后用基线、消融和容器复现约束结果表述。",
    rankingFigure,
    rankingNarrative
      ? methodEvidenceNote(input)
      : methodClaims
      ? `代码理解阶段抽取的方法接口、源码范围和可运行入口如下：\n\n${methodClaims}`
      : "当前运行没有生成可展开的方法断言；这通常意味着输入材料不足或证据台账仍需补充。",
    artifactSummary(input),
  ].join("\n\n")
}

function evidenceModelSummary(input: ComposeDraftPaperInput) {
  const sourceIds = claimSourceIds(input)
  const evidenceSources = evidenceSourceIds(input)
  const artifactIds = [...new Set(input.ledger.entries.flatMap((entry) => entry.artifact_ids))]
  const supported = input.ledger.entries.filter((entry) => entry.status === "supported").length
  const unsupported = input.ledger.unsupported_claim_ids.length
  return joinBlocks([
    "本文采用证据链约束实验结论。证据链由材料来源、可审查断言和复核记录组成，分别对应论文材料、代码文件、数据集、实验日志以及与这些材料相连的结论表述。",
    `本研究登记 ${evidenceSources.length} 个可核验材料来源、${input.ledger.entries.length} 条断言和 ${artifactIds.length} 个复核记录；其中 ${sourceIds.length} 个来源直接绑定断言，${supported} 条断言已有证据支持，${unsupported} 条断言仍缺证据。`,
    "只有同时具备源码范围、实验结果和复现记录的结论，才被写入结果章节中的结论性表述；缺少任一环节时，相关表述只能作为限制或后续工作保留。",
    "这种证据链让读者能够从正文中的方法或结果句子追溯到材料、实验命令、指标和复核记录，从而形成可追踪性。它也为后续复核提供定位入口：读者可以先读主文，再进入附录检查完整证据索引。",
    "因此，正文中的每个实验结论都应回答两个问题：它来自哪里，以及是否在受控环境中重复出现。没有答案的结论必须降级为探索性观察。",
    "这一约束是后续扩展真实数据集、领域基线、随机种子和更复杂实验资源时不可省略的基本条件，也是结论可追踪性的基础。",
    "在计算机类论文场景中，这种约束尤其重要，因为代码实现、运行脚本、依赖版本和执行环境的细小差异都可能改变实验结论。",
    "因此，本文区分文本完整性与结论可支持性：前者关注论文结构，后者要求来源、实验命令、运行结果和复现状态同时可追踪。只有后者成立时，结果才可以写成结论性表述；否则正文必须保留限制说明，并把缺口转化为后续实验任务。",
  ])
}

function reproducibilitySummary(input: ComposeDraftPaperInput) {
  return joinBlocks([
    experimentEnvironmentDeclaration(input),
    hostContainerConsistencySummary(input),
    "### 实验执行摘要",
    experimentRunSummary(input),
    experimentResourceBoundarySummary(input),
  ])
}

function resultSummary(input: ComposeDraftPaperInput, claimSections: DraftSection[]) {
  const table = experimentResultTable(input)
  const ablation = rankingAblationInterpretation(input)
  const statisticalScope = resultStatisticalScopeSummary(input)
  const resultClaim = claimSections.find((section) => section.section_id === "results")?.markdown
  return [
    resultClaim ? `${resultClaim}\n\n` : "",
    experimentSummary(input),
    table ? `\n\n表 1 汇总本文方法、基线和消融在主指标、运行状态和容器复现上的结果。\n\n${table}` : "",
    ablation ? `\n\n${ablation}` : "",
    statisticalScope ? `\n\n${statisticalScope}` : "",
  ]
    .filter(Boolean)
    .join("")
}

function evidenceSummary(entry: ClaimLedgerEntry) {
  const status = entry.status === "supported" ? "已支持" : "待补证据"
  return [
    compactClaimText(entry.text, 120),
    status,
    displayClaimAction(entry.required_action),
    countedSummary(entry.source_ids, sourceKindLabel, "个"),
    evidenceCountSummary(entry.artifact_ids),
  ]
}

function conclusionSummary(input: ComposeDraftPaperInput, ready: boolean) {
  if (isRankingContext(input)) {
    const metric = displayMetricName(input.result_report?.primary_metric ?? input.experiment_plan?.proposed.expected_metric ?? "ranking_ndcg_at_3")
    const result = input.result_report
    const comparison =
      result?.proposed && result.best_baseline
        ? `在${metric} 上，本文方法达到 ${displayMetricValue(result.primary_metric, result.proposed.value)}，较词项匹配基线高 ${formatMetricValue(result.proposed.value - result.best_baseline.value)}。`
        : `${primaryMetricPhrase(metric)}的比较结果仍需补齐。`
    return [
      "本文围绕 rankAgentTeamPapers 和 scorePaper 构建了候选论文排序方法，并用词项匹配基线、无证据覆盖消融和容器复现约束实验结论。",
      comparison,
      ready
        ? "当前结果说明，证据覆盖特征能够改善当前候选集上的前三位排序；后续扩展需要更多主题、人工相关性标注和跨数据集重复实验。"
        : "当前结果仍不足以支撑结论性表述；后续需要补齐来源、对照或复现记录。",
    ].join("")
  }
  return ready
    ? "本文表明，将材料来源、代码证据、显式对照和容器复现纳入同一证据链，可以降低计算机类论文中结果断言与实验依据脱节的风险。在现有任务范围内，本文方法的结论由来源、实验协议和复现记录共同支撑；进一步扩展仍需要更多数据集、更多领域基线和更长周期的重复实验。"
    : "本文仍处于证据不足状态；只有当来源、断言、引用、许可和复现检查形成闭环后，相关结论才应从探索性观察提升为结论性表述。"
}

function limitationsSectionTitle(input: ComposeDraftPaperInput) {
  return isRankingContext(input) ? "限制" : "限制与待修复项"
}

function appendixEvidenceTraceTitle(input: ComposeDraftPaperInput) {
  return isRankingContext(input) ? "附录 A：材料与实现定位" : "附录 A：证据追踪"
}

function appendixReproducibilityTitle(input: ComposeDraftPaperInput) {
  return isRankingContext(input) ? "附录 B：复现实验入口" : "附录 B：复现清单"
}

function limitationsSummary(input: ComposeDraftPaperInput, unsupported: string[], ready: boolean) {
  if (isRankingContext(input)) {
    const candidateCount = rankingCandidateCount(input)
    const candidateText = candidateCount ? `候选数 ${candidateCount}` : "候选集规模有限"
    if (unsupported.length > 0) {
      return [
        `当前排序实验仍受${candidateText}、非人工相关性标注和待补证据限制。以下断言修复前，相关结果只能作为探索性观察：`,
        "",
        ...unsupported.map((claimId) => `- ${claimId}: 补充证据、降低表述强度，或从终稿断言中移除。`),
      ].join("\n")
    }
    return joinBlocks([
      `当前实验的主要限制来自评测集规模和标注方式：${candidateText}，标签由实时 arXiv 检索排序、主题匹配、元数据完整度和发表时间派生，不是人工相关性标注。`,
      "词项匹配基线偏弱，只能说明完整排序优于简单查询词重合；后续需要加入 BM25、向量检索、学习排序和人工标注基线。",
      "当前结论仍限于单一主题和当前候选集合。要把结果扩展到通用文献推荐或研究助手场景，需要跨主题验证、更大候选池、人工相关性标注和更多随机种子重复。",
    ])
  }
  return unsupported.length > 0
    ? [
        "以下阻断项限制了结论强度；修复前，相关表述应保留为待验证观察：",
        "",
        ...unsupported.map((claimId) => `- ${claimId}: 补充证据、降低表述强度，或从终稿断言中移除。`),
      ].join("\n")
    : ready
      ? "在当前证据边界内，引用、许可、代码证据和复现检查未发现阻断项；结论仍限于现有材料、数据集、协议和运行环境。"
      : "在当前证据边界内，断言虽未出现直接冲突，但引用、许可、代码证据或复现检查仍需补齐。"
}

function scaffoldSections(input: ComposeDraftPaperInput, claimSections: DraftSection[]): DraftSection[] {
  const artifactIds = [...new Set(input.ledger.entries.flatMap((entry) => entry.artifact_ids))]
  const unsupported = input.ledger.unsupported_claim_ids
  const ready = finalReady(input)
  const includeInternalAuditAppendices = !isRankingContext(input)
  const ranking = isRankingContext(input)
  return [
    buildPlainSection("author_information", "作者信息", authorInformationSummary()),
    buildPlainSection("abstract", "摘要", abstractSummary(input)),
    buildPlainSection("keywords", "关键词", keywordsSummary(input)),
    buildPlainSection("introduction", "引言", introductionSummary(input)),
    buildPlainSection("research_questions", "研究问题", researchQuestionsSummary(input)),
    buildPlainSection("contributions", "主要贡献", contributionsSummary(input)),
    buildPlainSection("related_work", "相关工作", relatedWorkSummary(input)),
    ...(ranking ? [] : [buildPlainSection("study_design", "研究设计与证据流", studyDesignSummary(input))]),
    buildPlainSection("method", "方法", methodSummary(input, claimSections)),
    ...(ranking ? [] : [buildPlainSection("evidence_traceability", "证据与可追踪性", evidenceModelSummary(input))]),
    ...claimSections.filter((section) => section.section_id !== "method" && section.section_id !== "results"),
    buildPlainSection("data_availability", "数据与代码可用性", dataAvailabilitySummary(input)),
    buildPlainSection("experimental_setup", "实验设置", experimentProtocolSummary(input)),
    buildPlainSection("results", "结果", resultSummary(input, claimSections)),
    buildPlainSection("reproducibility", "可复现性", reproducibilitySummary(input)),
    buildPlainSection("discussion", "讨论", discussionSummary(input)),
    buildPlainSection("threats_to_validity", "效度威胁", threatsToValiditySummary(input)),
    buildPlainSection(
      "limitations",
      limitationsSectionTitle(input),
      limitationsSummary(input, unsupported, ready),
    ),
    buildPlainSection(
      "conclusion",
      "结论",
      conclusionSummary(input, ready),
    ),
    buildPlainSection("declarations", "声明", declarationsSummary()),
    buildPlainSection("references", "参考文献", referencesSummary(input)),
    buildPlainSection("appendix_evidence_trace", appendixEvidenceTraceTitle(input), implementationTraceSummary(input)),
    buildPlainSection(
      "appendix_operational_reproducibility_checklist",
      appendixReproducibilityTitle(input),
      reproducibilityChecklistSummary(input),
    ),
    ...(experimentGuidanceSummary(input)
      ? [buildPlainSection("appendix_experiment_protocol_guidance", "附录 C：实验协议修复清单", experimentGuidanceSummary(input)!)]
      : []),
    ...(experimentStarterPackSummary(input)
      ? [buildPlainSection("appendix_experiment_protocol_starter_pack", "附录 D：实验启动包", experimentStarterPackSummary(input)!)]
      : []),
    ...(includeInternalAuditAppendices
      ? [
          buildPlainSection(
            "appendix_claim_ledger",
            "附录 E：断言证据表",
            input.ledger.entries.length > 0
              ? markdownTable(["断言摘要", "状态", "处理", "来源类型", "证据概况"], input.ledger.entries.map(evidenceSummary))
              : "无 claim ledger 条目。请先补充可验证 claim。",
          ),
          buildPlainSection(
            "appendix_artifacts",
            "附录 F：证据记录索引",
            artifactIds.length > 0
              ? [
                  `证据记录索引用于定位复核材料。本研究共有 ${artifactIds.length} 条复核记录；为保持正文可读，详细路径、哈希和渲染状态不在正文展开。`,
                  "复核时建议先核对三类记录：代码分析是否覆盖论文声称的方法入口，实验执行是否包含本文方法、基线、消融和复现记录，证据清单是否能连接正文结论与来源材料。若这些记录缺失，正文中的相应结论应降级为待验证观察。",
                  "附录只保留复核所需的摘要；完整材料由结构化记录承担。",
                  "若复核发现证据数量与主文结论不一致，应优先修正实验协议或降低结论强度，而不是补写没有来源支撑的段落、表格、图片或图表内容。",
                ].join("\n\n")
              : "当前没有复核记录。",
          ),
        ]
      : []),
  ]
}

function render(title: string, sections: DraftSection[]) {
  return [`# ${title}`, ...sections.map((section) => `## ${section.title}\n\n${section.markdown}`)].join("\n\n")
}

export function composeDraftPaper(input: ComposeDraftPaperInput): DraftPaper {
  const createdAt = nowIso(input.now)
  return withSpan(
    "research.writing.compose_draft",
    {
      "paper_fucker.research.draft.title": input.title,
    },
    () => {
      const title = paperTitle(input)
      const bySection = new Map<string, ClaimLedgerEntry[]>()
      for (const entry of input.ledger.entries) {
        bySection.set(entry.section_id, [...(bySection.get(entry.section_id) ?? []), entry])
      }
      const claimSections = Array.from(bySection.entries()).map(([sectionId, entries]) => buildSection(sectionId, entries))
      const sections = scaffoldSections(input, claimSections)
      const markdown = render(title, sections)
      return {
        schema_version: "DraftPaper.v1",
        draft_id: `draft:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "paper"}`,
        title,
        created_at: createdAt,
        version: 1,
        sections,
        markdown,
        claim_ids: input.ledger.entries.map((entry) => entry.claim_id),
        applied_guidance_ids: [],
      }
    },
  )
}

export function* streamMarkdownDraft(draft: DraftPaper) {
  yield `# ${draft.title}\n\n`
  for (const section of draft.sections) yield `## ${section.title}\n\n${section.markdown}\n\n`
}

export function applyCheckpointGuidance(draft: DraftPaper, guidance: CheckpointGuidance): DraftPaper {
  const sections = draft.sections.map((section) =>
    section.section_id === guidance.target_section_id
      ? {
          ...section,
          markdown: guidance.replacement_markdown,
        }
      : section,
  )
  return {
    ...draft,
    version: draft.version + 1,
    sections,
    markdown: render(draft.title, sections),
    applied_guidance_ids: [...draft.applied_guidance_ids, guidance.guidance_id],
  }
}
