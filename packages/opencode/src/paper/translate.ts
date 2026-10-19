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

/**
 * Every body section is translated; the reference list keeps its bibliography as-is and the internal
 * audit appendices never reach the venue. The title is translated separately and replaces the draft
 * title, because a Chinese title in front of an English manuscript is an immediate desk reject.
 */
function translatableSections(draft: DraftPaper) {
  return draft.sections
    .map((section) => section.section_id)
    .filter((id) => id !== "references" && !id.startsWith("appendix_"))
}

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
export type TranslatedDraft = {
  overrides: DraftSectionOverride[]
  title?: string
}

export type TranslationFailure = {
  section_id: string
  reason: string
}

export async function translateDraftSections(
  draft: DraftPaper,
  translator: Translator,
  options?: { onFailure?: (failure: TranslationFailure) => void },
): Promise<TranslatedDraft | undefined> {
  const overrides: DraftSectionOverride[] = []
  const fail = (section_id: string, reason: string) => {
    options?.onFailure?.({ section_id, reason })
    return undefined
  }
  const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
  let title: string | undefined
  if (cjkRatio(draft.title) > 0.02) {
    let translatedTitle: string
    try {
      translatedTitle = stripFence(await translator({ section_id: "title", text: draft.title, language: "en" }))
    } catch (error) {
      return fail("title", `request failed: ${message(error)}`)
    }
    if (translatedTitle.length === 0) return fail("title", "empty translation")
    if (cjkRatio(translatedTitle) > 0.02) return fail("title", "translation still contains Chinese")
    title = translatedTitle
  }
  for (const sectionId of translatableSections(draft)) {
    const section = draft.sections.find((item) => item.section_id === sectionId)
    if (!section || section.markdown.trim().length === 0) continue
    // Already English: nothing to do (author-supplied overrides may cover some sections).
    if (cjkRatio(section.markdown) < 0.02) continue
    let translated: string
    try {
      translated = stripFence(await translator({ section_id: sectionId, text: section.markdown, language: "en" }))
    } catch (error) {
      return fail(sectionId, `request failed: ${message(error)}`)
    }
    if (translated.length === 0) return fail(sectionId, "empty translation")
    if (cjkRatio(translated) > 0.02) return fail(sectionId, "translation still contains Chinese")
    if (!structurePreserved(section.markdown, translated))
      return fail(sectionId, "translation changed the table or image structure")
    let translatedTitle: string | undefined
    if (cjkRatio(section.title) > 0.02) {
      try {
        const value = stripFence(
          await translator({ section_id: `section_title:${sectionId}`, text: section.title, language: "en" }),
        )
        if (value.length === 0) return fail(sectionId, "empty section title translation")
        if (cjkRatio(value) > 0.02) return fail(sectionId, "section title still contains Chinese")
        translatedTitle = value
      } catch (error) {
        return fail(sectionId, `section title request failed: ${message(error)}`)
      }
    }
    overrides.push({ section_id: sectionId, markdown: translated, ...(translatedTitle ? { title: translatedTitle } : {}) })
  }
  if (overrides.length === 0 && !title) return undefined
  return { overrides, ...(title ? { title } : {}) }
}
