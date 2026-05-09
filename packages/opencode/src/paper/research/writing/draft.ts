import { withSpan } from "../telemetry"
import type { CheckpointGuidance, ClaimLedger, ClaimLedgerEntry, DraftPaper, DraftSection } from "./schemas"

export type ComposeDraftPaperInput = {
  title: string
  ledger: ClaimLedger
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
  return ` ${entry.citations.map((citation) => `[${citation.citation_id}]`).join(" ")}`
}

function claimMarkdown(entry: ClaimLedgerEntry) {
  const annotation =
    entry.status === "supported"
      ? ""
      : `\n<!-- unsupported-claim: ${entry.claim_id} needs evidence before final export -->`
  return `${entry.text}${citationText(entry)}${annotation}`
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
      const bySection = new Map<string, ClaimLedgerEntry[]>()
      for (const entry of input.ledger.entries) {
        bySection.set(entry.section_id, [...(bySection.get(entry.section_id) ?? []), entry])
      }
      const sections = Array.from(bySection.entries()).map(([sectionId, entries]) => buildSection(sectionId, entries))
      const markdown = render(input.title, sections)
      return {
        schema_version: "DraftPaper.v1",
        draft_id: `draft:${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "paper"}`,
        title: input.title,
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
