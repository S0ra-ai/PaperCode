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

/** Tables and image references carry the results; row counts and image targets must survive. */
function structurePreserved(source: string, translated: string) {
  const rows = (text: string) => (text.match(/^\s*\|.*\|\s*$/gm) ?? []).length
  const separators = (text: string) => (text.match(/^\s*\|?\s*:?-{3,}/gm) ?? []).length
  const images = (text: string) => [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]!).sort()
  return (
    rows(translated) === rows(source) &&
    separators(translated) === separators(source) &&
    JSON.stringify(images(translated)) === JSON.stringify(images(source))
  )
}

/** Numbers and units are claims; a translation may not round, drop or alter them. */
function numbersPreserved(source: string, translated: string) {
  const numbers = source.match(/(?<![\w.])\d+(?:[.,]\d+)*(?:%|‰)?(?![\w])/g) ?? []
  return numbers.every((number) => translated.includes(number))
}

/** Full command cells and fenced blocks must survive verbatim, not just their first token. */
const COMMAND_HEAD =
  /^(?:\$ )?(?:bun|docker|podman|python3?|pip3?|npm|npx|pnpm|yarn|git|make|bash|sh|node|deno|uv|go|cargo|java|mvn|gradle|\.\/|~\/)\b/
function commandLines(markdown: string) {
  const commands: string[] = []
  let fence: string[] | undefined
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) {
      if (fence) {
        const block = fence.join("\n").trim()
        if (block) commands.push(block)
        fence = undefined
      } else fence = []
      continue
    }
    if (fence) {
      fence.push(line)
      continue
    }
    if (!line.includes("|")) continue
    for (const cell of line.split("|")) {
      const text = cell.trim().replace(/^`+|`+$/g, "").trim()
      if (COMMAND_HEAD.test(text)) commands.push(text)
    }
  }
  return commands
}

function commandsPreserved(source: string, translated: string) {
  const target = translated.replace(/\s+/g, " ")
  return commandLines(source).every((command) => target.includes(command.replace(/\s+/g, " ")))
}

/** URLs, source paths and flag assignments are locators; a translated locator cannot be followed. */
function locatorsPreserved(source: string, translated: string) {
  const patterns = [/--[A-Za-z][\w-]*=\S+/g, /\bsrc\/[\w./-]+/g, /https?:\/\/[^\s)]+/g]
  return patterns.every((pattern) =>
    (source.match(pattern) ?? []).every((token) => translated.includes(token.replace(/\s+/g, " "))),
  )
}

const SYSTEM_PROMPT = [
  "You translate academic manuscript sections into publication-quality English.",
  "Preserve Markdown structure exactly: headings, tables, pipes, alignment rows and image links.",
  "Keep URLs, file paths, commands, flags, numbers, units and citations exactly as written; never translate or reformat them.",
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
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
      }
      const choice = body.choices?.[0]
      if (!choice) throw new Error("translation endpoint returned no choices")
      if (choice.finish_reason === "length")
        throw new Error("translation was truncated by the provider token limit")
      if (typeof choice.message?.content !== "string")
        throw new Error("translation endpoint returned no text content")
      return choice.message.content
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

/** Retries absorb transient endpoint failures and models that occasionally echo the source. */
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 750

async function translateValidated(
  translator: Translator,
  section_id: string,
  text: string,
  validate: (value: string) => string | undefined,
  clean: (value: string) => string = stripFence,
): Promise<{ value?: string; reason?: string }> {
  let reason = "empty translation"
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let value: string
    try {
      // Retry with an explicit instruction; an identical prompt can reproduce the same echo.
      const prompt = attempt === 0 ? text : `${text}\n\nReturn the English translation only. Do not include the original Chinese text.`
      value = clean(await translator({ section_id, text: prompt, language: "en" }))
    } catch (error) {
      reason = `request failed: ${error instanceof Error ? error.message : String(error)}`
      // A dropped socket needs a moment before the next request; an echoed translation does not.
      if (attempt + 1 < MAX_ATTEMPTS)
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)))
      continue
    }
    const invalid = validate(value)
    if (!invalid) return { value }
    reason = invalid
  }
  if (process.env.PAPERCODE_DEBUG_TRANSLATE) console.error(`[translate] rejected ${section_id}: ${reason}`)
  return { reason }
}

/** Titles come back with Markdown hashes or quotes often enough to normalize them. */
function cleanTitle(value: string) {
  return stripFence(value)
    .replace(/^#{1,6}\s*/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    // Models sometimes return "Reproducibility（可复现性）"; the parenthetical is not the title.
    .replace(/\s*[（(][^）)]*[\u4e00-\u9fff][^）)]*[）)]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.。]$/, "")
}

/** A model occasionally answers a heading request with commentary instead of a translation. */
function refusal(value: string) {
  return /^\s*(it looks like|please (paste|provide)|i'?m sorry|as an ai|i cannot|there'?s no manuscript)/i.test(value)
    ? "translation returned commentary instead of the text"
    : undefined
}

function commentaryTitle(value: string, maxWords: number) {
  if (refusal(value)) return "translation returned commentary instead of the text"
  if (/[.!?。！？]\s/.test(value)) return "translation returned commentary instead of the text"
  if (value.split(/\s+/).length > maxWords) return "translation returned commentary instead of the text"
  return undefined
}

