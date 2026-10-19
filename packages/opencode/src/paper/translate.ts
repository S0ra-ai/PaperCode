import type { DraftPaper } from "./research/writing"
import type { DraftSectionOverride } from "./research/writing"

/**
 * A venue that publishes in English cannot be satisfied by the generated Chinese scaffold, and the
 * deterministic generators cannot write English. Translation is therefore a seam: the caller supplies
 * a translator (the default one speaks the OpenAI chat-completions dialect and is configured through
 * the environment), and the authoring loop applies the result as section overrides before the gate.
 *
 * Translation is all-or-nothing: a half-translated manuscript is worse than an untranslated one,
 * because the gate would then judge a mixture. Any failure leaves the draft untouched and the gate
 * reports the language mismatch honestly.
 */
export type Translator = (request: { section_id: string; text: string; language: "en" }) => Promise<string>

/** Sections a translation has to cover; the rest of the scaffold is bookkeeping the venue never sees. */
const TRANSLATABLE_SECTIONS = [
  "abstract",
  "keywords",
  "introduction",
  "related_work",
  "method",
  "experimental_setup",
  "results",
  "discussion",
  "conclusion",
  "declarations",
  "data_availability",
] as const

const CJK = /[　-〿぀-ヿ㐀-䶿一-鿿가-힯＀-￯]/

function cjkRatio(text: string) {
  const meaningful = text.replace(/[\s\p{P}\p{S}]/gu, "")
  if (meaningful.length === 0) return 0
  return (meaningful.match(new RegExp(CJK.source, "g")) ?? []).length / meaningful.length
}

function stripFence(value: string) {
  const trimmed = value.trim()
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i)
  return (fenced ? fenced[1] : trimmed).trim()
}

/** Tables and image references carry the results; a translation that drops them is not usable. */
function structurePreserved(source: string, translated: string) {
  const tables = (text: string) => (text.match(/^\s*\|?\s*:?-{3,}/gm) ?? []).length
  const images = (text: string) => (text.match(/!\[[^\]]*\]\([^)]+\)/g) ?? []).length
  return tables(translated) >= tables(source) && images(translated) >= images(source)
}

const SYSTEM_PROMPT = [
  "You translate academic manuscript sections into publication-quality English.",
  "Preserve Markdown structure exactly: headings, tables, pipes, alignment rows, image links, numbers, units and citations.",
  "Do not add, remove or weaken any claim, value or reference. Translate prose and labels only.",
  "Return only the translated Markdown, without code fences or commentary.",
].join(" ")

/** OpenAI-compatible translator configured by PAPERCODE_TRANSLATE_{BASE_URL,API_KEY,MODEL}. */
export function translatorFromEnv(env: Record<string, string | undefined> = process.env): Translator | undefined {
  const baseURL = env.PAPERCODE_TRANSLATE_BASE_URL?.trim()
  const model = env.PAPERCODE_TRANSLATE_MODEL?.trim()
  if (!baseURL || !model) return undefined
  const apiKey = env.PAPERCODE_TRANSLATE_API_KEY?.trim()
  return async ({ text }) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)
    try {
      const response = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text },
          ],
        }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`translation endpoint returned ${response.status}`)
      const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
      return body.choices?.[0]?.message?.content ?? ""
    } finally {
      clearTimeout(timer)
    }
  }
}

/**
 * Translate the narrative sections of a Chinese manuscript. Returns undefined when translation cannot
 * be completed or comes back still in Chinese; the caller then keeps the generated draft.
 */
export async function translateDraftSections(
  draft: DraftPaper,
  translator: Translator,
): Promise<DraftSectionOverride[] | undefined> {
  const overrides: DraftSectionOverride[] = []
  for (const sectionId of TRANSLATABLE_SECTIONS) {
    const section = draft.sections.find((item) => item.section_id === sectionId)
    if (!section || section.markdown.trim().length === 0) continue
    // Already English: nothing to do (author-supplied overrides may cover some sections).
    if (cjkRatio(section.markdown) < 0.02) continue
    let translated: string
    try {
      translated = stripFence(await translator({ section_id: sectionId, text: section.markdown, language: "en" }))
    } catch {
      return undefined
    }
    if (translated.length === 0 || cjkRatio(translated) > 0.02) return undefined
    if (!structurePreserved(section.markdown, translated)) return undefined
    overrides.push({ section_id: sectionId, markdown: translated })
  }
  return overrides.length > 0 ? overrides : undefined
}
