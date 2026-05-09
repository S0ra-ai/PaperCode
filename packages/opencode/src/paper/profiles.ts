export const BUILTIN_PAPER_PROFILE_IDS = [
  "nature-paper",
  "ieee-paper",
  "acm-paper",
  "springer-paper",
  "generic-preprint",
] as const

export type PaperProfileId = (typeof BUILTIN_PAPER_PROFILE_IDS)[number]

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
): PaperProfile {
  return {
    schema_version: "PaperProfile.v1",
    id,
    title,
    skill_id: id,
    guidance_refresh_policy: id === "generic-preprint" ? "static_local_guidance" : "fetch_current_official_guidance",
    official_guidance_sources,
    required_checks: commonManuscriptChecks,
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
          name: "paper_fucker generic preprint profile",
          url: "local://paper_fucker/profiles/generic-preprint",
          trust: "local",
          refresh: "manual",
        },
      ],
      "generic_markdown_first",
    ),
  ]
}
