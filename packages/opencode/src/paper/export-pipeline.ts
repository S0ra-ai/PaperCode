import { createHash } from "crypto"
import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"
import { Process } from "@/util/process"
import { discoverInitTools, type InitToolName } from "./init/discovery"
import { initPaths, loadToolLinks } from "./init/config"
import type { ResearchFinalGateState, ResearchRuntimeOptions } from "./research/runtime"
import type { DraftPaper } from "./research/writing"
import { exportMarkdown } from "./research/export/bundle"
import type { ExportBundle, ExportFile, ExportFormat, ExportManifest, ExportRenderer, PaperFigureSpec } from "./research/export"
import { renderMetricChartPng } from "./research/export/figure"
import { recordPaperObservabilityAudit } from "./observability"

export type PaperExportToolName = Extract<
  InitToolName,
  "pandoc" | "latexmk" | "xelatex" | "pdflatex" | "lualatex" | "tectonic"
>

export type PaperExportToolPaths = Partial<Record<PaperExportToolName, string>>

export interface PaperExportCommandInput {
  tool: string
  args: string[]
  cwd: string
  /** Wall-clock budget for the command. Rendering (pandoc, TeX engines) is unbounded otherwise. */
  timeout_ms?: number
}

/** Rendering a paper through pandoc and a TeX engine is slow but not open-ended. */
const EXPORT_COMMAND_TIMEOUT_MS = 300_000

/** How much of a failed renderer's stderr is kept in a diagnostic; a TeX run can emit megabytes. */
const DIAGNOSTIC_EXCERPT_LIMIT = 400

export interface PaperExportCommandResult {
  exit_code: number
  stdout: string
  stderr: string
}

export type PaperExportCommandRunner = (input: PaperExportCommandInput) => Promise<PaperExportCommandResult>

export interface RenderPaperExportPipelineInput {
  mode: "final" | "forced_draft"
  bundle_id: string
  draft: DraftPaper
  final_gate: ResearchFinalGateState
  source_artifact_ids: string[]
  renderers?: ExportRenderer
  tools?: PaperExportToolPaths
  command?: PaperExportCommandRunner
  fonts?: PaperExportFonts
  /** Rendered next to the bundle as figures/primary-metric.png; the draft markdown references it. */
  figure?: PaperFigureSpec
  now?: string
}

export interface RenderPaperExportPipelineResult {
  bundle: ExportBundle
  manifest_path: string
}

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

function formatValidationDiagnostic(format: ExportFormat, bytes: Uint8Array) {
  if (bytes.byteLength === 0) return `${format.toUpperCase()} renderer output is empty.`
  if (format === "pdf") {
    const header = new TextDecoder().decode(bytes.slice(0, 5))
    if (header !== "%PDF-") return "PDF renderer output is not a valid PDF file header."
  }
  if (format === "docx") {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return "DOCX renderer output is not a valid ZIP/DOCX file header."
  }
  return undefined
}

function nowIso(options?: ResearchRuntimeOptions, override?: string) {
  return override ?? (options?.clock?.() ?? new Date()).toISOString()
}

function outputDir(runDir: string, bundleID: string) {
  return path.join(runDir, "exports", bundleID)
}

function relativeExportPath(bundleID: string, file: string) {
  return path.posix.join("exports", bundleID, file)
}

function outputFile(runDir: string, bundleID: string, format: ExportFormat) {
  return path.join(outputDir(runDir, bundleID), `${bundleID}.${EXT[format]}`)
}

