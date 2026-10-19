import type { DraftPaper } from "../writing"
import { withSpan } from "../telemetry"
import type { ManuscriptRequirements, VerificationFinding, VerificationGateInput } from "./schemas"

/**
 * The integrity checks answer "is this paper honest". These answer "is this paper submission-grade":
 * a venue's reviewers reject on missing statistics, an empty reference list, stub sections and
 * undeclared conflicts of interest long before they care about the underlying evidence.
 *
 * They only run when the caller supplies `manuscript_requirements`; a preview or an integration test
 * that only wants the integrity gate is unaffected.
 */

/** A section with fewer words than this is a heading with filler, not a section. */
const SUBSTANTIVE_WORDS = 20

// "占位" alone would match the scaffold's own sentence explaining that placeholder URLs were excluded.
const PLACEHOLDER = /\b(TODO|TBD|FIXME|XXX)\b|待补充|待完善|占位符|placeholder|lorem ipsum|\[citation needed\]|\?\?\?/i

const UNDECLARED =
  /^\s*(未声明|未提供|待定|待补|尚未(?:声明|提供)|not declared|not provided|not specified|to be (?:provided|added))/i

const STATEMENT_RULES: Record<
  string,
  | { label: string; kind: "declaration"; pattern: RegExp }
  | { label: string; kind: "section"; section: string; pattern: RegExp; locator: RegExp }
> = {
  "data-availability": {
    label: "数据可用性",
    kind: "section",
    section: "data_availability",
    // The section must name the data and give a locator (or an explicit "no external data").
    pattern: /数据集|数据来源|dataset|data availability|data are (?:publicly )?available|no external data/i,
    locator: /https?:\/\/|doi\.org|zenodo|figshare|未使用外部数据/i,
  },
  "code-availability": {
    label: "代码可用性",
    kind: "section",
    section: "data_availability",
    // Reviewers need a locator, not "the code lives in this workspace".
    pattern: /代码|仓库|code availability|implementation|repository/i,
    // A package name is a locator too; the generated table labels that row 代码包.
    locator: /https?:\/\/|github\.com|gitlab\.com|zenodo|doi\.org|代码包|code package/i,
  },
  ethics: { label: "伦理审批", kind: "declaration", pattern: /伦理|ethics|IRB|informed consent/i },
  "competing-interests": {
    label: "利益冲突",
    kind: "declaration",
    pattern: /利益冲突|competing interests?|conflict of interest/i,
  },
  funding: { label: "基金项目", kind: "declaration", pattern: /基金|资助|funding|grant/i },
  "author-contributions": {
    label: "作者贡献",
    kind: "declaration",
    pattern: /作者贡献|author contributions?|CRediT/i,
  },
  "llm-disclosure": {
    label: "生成式 AI 使用声明",
    kind: "declaration",
    pattern: /大模型|生成式\s*AI|generative AI|AI-assisted|LLM/i,
  },
}

/** What a Chinese first-tier venue (the project's CJC profile) expects. */
export const CJC_MANUSCRIPT_REQUIREMENTS: ManuscriptRequirements = {
  profile: "cjc-paper",
  language: "zh",
  required_sections: [
    "abstract",
    "introduction",
    "related_work",
    "method",
    "experimental_setup",
    "results",
    "discussion",
    "conclusion",
    "references",
  ],
  abstract_words: { min: 150, max: 500 },
  min_keywords: 4,
  min_references: 20,
  recent_reference_ratio: 0.5,
  recency_years: 5,
  required_statements: [
    { id: "data-availability", severity: "blocker" },
    { id: "code-availability", severity: "blocker" },
    { id: "ethics", severity: "blocker" },
    { id: "competing-interests", severity: "blocker" },
    { id: "funding", severity: "warning" },
    { id: "author-contributions", severity: "warning" },
  ],
  require_statistics: "warning",
  require_effect_size: false,
  min_tables: 1,
  min_figures: 0,
}

/**
 * An international Q1 submission. The bar is deliberately harder than CJC: reviewers there take an
 * English manuscript with a statistical comparison, a figure, a data/code locator and the full set of
 * declarations for granted, and reject on their absence.
 */
export const Q1_MANUSCRIPT_REQUIREMENTS: ManuscriptRequirements = {
  profile: "international-q1",
  language: "en",
  required_sections: [
    "abstract",
    "introduction",
    "related_work",
    "method",
    "experimental_setup",
    "results",
    "discussion",
    "conclusion",
    "references",
  ],
  abstract_words: { min: 150, max: 300 },
  min_keywords: 5,
  min_references: 40,
  recent_reference_ratio: 0.5,
  recency_years: 5,
  required_statements: [
    { id: "data-availability", severity: "blocker" },
    { id: "code-availability", severity: "blocker" },
    { id: "ethics", severity: "blocker" },
    { id: "competing-interests", severity: "blocker" },
    { id: "funding", severity: "blocker" },
    { id: "author-contributions", severity: "blocker" },
    { id: "llm-disclosure", severity: "blocker" },
  ],
  require_statistics: "blocker",
  require_effect_size: true,
  min_tables: 2,
  min_figures: 1,
}

