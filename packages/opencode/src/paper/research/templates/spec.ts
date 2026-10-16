export type TemplateSourceTrust = "official" | "publisher" | "ctan" | "github" | "mirror" | "fallback"

export type TemplateLicenseStatus = "clear" | "unclear" | "conflict"

export type TemplateSourceEvidence = {
  source_id: string
  title: string
  url: string
  trust: TemplateSourceTrust
  license?: string
  license_status: TemplateLicenseStatus
  version?: string
  sha256?: string
  retrieved_at: string
}

export type TemplateSpec = {
  schema_version: "TemplateSpec.v1"
  template_id: string
  venue: string
  label: string
  engine: "latex" | "xelatex" | "lualatex" | "tectonic"
  document_class: string
  citation_style: string
  files: Array<{ path: string; role: "class" | "style" | "bibliography" | "template" | "readme"; required: boolean }>
  evidence: TemplateSourceEvidence[]
  confidence: number
  license: {
    status: TemplateLicenseStatus
    expression?: string
  }
  conflicts: string[]
  fallback: boolean
  metadata?: Record<string, unknown>
}

export type TemplateResolution =
  | { action: "adopt"; spec: TemplateSpec }
  | { action: "pause"; reason: "source_conflict" | "unclear_license" | "low_confidence" | "requirement_conflict"; message: string; candidates: TemplateSpec[] }

export function templateSpecId(venue: string) {
  return venue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function createFallbackCjcTemplate(now: string): TemplateSpec {
  return {
    schema_version: "TemplateSpec.v1",
    template_id: "cjc-default",
    venue: "中国计算机学报",
    label: "CJC default GB/T 7714 style",
    engine: "xelatex",
    document_class: "ctexart",
    citation_style: "gbt7714-numerical",
    files: [{ path: "template.tex", role: "template", required: true }],
    evidence: [
      {
        source_id: "template-source-cjc-default",
        title: "papercode built-in CJC fallback",
        url: "papercode://templates/cjc-default",
        trust: "fallback",
        license: "project-internal",
        license_status: "clear",
        retrieved_at: now,
      },
    ],
    confidence: 0.75,
    license: { status: "clear", expression: "project-internal" },
    conflicts: [],
    fallback: true,
  }
}
