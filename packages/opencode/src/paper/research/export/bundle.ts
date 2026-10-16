import { createHash } from "crypto"
import { mkdir } from "fs/promises"
import path from "path"
import type { DraftPaper } from "../writing"
import type { ExportFile, ExportFormat, ExportRenderer, ExportRenderResult } from "./schemas"

const MIME: Record<ExportFormat, string> = {
  markdown: "text/markdown",
  latex: "text/x-tex",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

const EXT: Record<ExportFormat, string> = {
  markdown: "md",
  latex: "tex",
  pdf: "pdf",
  docx: "docx",
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}

function encode(text: string) {
  return new TextEncoder().encode(text)
}

function outputName(draft: DraftPaper) {
  return draft.draft_id.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "paper"
}

function latexFallback(markdown: string) {
  return `\\section*{PaperCode Export}\n\\begin{verbatim}\n${markdown}\n\\end{verbatim}\n`
}

export function exportMarkdown(draft: DraftPaper, forcedChecks: string[]) {
  if (forcedChecks.length === 0) return draft.markdown
  return [
    "> FORCED DRAFT - NOT FINAL",
    "> Failed checks: " + forcedChecks.join(", "),
    "",
    draft.markdown,
  ].join("\n")
}

async function writeFile(
  runDir: string,
  bundleId: string,
  format: ExportFormat,
  result: ExportRenderResult,
): Promise<ExportFile> {
  const relativePath = path.posix.join("exports", bundleId, `${bundleId}.${EXT[format]}`)
  const absolutePath = path.join(runDir, relativePath)
  await mkdir(path.dirname(absolutePath), { recursive: true })
  if (result.status === "written") await Bun.write(absolutePath, result.bytes)
  return {
    format,
    path: relativePath,
    mime_type: MIME[format],
    sha256: sha256(result.bytes),
    bytes: result.bytes.byteLength,
    status: result.status,
    diagnostics: result.diagnostics,
    preview: format === "markdown" ? new TextDecoder().decode(result.bytes).slice(0, 400) : undefined,
  }
}

async function renderFormat(input: {
  format: ExportFormat
  draft: DraftPaper
  markdown: string
  latex: string
  output_name: string
  renderers?: ExportRenderer
}): Promise<ExportRenderResult> {
  if (input.format === "markdown") return { status: "written", bytes: encode(input.markdown), diagnostics: [] }
  if (input.format === "latex") {
    const renderer = input.renderers?.latex
    if (renderer) return renderer({ draft: input.draft, markdown: input.markdown, latex: input.latex, output_name: input.output_name })
    return { status: "written", bytes: encode(input.latex), diagnostics: ["latex generated with internal fallback renderer"] }
  }
  const renderer = input.renderers?.[input.format]
  if (renderer) return renderer({ draft: input.draft, markdown: input.markdown, latex: input.latex, output_name: input.output_name })
  return {
    status: "failed",
    bytes: new Uint8Array(),
    diagnostics: [`missing external renderer: ${input.format}`],
  }
}

export async function buildExportFiles(input: {
  runDir: string
  bundleId: string
  draft: DraftPaper
  forcedChecks: string[]
  renderers?: ExportRenderer
}) {
  const output = outputName(input.draft)
  const markdown = exportMarkdown(input.draft, input.forcedChecks)
  const latex = latexFallback(markdown)
  const files: ExportFile[] = []
  for (const format of ["markdown", "latex", "pdf", "docx"] as ExportFormat[]) {
    const result = await renderFormat({
      format,
      draft: input.draft,
      markdown,
      latex,
      output_name: output,
      renderers: input.renderers,
    })
    files.push(await writeFile(input.runDir, input.bundleId, format, result))
  }
  return files
}
