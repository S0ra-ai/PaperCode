export const BUILTIN_PAPER_PROFILE_IDS = [
  "nature-paper",
  "cjc-paper",
  "ieee-paper",
  "acm-paper",
  "springer-paper",
  "generic-preprint",
  "custom-journal",
] as const

export type PaperProfileId = (typeof BUILTIN_PAPER_PROFILE_IDS)[number]

export const ACTIVE_PAPER_PROFILE_IDS = ["cjc-paper"] as const

export interface PaperProfileGuidanceSource {
  name: string
  url: string
  trust: "official" | "community" | "local"
  refresh: "runtime" | "manual"
}

export interface PaperProfileRequiredCheck {
  id: string
  title: string
  required: boolean
  evidence: "section" | "statement" | "artifact"
}

export interface PaperProfile {
  schema_version: "PaperProfile.v1"
  id: PaperProfileId
  title: string
  skill_id: string
  guidance_refresh_policy: "fetch_current_official_guidance" | "static_local_guidance"
  official_guidance_sources: PaperProfileGuidanceSource[]
  required_checks: PaperProfileRequiredCheck[]
  template_strategy: "official_template_first" | "venue_template_first" | "generic_markdown_first"
}

export interface PaperGeneratedJournalProfile {
  schema_version: "PaperGeneratedJournalProfile.v1"
  profile_id: "custom-journal"
  journal_name: string
  status: "needs_official_guidance"
  official_url?: string
  created_at: string
  required_actions: string[]
  notes: string[]
}

export interface PaperProfileCheckInput {
  sections?: string[]
  statements?: string[]
  artifacts?: string[]
}

export interface PaperProfileCheckIssue {
  check_id: string
  title: string
  message: string
}

export interface PaperProfileCheck {
  schema_version: "PaperProfileCheck.v1"
  profile_id: PaperProfileId
  status: "passed" | "blocked"
  blockers: PaperProfileCheckIssue[]
  warnings: PaperProfileCheckIssue[]
}

export class DuplicatePaperProfileError extends Error {
  constructor(id: string) {
    super(`Paper profile "${id}" is already registered`)
    this.name = "DuplicatePaperProfileError"
  }
}

export class MissingPaperProfileError extends Error {
  constructor(id: string) {
    super(`Paper profile "${id}" is not registered`)
    this.name = "MissingPaperProfileError"
  }
}

export class PaperProfileRegistry {
  private readonly profiles = new Map<PaperProfileId, PaperProfile>()

  constructor(profiles: PaperProfile[] = []) {
    for (const profile of profiles) {
      this.register(profile)
    }
  }

  register(profile: PaperProfile) {
    if (this.profiles.has(profile.id)) {
      throw new DuplicatePaperProfileError(profile.id)
    }
    this.profiles.set(profile.id, profile)
    return this
  }

  list() {
    return Array.from(this.profiles.values())
  }

  get(id: PaperProfileId) {
    const profile = this.profiles.get(id)
    if (!profile) throw new MissingPaperProfileError(id)
    return profile
  }

  check(id: PaperProfileId, input: PaperProfileCheckInput): PaperProfileCheck {
    const profile = this.get(id)
    const sections = new Set(input.sections ?? [])
    const statements = new Set(input.statements ?? [])
    const artifacts = new Set(input.artifacts ?? [])
    const blockers: PaperProfileCheckIssue[] = []
    const warnings: PaperProfileCheckIssue[] = []

    for (const requiredCheck of profile.required_checks) {
      const available =
        requiredCheck.evidence === "section"
          ? sections.has(requiredCheck.id)
          : requiredCheck.evidence === "statement"
            ? statements.has(requiredCheck.id)
            : artifacts.has(requiredCheck.id)

      if (available) continue

      const issue = {
        check_id: requiredCheck.id,
        title: requiredCheck.title,
        message: `Missing ${requiredCheck.evidence} evidence for ${requiredCheck.title}.`,
      }
      if (requiredCheck.required) blockers.push(issue)
      else warnings.push(issue)
    }

    return {
      schema_version: "PaperProfileCheck.v1",
      profile_id: id,
      status: blockers.length === 0 ? "passed" : "blocked",
      blockers,
      warnings,
    }
  }
}

export function createPaperProfileRegistry(profiles: PaperProfile[] = []) {
  return new PaperProfileRegistry(profiles)
}

export function isPaperProfileId(value: string | undefined): value is PaperProfileId {
  return Boolean(value && BUILTIN_PAPER_PROFILE_IDS.includes(value as PaperProfileId))
}

function normalizeJournalKey(input: string | undefined) {
  return (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[《》<>]/g, "")
}

export function resolvePaperProfileSelection(input?: {
  target_profile?: string
  target_journal?: string
  target_journal_url?: string
}): {
  profile_id: PaperProfileId
  journal_name?: string
  generated_profile?: PaperGeneratedJournalProfile
} {
  const rawJournal = input?.target_journal?.trim()
  const rawProfile = input?.target_profile?.trim()
  const key = normalizeJournalKey(rawJournal || rawProfile)

  if (
    key === "中国计算机学报" ||
    key === "计算机学报" ||
    key === "chinese journal of computers" ||
    key === "cjc"
  ) {
    return { profile_id: "cjc-paper", journal_name: rawJournal || "中国计算机学报" }
  }

  return { profile_id: "cjc-paper", journal_name: "中国计算机学报" }
}