function validatedEnglish(value: string, emptyReason: string, chineseReason: string) {
  if (value.length === 0) return emptyReason
  if (cjkRatio(value) > 0.02) return `${chineseReason}: ${value.slice(0, 80)}`
  return undefined
}

/** Translate Markdown headings inside kept-verbatim sections without touching citations or commands. */
async function translateHeadings(
  markdown: string,
  section_id: string,
  translator: Translator,
): Promise<{ markdown?: string; reason?: string }> {
  const lines = markdown.split("\n")
  const output: string[] = []
  for (const [index, line] of lines.entries()) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (!heading || cjkRatio(heading[2]!) <= 0.02) {
      output.push(line)
      continue
    }
    const result = await translateValidated(
      translator,
      `heading:${section_id}:${index}`,
      heading[2]!,
      (value) =>
        validatedEnglish(value, "empty heading translation", "heading still contains Chinese") ??
        commentaryTitle(value, 20),
      cleanTitle,
    )
    if (!result.value) return { reason: result.reason ?? "heading translation failed" }
    output.push(`${heading[1]} ${result.value}`)
  }
  return { markdown: output.join("\n") }
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
  let title: string | undefined
  if (cjkRatio(draft.title) > 0.02) {
    const result = await translateValidated(
      translator,
      "title",
      draft.title,
      (value) =>
        validatedEnglish(value, "empty translation", "translation still contains Chinese") ??
        commentaryTitle(value, 40),
      cleanTitle,
    )
    if (!result.value) return fail("title", result.reason ?? "empty translation")
    title = result.value
  }
  for (const sectionId of translatableSections(draft)) {
    const section = draft.sections.find((item) => item.section_id === sectionId)
    if (!section || section.markdown.trim().length === 0) continue
    // Already English: nothing to do (author-supplied overrides may cover some sections).
    if (cjkRatio(section.markdown) < 0.02) continue
    const result = await translateValidated(translator, sectionId, section.markdown, (value) => {
      const basic = validatedEnglish(value, "empty translation", "translation still contains Chinese")
      if (basic) return basic
      const comment = refusal(value)
      if (comment) return comment
      if (!structurePreserved(section.markdown, value))
        return "translation changed the table or image structure"
      if (!numbersPreserved(section.markdown, value)) return "translation changed or dropped a number"
      if (!commandsPreserved(section.markdown, value)) return "translation changed a command"
      if (!locatorsPreserved(section.markdown, value)) return "translation changed a URL or source path"
      return undefined
    })
    if (!result.value) return fail(sectionId, result.reason ?? "empty translation")
    let translatedTitle: string | undefined
    if (cjkRatio(section.title) > 0.02) {
      const titleResult = await translateValidated(
        translator,
        `section_title:${sectionId}`,
        section.title,
        (value) =>
          validatedEnglish(value, "empty section title translation", "section title still contains Chinese") ??
          commentaryTitle(value, 20),
        cleanTitle,
      )
      if (!titleResult.value) return fail(sectionId, titleResult.reason ?? "empty section title translation")
      translatedTitle = titleResult.value
    }
    overrides.push({
      section_id: sectionId,
      markdown: result.value,
      ...(translatedTitle ? { title: translatedTitle } : {}),
    })
  }
  // References and appendices keep their bodies (citations, commands) but their headings should not
  // stay Chinese in an English manuscript; translate the section title and Markdown headings only.
  const translated = new Set(translatableSections(draft))
  for (const section of draft.sections) {
    if (translated.has(section.section_id)) continue
    const titleResult =
      cjkRatio(section.title) > 0.02
        ? await translateValidated(
            translator,
            `section_title:${section.section_id}`,
            section.title,
            (value) =>
              validatedEnglish(value, "empty section title translation", "section title still contains Chinese") ??
              commentaryTitle(value, 20),
            cleanTitle,
          )
        : { value: section.title }
    if (!titleResult.value) return fail(section.section_id, titleResult.reason ?? "empty section title translation")
    let markdown = section.markdown
    // Appendix prose is part of the manuscript, so translate it; references are citations and stay
    // verbatim. Both keep their commands and paths, which the validator checks.
    if (section.section_id.startsWith("appendix_") && cjkRatio(section.markdown) >= 0.02) {
      const body = await translateValidated(translator, section.section_id, section.markdown, (value) => {
        const basic = validatedEnglish(value, "empty translation", "translation still contains Chinese")
        if (basic) return basic
        const comment = refusal(value)
        if (comment) return comment
        if (!structurePreserved(section.markdown, value))
          return "translation changed the table or image structure"
        if (!numbersPreserved(section.markdown, value)) return "translation changed or dropped a number"
        if (!commandsPreserved(section.markdown, value)) return "translation changed a command or path"
        if (!locatorsPreserved(section.markdown, value)) return "translation changed a URL or source path"
        return undefined
      })
      if (!body.value) return fail(section.section_id, body.reason ?? "empty translation")
      markdown = body.value
    } else {
      const headings = await translateHeadings(section.markdown, section.section_id, translator)
      if (headings.markdown === undefined)
        return fail(section.section_id, headings.reason ?? "heading translation failed")
      markdown = headings.markdown
    }
    overrides.push({ section_id: section.section_id, markdown, title: titleResult.value })
  }
  if (overrides.length === 0 && !title) return undefined
  return { overrides, ...(title ? { title } : {}) }
}
