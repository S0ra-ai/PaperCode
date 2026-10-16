import { createHash } from "crypto"
import { withSpan } from "../telemetry"
import type { DraftRevision } from "./schemas"

export type CreateDraftRevisionInput = {
  previous_markdown: string
  next_markdown: string
  now?: string
}

function nowIso(override?: string) {
  return override ?? new Date().toISOString()
}

function diffLines(previous: string, next: string) {
  const previousLines = previous.split(/\r?\n/)
  const nextLines = next.split(/\r?\n/)
  const max = Math.max(previousLines.length, nextLines.length)
  const out: string[] = []
  for (let index = 0; index < max; index++) {
    const before = previousLines[index]
    const after = nextLines[index]
    if (before === after) {
      if (before !== undefined) out.push(` ${before}`)
      continue
    }
    if (before !== undefined) out.push(`-${before}`)
    if (after !== undefined) out.push(`+${after}`)
  }
  return out.join("\n")
}

function token(previous: string, next: string) {
  return createHash("sha256").update(`${previous}\0${next}`).digest("hex").slice(0, 16)
}

export function createDraftRevision(input: CreateDraftRevisionInput): DraftRevision {
  return withSpan(
    "research.writing.revision",
    {
      "papercode.research.draft.previous_bytes": input.previous_markdown.length,
      "papercode.research.draft.next_bytes": input.next_markdown.length,
    },
    () => ({
      schema_version: "DraftRevision.v1",
      created_at: nowIso(input.now),
      previous_markdown: input.previous_markdown,
      next_markdown: input.next_markdown,
      diff: diffLines(input.previous_markdown, input.next_markdown),
      rollback_token: token(input.previous_markdown, input.next_markdown),
    }),
  )
}

export function rollbackDraftRevision(revision: DraftRevision) {
  return revision.previous_markdown
}