export function createGeneratedJournalProfileDraft(input: {
  journal_name: string
  official_url?: string
  now?: string
}): PaperGeneratedJournalProfile {
  const officialUrl = input.official_url?.trim()
  return {
    schema_version: "PaperGeneratedJournalProfile.v1",
    profile_id: "custom-journal",
    journal_name: input.journal_name.trim(),
    status: "needs_official_guidance",
    official_url: officialUrl || undefined,
    created_at: input.now ?? new Date().toISOString(),
    required_actions: [
      "抓取并确认期刊官网的作者指南、投稿模板和参考文献格式。",
      "将官方模板映射为 PaperProfile.v1 required checks。",
      "用官方模板生成导出样式，并在最终导出前运行 profile compliance gate。",
    ],
    notes: [
      "未知期刊不会使用猜测规则生成投稿格式。",
      officialUrl ? "用户提供了候选官方入口；仍需在运行时确认其来源可信。" : "尚未提供期刊官方入口。",
    ],
  }
}

const commonManuscriptChecks: PaperProfileRequiredCheck[] = [
  { id: "abstract", title: "Abstract", required: true, evidence: "section" },
  { id: "introduction", title: "Introduction", required: true, evidence: "section" },
  { id: "results", title: "Results", required: true, evidence: "section" },
  { id: "methods", title: "Methods", required: true, evidence: "section" },
  { id: "data-availability", title: "Data availability statement", required: true, evidence: "statement" },
  { id: "code-availability", title: "Code availability statement", required: true, evidence: "statement" },
  { id: "ethics", title: "Ethics declaration", required: true, evidence: "statement" },
  { id: "competing-interests", title: "Competing interests declaration", required: true, evidence: "statement" },
  { id: "figures-tables", title: "Figures and tables", required: true, evidence: "artifact" },
  { id: "references", title: "References", required: true, evidence: "artifact" },
  { id: "supplementary-material", title: "Supplementary material", required: false, evidence: "artifact" },
]

function profile(
  id: PaperProfileId,
  title: string,
  official_guidance_sources: PaperProfileGuidanceSource[],
  template_strategy: PaperProfile["template_strategy"],
  extraChecks: PaperProfileRequiredCheck[] = [],
): PaperProfile {
  return {
    schema_version: "PaperProfile.v1",
    id,
    title,
    skill_id: id,
    guidance_refresh_policy: id === "generic-preprint" ? "static_local_guidance" : "fetch_current_official_guidance",
    official_guidance_sources,
    required_checks: [...commonManuscriptChecks, ...extraChecks],
    template_strategy,
  }
}

export function defaultPaperProfiles(): PaperProfile[] {
  return [
    profile(
      "nature-paper",
      "Nature Portfolio paper",
      [
        {
          name: "Nature Portfolio author guidance",
          url: "https://www.nature.com/nature/for-authors",
          trust: "official",
          refresh: "runtime",
        },
        {
          name: "Nature Portfolio writing guidance",
          url: "https://www.nature.com/nature-portfolio/for-authors/write",
          trust: "official",
          refresh: "runtime",
        },
      ],
      "official_template_first",
    ),
    profile(
      "cjc-paper",
      "计算机学报（Chinese Journal of Computers）",
      [
        {
          name: "计算机学报官网",
          url: "https://cjc.ict.ac.cn/",
          trust: "official",
          refresh: "runtime",
        },
        {
          name: "计算机学报官方稿件模板入口",
          url: "https://cjc.ict.ac.cn/",
          trust: "official",
          refresh: "runtime",
        },
      ],
      "official_template_first",
      [
        { id: "chinese-title-abstract-keywords", title: "中文题名、摘要与关键词", required: true, evidence: "statement" },
        { id: "english-title-abstract-keywords", title: "英文题名、摘要与关键词", required: true, evidence: "statement" },
        { id: "official-cjc-template", title: "计算机学报官方模板", required: true, evidence: "artifact" },
      ],
    ),
    profile(
      "ieee-paper",
      "IEEE paper",
      [
        {
          name: "IEEE author center",
          url: "https://ieeeauthorcenter.ieee.org/",
          trust: "official",
          refresh: "runtime",
        },
      ],
      "official_template_first",
    ),
    profile(
      "acm-paper",
      "ACM paper",
      [
        {
          name: "ACM authors",
          url: "https://www.acm.org/publications/authors",
          trust: "official",
          refresh: "runtime",
        },
      ],
      "official_template_first",
    ),
    profile(
      "springer-paper",
      "Springer paper",
      [
        {
          name: "Springer author guidance",
          url: "https://www.springer.com/gp/authors-editors",
          trust: "official",
          refresh: "runtime",
        },
      ],
      "official_template_first",
    ),
    profile(
      "generic-preprint",
      "Generic preprint",
      [
        {
          name: "papercode generic preprint profile",
          url: "local://papercode/profiles/generic-preprint",
          trust: "local",
          refresh: "manual",
        },
      ],
      "generic_markdown_first",
    ),
    profile(
      "custom-journal",
      "自定义期刊 profile 草案",
      [
        {
          name: "PaperCode 自定义期刊草案",
          url: "local://papercode/profiles/custom-journal",
          trust: "local",
          refresh: "manual",
        },
      ],
      "official_template_first",
      [{ id: "official-journal-guidance", title: "期刊官方作者指南", required: true, evidence: "artifact" }],
    ),
  ]
}
