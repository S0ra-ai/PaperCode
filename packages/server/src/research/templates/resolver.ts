import { appendResearchEvent, writeResearchArtifact, type ResearchRuntimeOptions } from "../runtime"
import { withSpan } from "../telemetry"
import { createFallbackCjcTemplate, templateSpecId, type TemplateResolution, type TemplateSpec } from "./spec"

export type TemplateSearchInput = {
  run_id: string
  venue?: string
  user_requirements?: string[]
  now?: string
  candidates?: TemplateSpec[]
}

function nowIso(options?: ResearchRuntimeOptions, override?: string) {
  return override ?? (options?.clock?.() ?? new Date()).toISOString()
}

function builtInCandidate(venue: string, now: string): TemplateSpec | undefined {
  const normalized = venue.toLowerCase()
  if (normalized.includes("ieee")) {
    return {
      schema_version: "TemplateSpec.v1",
      template_id: "ieee-official",
      venue: "IEEE",
      label: "IEEE official conference template",
      engine: "latex",
      document_class: "IEEEtran",
      citation_style: "IEEEtran",
      files: [
        { path: "IEEEtran.cls", role: "class", required: true },
        { path: "template.tex", role: "template", required: true },
      ],
      evidence: [
        {
          source_id: "template-source-ieee",
          title: "IEEE Author Center LaTeX template",
          url: "https://template-selector.ieee.org/",
          trust: "official",
          license: "IEEE template terms",
          license_status: "clear",
          retrieved_at: now,
        },
      ],
      confidence: 0.92,
      license: { status: "clear", expression: "IEEE template terms" },
      conflicts: [],
      fallback: false,
    }
  }
  if (normalized.includes("acm")) {
    return {
      schema_version: "TemplateSpec.v1",
      template_id: "acm-official",
      venue: "ACM",
      label: "ACM official acmart template",
      engine: "latex",
      document_class: "acmart",
      citation_style: "ACM-Reference-Format",
      files: [
        { path: "acmart.cls", role: "class", required: true },
        { path: "sample-sigconf.tex", role: "template", required: true },
      ],
      evidence: [
        {
          source_id: "template-source-acm",
          title: "ACM Primary Article Template",
          url: "https://www.acm.org/publications/proceedings-template",
          trust: "official",
          license: "ACM template terms",
          license_status: "clear",
          retrieved_at: now,
        },
      ],
      confidence: 0.92,
      license: { status: "clear", expression: "ACM template terms" },
      conflicts: [],
      fallback: false,
    }
  }
  return undefined
}

export function resolveTemplateCandidates(input: TemplateSearchInput, options?: ResearchRuntimeOptions): TemplateResolution {
  const now = nowIso(options, input.now)
  const venue = input.venue?.trim() || "中国计算机学报"
  const candidates = [...(input.candidates ?? [])]
  const builtIn = builtInCandidate(venue, now)
  if (builtIn) candidates.push(builtIn)
  if (candidates.length === 0) candidates.push(createFallbackCjcTemplate(now))

  const requirementConflict = input.user_requirements?.find((item) => /word|docx only|no latex/i.test(item))
  if (requirementConflict) {
    return {
      action: "pause",
      reason: "requirement_conflict",
      message: `User requirement conflicts with LaTeX template pipeline: ${requirementConflict}`,
      candidates,
    }
  }

  const conflicts = candidates.filter((candidate) => candidate.conflicts.length > 0)
  if (conflicts.length > 0) {
    return { action: "pause", reason: "source_conflict", message: "Template source conflict detected.", candidates }
  }
  const unclear = candidates.filter((candidate) => candidate.license.status !== "clear")
  if (unclear.length > 0) {
    return { action: "pause", reason: "unclear_license", message: "Template license is unclear.", candidates }
  }

  const [best] = candidates.toSorted((left, right) => right.confidence - left.confidence)
  if (!best || best.confidence < 0.75) {
    return { action: "pause", reason: "low_confidence", message: "Template confidence below 0.75.", candidates }
  }
  return { action: "adopt", spec: { ...best, template_id: best.template_id || templateSpecId(best.venue) } }
}

export async function resolveAndRecordTemplate(
  runDir: string,
  input: TemplateSearchInput,
  options?: ResearchRuntimeOptions,
) {
  return withSpan(
    "research.template.resolve",
    { "paper_fucker.research.template.venue": input.venue ?? "" },
    async (span) => {
      const resolution = resolveTemplateCandidates(input, options)
      const artifact = await writeResearchArtifact(
        runDir,
        {
          kind: "log",
          logical_path: "templates/template-resolution.json",
          data: resolution,
          metadata: { artifact_schema: resolution.action === "adopt" ? "TemplateSpec.v1" : "TemplateResolutionPause.v1" },
        },
        options,
      )
      await appendResearchEvent(
        runDir,
        {
          type: resolution.action === "adopt" ? "template.adopted" : "template.paused",
          actor: "agent",
          payload: {
            action: resolution.action,
            reason: resolution.action === "pause" ? resolution.reason : undefined,
            artifact_id: artifact.artifact_id,
          },
        },
        options,
      )
      span.setAttribute("paper_fucker.research.template.action", resolution.action)
      return { resolution, artifact }
    },
  )
}