async function defaultCommand(input: PaperExportCommandInput): Promise<PaperExportCommandResult> {
  const timeout = input.timeout_ms ?? EXPORT_COMMAND_TIMEOUT_MS
  const controller = new AbortController()
  const timer = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : undefined
  try {
    const out = await Process.run([input.tool, ...input.args], {
      cwd: input.cwd,
      abort: controller.signal,
      nothrow: true,
    })
    const stderr = out.stderr.toString()
    return {
      exit_code: out.code,
      stdout: out.stdout.toString(),
      stderr: controller.signal.aborted
        ? `${stderr}\n${input.tool} exceeded its ${timeout}ms budget and was terminated`.trim()
        : stderr,
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function discoveredTools(explicit?: PaperExportToolPaths, home?: string): Promise<PaperExportToolPaths> {
  if (explicit) return explicit
  const report = discoverInitTools(await loadToolLinks(initPaths(home)))
  return Object.fromEntries(
    (["pandoc", "latexmk", "xelatex", "pdflatex", "lualatex", "tectonic"] as PaperExportToolName[])
      .map((name) => [name, report.tools[name].status === "available" ? report.tools[name].path : undefined])
      .filter((entry): entry is [PaperExportToolName, string] => typeof entry[1] === "string"),
  )
}

function latexEngines(tools: PaperExportToolPaths) {
  return (["xelatex", "lualatex", "latexmk", "tectonic", "pdflatex"] as PaperExportToolName[])
    .map((name) => ({ name, path: tools[name] }))
    .filter((item): item is { name: PaperExportToolName; path: string } => Boolean(item.path))
}

function failedFile(bundleID: string, format: ExportFormat, diagnostics: string[]): ExportFile {
  const bytes = new Uint8Array()
  return {
    format,
    path: relativeExportPath(bundleID, `${bundleID}.${EXT[format]}`),
    mime_type: MIME[format],
    sha256: sha256(bytes),
    bytes: 0,
    status: "failed",
    diagnostics,
  }
}

async function writtenFile(input: {
  runDir: string
  bundleID: string
  format: ExportFormat
  bytes: Uint8Array
  diagnostics?: string[]
}): Promise<ExportFile> {
  const validationDiagnostic = formatValidationDiagnostic(input.format, input.bytes)
  if (validationDiagnostic) return failedFile(input.bundleID, input.format, [...(input.diagnostics ?? []), validationDiagnostic])
  const absolute = outputFile(input.runDir, input.bundleID, input.format)
  await mkdir(path.dirname(absolute), { recursive: true })
  await writeFile(absolute, Buffer.from(input.bytes))
  return {
    format: input.format,
    path: relativeExportPath(input.bundleID, `${input.bundleID}.${EXT[input.format]}`),
    mime_type: MIME[input.format],
    sha256: sha256(input.bytes),
    bytes: input.bytes.byteLength,
    status: "written",
    diagnostics: input.diagnostics ?? [],
    preview: input.format === "markdown" ? new TextDecoder().decode(input.bytes).slice(0, 400) : undefined,
  }
}

async function commandFile(input: {
  command: PaperExportCommandRunner
  tool: string
  args: string[]
  cwd: string
  output: string
  format: ExportFormat
  bundleID: string
  runDir: string
  missingDiagnostic: string
}) {
  const result = await input.command({ tool: input.tool, args: input.args, cwd: input.cwd })
  if (result.exit_code !== 0) {
    return failedFile(input.bundleID, input.format, [
      `${input.tool} failed with exit code ${result.exit_code}. ${result.stderr || result.stdout || input.missingDiagnostic}`.trim(),
    ])
  }
  const exists = await Bun.file(input.output).exists()
  if (!exists) return failedFile(input.bundleID, input.format, [`${input.tool} did not create ${path.basename(input.output)}.`])
  return writtenFile({
    runDir: input.runDir,
    bundleID: input.bundleID,
    format: input.format,
    bytes: new Uint8Array(await readFile(input.output)),
  })
}

function latexCliPath(value: string) {
  return value.replace(/\\/g, "/")
}

function pdfArgs(engine: PaperExportToolName, cwd: string, texPath: string) {
  const latexCwd = latexCliPath(cwd)
  const latexTexPath = latexCliPath(texPath)
  if (engine === "latexmk") return ["-xelatex", "-interaction=nonstopmode", `-outdir=${latexCwd}`, latexTexPath]
  if (engine === "tectonic") return ["--outdir", latexCwd, latexTexPath]
  return ["-interaction=nonstopmode", `-output-directory=${latexCwd}`, latexTexPath]
}

/** Han, kana, hangul, CJK punctuation and fullwidth forms all need a CJK-capable font. */
function hasCjk(value: string) {
  return /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/.test(value)
}

/**
 * Fonts for the LaTeX step. Naming one overrides the font set ctex already picks for the platform on
 * its own (Songti/STSong on macOS, SimSun/SinHei on Windows, Fandol - shipped with TeX Live - on
 * Linux), and whatever is named has to exist on the machine. Naming SimSun unconditionally is what
 * broke PDF export off Windows: xelatex aborts on a font it cannot find, after a kpathsea mktextfm
 * flood, and no PDF is written.
 */
export interface PaperExportFonts {
  cjk?: string
  latin?: string
}

/** A caller names a font through the pipeline input or PAPERCODE_EXPORT_{CJK,LATIN}_FONT; otherwise ctex decides. */
export function exportFonts(
  env: Record<string, string | undefined> = process.env,
  override?: PaperExportFonts,
): PaperExportFonts {
  const cjk = override?.cjk?.trim() || env.PAPERCODE_EXPORT_CJK_FONT?.trim()
  const latin = override?.latin?.trim() || env.PAPERCODE_EXPORT_LATIN_FONT?.trim()
  return { ...(cjk ? { cjk } : {}), ...(latin ? { latin } : {}) }
}

function fontArgs(fonts: PaperExportFonts) {
  const args: string[] = []
  if (fonts.cjk) args.push("-V", `CJKmainfont=${fonts.cjk}`)
  if (fonts.latin) args.push("-V", `mainfont=${fonts.latin}`)
  return args
}

function pandocLatexArgs(markdownPath: string, latexPath: string, markdown: string, fonts: PaperExportFonts) {
  const args = [markdownPath, "-s", "-t", "latex", "--wrap=none"]
  if (hasCjk(markdown)) {
    args.push(
      "-V",
      "documentclass=ctexart",
      "-V",
      "papersize=a4",
      "-V",
      "geometry:margin=25mm",
      "-V",
      "pagestyle=plain",
    )
  }
  // A named Latin font applies to any manuscript, not only to the ones that need ctex.
  args.push(...fontArgs(fonts))
  args.push("-o", latexPath)
  return args
}

async function renderMarkdown(runDir: string, bundleID: string, markdown: string) {
  return writtenFile({
    runDir,
    bundleID,
    format: "markdown",
    bytes: encode(markdown),
  })
}

async function renderLatex(input: {
  runDir: string
  bundleID: string
  draft: DraftPaper
  markdown: string
  outputName: string
  tools: PaperExportToolPaths
  command: PaperExportCommandRunner
  fonts: PaperExportFonts
  renderer?: ExportRenderer["latex"]
}) {
  if (input.renderer) {
    const result = await input.renderer({
      draft: input.draft,
      markdown: input.markdown,
      latex: "",
      output_name: input.outputName,
    })
    if (result.status === "written") {
      return writtenFile({
        runDir: input.runDir,
        bundleID: input.bundleID,
        format: "latex",
        bytes: result.bytes,
        diagnostics: result.diagnostics,
      })
    }
    return failedFile(input.bundleID, "latex", result.diagnostics)
  }
  const pandoc = input.tools.pandoc
  if (!pandoc) {
    return failedFile(input.bundleID, "latex", [
      "Pandoc 不可用，无法将 Markdown 转为 LaTeX。请运行 `papercode init` 修复导出工具链。",
    ])
  }
  const markdownPath = outputFile(input.runDir, input.bundleID, "markdown")
  const latexPath = outputFile(input.runDir, input.bundleID, "latex")
  return commandFile({
    command: input.command,
    tool: pandoc,
    args: pandocLatexArgs(markdownPath, latexPath, input.markdown, input.fonts),
    cwd: outputDir(input.runDir, input.bundleID),
    output: latexPath,
    format: "latex",
    bundleID: input.bundleID,
    runDir: input.runDir,
    missingDiagnostic: "pandoc did not produce LaTeX output.",
  })
}

/**
 * xelatex reports the cause on stdout as a line starting with "!", followed by the offending source
 * line ("l.28 \setCJKmainfont"). Both matter: the message names the problem, the location says which
 * line of the generated .tex produced it.
 */
function texErrorExcerpt(stdout: string) {
  const lines = stdout.split("\n")
  const index = lines.findIndex((line) => line.startsWith("!"))
  if (index === -1) return undefined
  const parts = [lines[index].trim()]
  const continuation = lines[index + 1]?.trim()
  if (continuation && !continuation.startsWith("!")) parts.push(continuation)
  const location = lines
    .slice(index, index + 6)
    .map((line) => line.trim())
    .find((line) => /^l\.\d+/.test(line))
  if (location) parts.push(location)
  return parts.join(" ")
}

const CJK_FONT_HINT =
  "字体缺失：ctex 会自行按平台选字体，若通过 PAPERCODE_EXPORT_CJK_FONT / PAPERCODE_EXPORT_LATIN_FONT 指定了字体，请确认该字体已安装。"

/**
 * A failed TeX run dumps a kpathsea/mktextfm flood on stderr that buries the actual cause, which
 * xelatex prints on stdout. Lead with that line, keep only an excerpt of stderr, and spell out the
 * font case - the one the user can act on.
 */
function latexFailureDiagnostic(engine: string, result: PaperExportCommandResult) {
  const error = texErrorExcerpt(result.stdout)
  // kpathsea floods stderr; when it is empty the engine's own output is the only context left.
  const stderr = result.stderr.trim()
  const context = stderr || result.stdout.trim()
  const parts = [`${engine} failed with exit code ${result.exit_code}.`]
  if (error) parts.push(error)
  if (context) parts.push(`${stderr ? "stderr" : "output"}: ${context.slice(-DIAGNOSTIC_EXCERPT_LIMIT)}`)
  if (!error && !context) parts.push(`${engine} did not produce PDF output.`)
  if (error && /font/i.test(error)) parts.push(CJK_FONT_HINT)
  return parts.join(" ")
}

/** How many distinct missing characters a diagnostic names before it only counts the rest. */
const MISSING_GLYPH_LIMIT = 5

/**
 * TeX drops characters it has no font for and still exits 0 - "Missing character: There is no X in
 * font Y" goes to the log and nowhere else. ctex resolves a Chinese font set, so a manuscript that
 * quotes Japanese, Korean or a rare Han character loses those glyphs while the export reports
 * success; the log is the only record.
 */
async function missingGlyphDiagnostics(texPath: string) {
  const log = Bun.file(`${texPath.replace(/\.tex$/, "")}.log`)
  if (!(await log.exists())) return []
  const missing = new Map<string, string>()
  for (const line of (await log.text()).split("\n")) {
    const match = line.trim().match(/^Missing character: There is no (.+?) in font (.+?)!$/)
    if (match) missing.set(match[1].trim(), match[2].trim())
  }
  if (missing.size === 0) return []
  const listed = [...missing].slice(0, MISSING_GLYPH_LIMIT).map(([glyph, font]) => `${glyph}（字体 ${font}）`)
  const rest = missing.size > MISSING_GLYPH_LIMIT ? `，以及其余 ${missing.size - MISSING_GLYPH_LIMIT} 个字符` : ""
  return [
    `PDF 已生成，但有字符没有对应字体、被渲染为空白：${listed.join("，")}${rest}。可用 PAPERCODE_EXPORT_CJK_FONT 指定覆盖该语种的字体后重新导出。`,
  ]
}

async function renderPdf(input: {
  runDir: string
  bundleID: string
  draft: DraftPaper
  markdown: string
  latexFile: ExportFile
  outputName: string
  tools: PaperExportToolPaths
  command: PaperExportCommandRunner
  renderer?: ExportRenderer["pdf"]
}) {
  const latexText =
    input.latexFile.status === "written" ? await readFile(path.join(input.runDir, input.latexFile.path), "utf8") : ""
  if (input.renderer) {
    const result = await input.renderer({
      draft: input.draft,
      markdown: input.markdown,
      latex: latexText,
      output_name: input.outputName,
    })
    if (result.status === "written") {
      return writtenFile({
        runDir: input.runDir,
        bundleID: input.bundleID,
        format: "pdf",
        bytes: result.bytes,
        diagnostics: result.diagnostics,
      })
    }
    return failedFile(input.bundleID, "pdf", result.diagnostics)
  }
  if (input.latexFile.status !== "written") {
    return failedFile(input.bundleID, "pdf", ["LaTeX source unavailable; install pandoc or provide a LaTeX renderer."])
  }
  const engines = latexEngines(input.tools)
  if (engines.length === 0) {
    return failedFile(input.bundleID, "pdf", [
      "LaTeX 引擎不可用，无法渲染 PDF。请安装 latexmk、tectonic、xelatex、pdflatex 或 lualatex 后运行 `papercode init`。",
    ])
  }
  const cwd = outputDir(input.runDir, input.bundleID)
  const texPath = outputFile(input.runDir, input.bundleID, "latex")
  const pdfPath = outputFile(input.runDir, input.bundleID, "pdf")
  const diagnostics: string[] = []
  for (const engine of engines) {
    const result = await input.command({ tool: engine.path, args: pdfArgs(engine.name, cwd, texPath), cwd })
    if (result.exit_code !== 0) {
      diagnostics.push(latexFailureDiagnostic(engine.name, result))
      continue
    }
    const exists = await Bun.file(pdfPath).exists()
    if (!exists) {
      diagnostics.push(`${engine.name} did not create ${path.basename(pdfPath)}.`)
      continue
    }
    return writtenFile({
      runDir: input.runDir,
      bundleID: input.bundleID,
      format: "pdf",
      bytes: new Uint8Array(await readFile(pdfPath)),
      diagnostics: await missingGlyphDiagnostics(texPath),
    })
  }
  return failedFile(input.bundleID, "pdf", diagnostics.length > 0 ? diagnostics : ["No LaTeX engine produced PDF output."])
}

async function renderDocx(input: {
  runDir: string
  bundleID: string
  draft: DraftPaper
  markdown: string
  outputName: string
  tools: PaperExportToolPaths
  command: PaperExportCommandRunner
  renderer?: ExportRenderer["docx"]
}) {
  if (input.renderer) {
    const result = await input.renderer({
      draft: input.draft,
      markdown: input.markdown,
      latex: "",
      output_name: input.outputName,
    })
    if (result.status === "written") {
      return writtenFile({
        runDir: input.runDir,
        bundleID: input.bundleID,
        format: "docx",
        bytes: result.bytes,
        diagnostics: result.diagnostics,
      })
    }
    return failedFile(input.bundleID, "docx", result.diagnostics)
  }
  const pandoc = input.tools.pandoc
  if (!pandoc) {
    return failedFile(input.bundleID, "docx", [
      "Pandoc 不可用，无法将 Markdown 转为 DOCX。请运行 `papercode init` 修复导出工具链。",
    ])
  }
  const markdownPath = outputFile(input.runDir, input.bundleID, "markdown")
  const docxPath = outputFile(input.runDir, input.bundleID, "docx")
  return commandFile({
    command: input.command,
    tool: pandoc,
    args: [markdownPath, "-o", docxPath],
    cwd: outputDir(input.runDir, input.bundleID),
    output: docxPath,
    format: "docx",
    bundleID: input.bundleID,
    runDir: input.runDir,
    missingDiagnostic: "pandoc did not produce DOCX output.",
  })
}

function toolDiagnostics(files: ExportFile[]) {
  return files.flatMap((file) => file.diagnostics.map((diagnostic) => `${file.format}: ${diagnostic}`))
}

async function writeManifest(runDir: string, bundleID: string, manifest: ExportManifest) {
  const relative = relativeExportPath(bundleID, "manifest.json")
  const absolute = path.join(runDir, relative)
  await mkdir(path.dirname(absolute), { recursive: true })
  await writeFile(absolute, `${JSON.stringify(manifest, null, 2)}\n`)
  return relative
}

export async function renderPaperExportPipeline(
  runDir: string,
  input: RenderPaperExportPipelineInput,
  options?: ResearchRuntimeOptions,
): Promise<RenderPaperExportPipelineResult> {
  const createdAt = nowIso(options, input.now)
  const failedChecks = input.final_gate.status === "passed" ? [] : input.final_gate.blockers
  const tools = await discoveredTools(input.tools, options?.home)
  const command = input.command ?? defaultCommand
  const markdown = exportMarkdown(input.draft, input.mode === "forced_draft" ? failedChecks : [])
  const outputName = input.bundle_id
  const fonts = exportFonts(process.env, input.fonts)
  if (input.figure) {
    const figures = path.join(outputDir(runDir, input.bundle_id), "figures")
    await mkdir(figures, { recursive: true })
    await writeFile(path.join(figures, "primary-metric.png"), renderMetricChartPng(input.figure))
  }

  const markdownFile = await renderMarkdown(runDir, input.bundle_id, markdown)
  const latexFile = await renderLatex({
    runDir,
    bundleID: input.bundle_id,
    draft: input.draft,
    markdown,
    outputName,
    tools,
    command,
    fonts,
    renderer: input.renderers?.latex,
  })
  const pdfFile = await renderPdf({
    runDir,
    bundleID: input.bundle_id,
    draft: input.draft,
    markdown,
    latexFile,
    outputName,
    tools,
    command,
    renderer: input.renderers?.pdf,
  })
  const docxFile = await renderDocx({
    runDir,
    bundleID: input.bundle_id,
    draft: input.draft,
    markdown,
    outputName,
    tools,
    command,
    renderer: input.renderers?.docx,
  })
  const files = [markdownFile, latexFile, pdfFile, docxFile]
  for (const file of files) {
    await recordPaperObservabilityAudit(
      runDir,
      {
        kind: "export_renderer",
        name: file.format,
        status: file.status === "written" ? "succeeded" : "failed",
        span_name: `papercode.export.${file.format}`,
        attributes: {
          path: file.path,
          bytes: file.bytes,
          diagnostics: file.diagnostics,
        },
      },
      options,
    )
  }
  const manifest: ExportManifest = {
    schema_version: "PaperExportManifest.v1",
    bundle_id: input.bundle_id,
    status: input.mode,
    final_gate_status: input.final_gate.status,
    forced: input.mode === "forced_draft",
    failed_checks: failedChecks,
    path: relativeExportPath(input.bundle_id, "manifest.json"),
    files: files.map((file) => ({
      format: file.format,
      path: file.path,
      sha256: file.sha256,
      bytes: file.bytes,
      status: file.status,
    })),
    source_artifact_ids: input.source_artifact_ids,
    tool_diagnostics: toolDiagnostics(files),
  }
  const manifestPath = await writeManifest(runDir, input.bundle_id, manifest)
  const bundle: ExportBundle = {
    schema_version: "ExportBundle.v1",
    bundle_id: input.bundle_id,
    created_at: createdAt,
    status: input.mode,
    draft_id: input.draft.draft_id,
    final_gate: input.final_gate,
    verification_summary: {
      final_gate_status: input.final_gate.status,
      failed_checks: failedChecks,
      forced: input.mode === "forced_draft",
    },
    files,
    manifest: {
      ...manifest,
      path: manifestPath,
    },
  }
  return {
    bundle,
    manifest_path: manifestPath,
  }
}