/** The Chinese venue is the repository default; every other profile is an international submission. */
export function manuscriptRequirementsForProfile(profile?: string): ManuscriptRequirements {
  const selected = profile?.trim() || "cjc-paper"
  return selected === "cjc-paper" ? CJC_MANUSCRIPT_REQUIREMENTS : Q1_MANUSCRIPT_REQUIREMENTS
}

function finding(input: Omit<VerificationFinding, "finding_id">, subject?: string): VerificationFinding {
  return {
    finding_id: `${input.category}:${
      subject ?? input.claim_ids[0] ?? input.source_ids[0] ?? input.artifact_ids[0] ?? "global"
    }`,
    ...input,
  }
}

function sectionText(draft: DraftPaper, id: string) {
  return draft.sections.find((section) => section.section_id === id)?.markdown ?? ""
}

/** Han, kana, hangul and fullwidth forms all count as one word per character. */
const CJK_CHAR = /[　-ヿ㐀-䶿一-鿿가-힯＀-￯]/

function wordCount(text: string) {
  const prose = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/[`*_#>|[\]]/g, " ")
  const cjk = (prose.match(new RegExp(CJK_CHAR.source, "g")) ?? []).length
  const latin = prose.replace(new RegExp(CJK_CHAR.source, "g"), " ").match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g)?.length ?? 0
  return cjk + latin
}

function cjkRatio(text: string) {
  const meaningful = text.replace(/[\s\p{P}\p{S}]/gu, "")
  if (meaningful.length === 0) return 0
  return (meaningful.match(new RegExp(CJK_CHAR.source, "g")) ?? []).length / meaningful.length
}

function keywords(text: string) {
  return text
    .replace(/^\s*\*\*?关键词\*\*?\s*[:：]\s*/i, "")
    .split(/[;；,，、\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

/** Numbered reference entries, in `[1] ...` or `1. ...` form, deduplicated by number. */
function referenceEntries(text: string) {
  const byNumber = new Map<string, string>()
  for (const line of text.split("\n")) {
    const match = line.trim().match(/^\[?(\d+)\]?[.)]?\s+(.+)$/)
    if (!match) continue
    byNumber.set(match[1], match[2].trim())
  }
  return [...byNumber.values()]
}

/** The publication year follows the document-type marker; a year in the title is not the date. */
function referenceYear(entry: string) {
  const dated = entry.split(/\[(?:J|EB|M|C|D|R)\/OL\]\.?/i).pop() ?? entry
  const match = dated.match(/\b(19|20)\d{2}\b/)
  return match ? Number(match[0]) : undefined
}

function tableCount(markdown: string) {
  return (markdown.match(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/gm) ?? []).length
}

function figureCount(markdown: string) {
  return new Set(markdown.match(/!\[[^\]]*\]\(([^)]+)\)/g) ?? []).size
}

/**
 * A declaration's value: the second cell of the table row whose *label cell* matches, or the text
 * after "Label:" in prose. Matching the label anywhere in the line would let a value that mentions
 * the word satisfy the rule.
 */
function declarationValue(markdown: string, label: RegExp) {
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.startsWith("|")) {
      const cells = trimmed
        .split(/(?<!\\)\|/)
        .map((cell) => cell.replace(/\\\|/g, "|").trim())
        .filter((cell) => cell.length > 0)
      if (cells.length >= 2 && label.test(cells[0])) return cells[1]
      continue
    }
    const prose = trimmed.match(/^(?:[-*]\s*)?(?:\*\*)?([^:：]{2,40})(?:\*\*)?[:：]\s*(.+)$/)
    if (prose && label.test(prose[1])) return prose[2].trim()
  }
  return undefined
}

function statementDeclared(draft: DraftPaper, id: string) {
  const rule = STATEMENT_RULES[id]
  if (!rule) return true
  const text = sectionText(draft, rule.kind === "declaration" ? "declarations" : rule.section)
  if (!text) return false
  if (rule.kind === "declaration") {
    const value = declarationValue(text, rule.pattern)
    return value !== undefined && !UNDECLARED.test(value)
  }
  // Both the subject and a locator have to appear somewhere in the availability section; requiring
  // them on one line breaks the generated table layout, requiring only the locator lets a bare URL
  // stand in for either statement.
  return rule.pattern.test(text) && rule.locator.test(text)
}

/**
 * Dispersion and significance are read from their numeric form, not from the words: the generated
 * scaffold explicitly says it does not compute confidence intervals, and matching "置信区间" would
 * take that sentence for a report.
 */
function reportsDispersion(markdown: string) {
  return (
    /±\s*\d/.test(markdown) ||
    /\b\d+\.\d+\s*\(\s*\d+\.\d+\s*\)/.test(markdown) ||
    /\b(std|s\.d\.|SD)\s*[=:]\s*\d/i.test(markdown) ||
    /\b95%\s*(CI|confidence interval)\b[^.]{0,40}\d/i.test(markdown) ||
    /置信区间[^。]{0,30}\d/.test(markdown)
  )
}

function reportsEffectSize(markdown: string) {
  return /(cohen'?s d|cliff'?s (δ|delta)|\betas?\s*(squared|²)|η²|effect size|效果量)[^.]{0,40}\d/i.test(markdown)
}

function reportsSignificance(markdown: string) {
  return (
    /\bp\s*[<>=]\s*0?\.\d+/i.test(markdown) ||
    /p\s*值\s*[<>=]\s*0?\.\d+/i.test(markdown) ||
    /\b(t-test|Wilcoxon|Mann-Whitney|ANOVA|permutation test|bootstrap test|Friedman test)\b/i.test(markdown)
  )
}

function hasComparison(input: VerificationGateInput) {
  return Boolean(input.result_report.best_baseline && input.result_report.proposed)
}

export function checkManuscriptQuality(input: VerificationGateInput): VerificationFinding[] {
  const requirements = input.manuscript_requirements
  if (!requirements) return []
  return withSpan(
    "research.verification.manuscript",
    {
      "papercode.research.manuscript.profile": requirements.profile,
      "papercode.research.manuscript.sections": input.draft.sections.length,
    },
    () => {
      const draft = input.draft
      const markdown = draft.markdown
      const findings: VerificationFinding[] = []

      for (const id of requirements.required_sections) {
        const words = wordCount(sectionText(draft, id))
        if (words >= SUBSTANTIVE_WORDS) continue
        findings.push(
          finding(
            {
              category: "missing_section_content",
              severity: "blocker",
              message: `Section "${id}" carries ${words} words; a submission needs substantive prose.`,
              claim_ids: [],
              source_ids: [],
              artifact_ids: [],
              required_action: `Write the ${id} section from evidence before final export.`,
            },
            id,
          ),
        )
      }

      const abstract = sectionText(draft, "abstract")
      const abstractWords = wordCount(abstract)
      if (abstractWords < requirements.abstract_words.min || abstractWords > requirements.abstract_words.max) {
        findings.push(
          finding({
            category: "abstract_length",
            severity: "warning",
            message: `Abstract has ${abstractWords} words; ${requirements.profile} expects ${requirements.abstract_words.min}-${requirements.abstract_words.max}.`,
            claim_ids: [],
            source_ids: [],
            artifact_ids: [],
            required_action: "Tighten or expand the abstract to the venue's range.",
          }),
        )
      }

      const keywordCount = keywords(sectionText(draft, "keywords")).length
      if (keywordCount < requirements.min_keywords) {
        findings.push(
          finding({
            category: "missing_keywords",
            severity: "warning",
            message: `Only ${keywordCount} keywords are listed; ${requirements.min_keywords} are expected.`,
            claim_ids: [],
            source_ids: [],
            artifact_ids: [],
            required_action: "List at least the requested number of indexable keywords.",
          }),
        )
      }

      const placeholders = Array.from(new Set(markdown.match(new RegExp(PLACEHOLDER.source, "gi")) ?? []))
      if (placeholders.length > 0) {
        findings.push(
          finding({
            category: "placeholder_text",
            severity: "blocker",
            message: `The manuscript still contains placeholder markers: ${placeholders.slice(0, 5).join(", ")}.`,
            claim_ids: [],
            source_ids: [],
            artifact_ids: [],
            required_action: "Replace every placeholder with verified content or remove it.",
          }),
        )
      }

      for (const requirement of requirements.required_statements) {
        if (statementDeclared(draft, requirement.id)) continue
        const label = STATEMENT_RULES[requirement.id]?.label ?? requirement.id
        findings.push(
          finding(
            {
              category: "missing_statement",
              severity: requirement.severity,
              message: `The manuscript does not declare ${label}.`,
              claim_ids: [],
              source_ids: [],
              artifact_ids: [],
              required_action: `Add the ${label} declaration (or state explicitly that it does not apply).`,
            },
            requirement.id,
          ),
        )
      }

      const references = referenceEntries(sectionText(draft, "references"))
      if (references.length < requirements.min_references) {
        findings.push(
          finding({
            category: "insufficient_references",
            severity: "blocker",
            message: `The reference list has ${references.length} entries; ${requirements.profile} expects at least ${requirements.min_references}.`,
            claim_ids: [],
            source_ids: [],
            artifact_ids: [],
            required_action: "Add verified sources until the venue's minimum is met.",
          }),
        )
      } else {
        const years = references.map(referenceYear).filter((year): year is number => year !== undefined)
        if (years.length >= 5) {
          const currentYear = Number((input.now ?? new Date().toISOString()).slice(0, 4))
          const recent = years.filter((year) => currentYear - year <= requirements.recency_years).length
          const ratio = recent / years.length
          if (ratio < requirements.recent_reference_ratio) {
            findings.push(
              finding({
                category: "stale_references",
                severity: "warning",
                message: `Only ${Math.round(ratio * 100)}% of dated references are from the last ${requirements.recency_years} years.`,
                claim_ids: [],
                source_ids: [],
                artifact_ids: [],
                required_action: "Bring the related work up to date with recent literature.",
              }),
            )
          }
        } else {
          // Without dates the recency rule cannot run, which would otherwise let an undated
          // bibliography pass the check silently.
          findings.push(
            finding({
              category: "stale_references",
              severity: "warning",
              message: `Only ${years.length} of ${references.length} references carry a publication year; recency cannot be verified.`,
              claim_ids: [],
              source_ids: [],
              artifact_ids: [],
              required_action: "Give every reference a publication date.",
            }),
          )
        }
      }

      // Statistics, tables and figures are claimed by the results section; counting them anywhere
      // would let a boilerplate declaration table or an appendix figure stand in for a result.
      const results = sectionText(draft, "results")
      if (requirements.require_statistics !== "off" && hasComparison(input)) {
        const missing: string[] = []
        if (!reportsDispersion(results)) missing.push("dispersion (mean ± std or a confidence interval)")
        if (!reportsSignificance(results)) missing.push("a significance test (p-value or named test)")
        if (missing.length > 0) {
          findings.push(
            finding({
              category: "missing_statistics",
              severity: requirements.require_statistics,
              message: `The paper compares against a baseline but does not report ${missing.join(" or ")}.`,
              claim_ids: [],
              source_ids: [],
              artifact_ids: [],
              required_action: "Run repeated trials and report dispersion and a significance test.",
            }),
          )
        }
        if (requirements.require_effect_size && !reportsEffectSize(results)) {
          findings.push(
            finding({
              category: "missing_effect_size",
              severity: "blocker",
              message: "The baseline comparison reports no effect size (Cohen's d or Cliff's delta).",
              claim_ids: [],
              source_ids: [],
              artifact_ids: [],
              required_action: "Report the effect size next to the significance test.",
            }),
          )
        }
      }

      const tables = tableCount(results)
      if (tables < requirements.min_tables) {
        findings.push(
          finding({
            category: "missing_table",
            severity: "blocker",
            message: `The manuscript has ${tables} tables; ${requirements.profile} expects at least ${requirements.min_tables}.`,
            claim_ids: [],
            source_ids: [],
            artifact_ids: [],
            required_action: "Report the main results in a table with the primary metric.",
          }),
        )
      }

      const figures = figureCount(results)
      if (figures < requirements.min_figures) {
        findings.push(
          finding({
            category: "missing_figure",
            severity: "blocker",
            message: `The manuscript has ${figures} figures; ${requirements.profile} expects at least ${requirements.min_figures}.`,
            claim_ids: [],
            source_ids: [],
            artifact_ids: [],
            required_action: "Add the primary result or method figure.",
          }),
        )
      }

      if (requirements.language !== "any") {
        // Judge the narrative the venue reads, not internal bookkeeping sections (audit appendices,
        // the availability table) or the reference list, which may legitimately mix languages.
        const body = requirements.required_sections
          .filter((id) => id !== "references")
          .map((id) => sectionText(draft, id))
          .join("\n")
        const ratio = cjkRatio(body)
        const wrong =
          requirements.language === "en" ? ratio > 0.05 : requirements.language === "zh" ? ratio < 0.1 : false
        if (wrong) {
          findings.push(
            finding({
              category: "manuscript_language",
              severity: "blocker",
              message: `The manuscript is ${Math.round(ratio * 100)}% CJK and does not match the ${requirements.language} target of ${requirements.profile}.`,
              claim_ids: [],
              source_ids: [],
              artifact_ids: [],
              required_action: `Produce the manuscript in the venue's language (${requirements.language}).`,
            }),
          )
        }
      }

      return findings
    },
  )
}
