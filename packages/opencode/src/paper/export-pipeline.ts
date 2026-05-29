import { createHash } from "crypto"
import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"
import { discoverInitTools, type InitToolName } from "./init/discovery"
import type { ResearchFinalGateState, ResearchRuntimeOptions } from "./research/runtime"
import type { DraftPaper } from "./research/writing"
import { exportMarkdown } from "./research/export/bundle"
import type { ExportBundle, ExportFile, ExportFormat, ExportManifest, ExportRenderer } from "./research/export"
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
  timeout_ms?: number
}

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
  const process = Bun.spawn([input.tool, ...input.args], {
    cwd: input.cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  return {
    exit_code: exitCode,
    stdout,
    stderr,
  }
}

function discoveredTools(explicit?: PaperExportToolPaths): PaperExportToolPaths {
  if (explicit) return explicit
  const report = discoverInitTools()
  return Object.fromEntries(
    (["pandoc", "latexmk", "xelatex", "pdflatex", "lualatex", "tectonic"] as PaperExportToolName[])
      .map((name) => [name, report.tools[name].status === "available" ? report.tools[name].path : undefined])
      .filter((entry): entry is [PaperExportToolName, string] => typeof entry[1] === "string"),
  )
}

function latexEngines(tools: PaperExportToolPaths) {
  return (["latexmk", "xelatex", "pdflatex", "lualatex", "tectonic"] as PaperExportToolName[])
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
  if (engine === "latexmk") return ["-pdf", "-interaction=nonstopmode", `-outdir=${latexCwd}`, latexTexPath]
  if (engine === "tectonic") return ["--outdir", latexCwd, latexTexPath]
  return ["-interaction=nonstopmode", `-output-directory=${latexCwd}`, latexTexPath]
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
      "pandoc not available for Markdown to LaTeX conversion. Run `paper_fucker init` or set PAPER_FUCKER_TOOL_PANDOC.",
    ])
  }
  const markdownPath = outputFile(input.runDir, input.bundleID, "markdown")
  const latexPath = outputFile(input.runDir, input.bundleID, "latex")
  return commandFile({
    command: input.command,
    tool: pandoc,
    args: [markdownPath, "-s", "-t", "latex", "-o", latexPath],
    cwd: outputDir(input.runDir, input.bundleID),
    output: latexPath,
    format: "latex",
    bundleID: input.bundleID,
    runDir: input.runDir,
    missingDiagnostic: "pandoc did not produce LaTeX output.",
  })
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
      "LaTeX engine not available for PDF rendering. Install latexmk, tectonic, xelatex, pdflatex, or lualatex, then run `paper_fucker init`.",
    ])
  }
  const cwd = outputDir(input.runDir, input.bundleID)
  const texPath = outputFile(input.runDir, input.bundleID, "latex")
  const pdfPath = outputFile(input.runDir, input.bundleID, "pdf")
  const diagnostics: string[] = []
  for (const engine of engines) {
    const result = await input.command({ tool: engine.path, args: pdfArgs(engine.name, cwd, texPath), cwd })
    if (result.exit_code !== 0) {
      diagnostics.push(
        `${engine.name} failed with exit code ${result.exit_code}. ${
          result.stderr || result.stdout || `${engine.name} did not produce PDF output.`
        }`.trim(),
      )
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
      diagnostics: [],
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
      "pandoc not available for Markdown to DOCX conversion. Run `paper_fucker init` or set PAPER_FUCKER_TOOL_PANDOC.",
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
  const tools = discoveredTools(input.tools)
  const command = input.command ?? defaultCommand
  const markdown = exportMarkdown(input.draft, input.mode === "forced_draft" ? failedChecks : [])
  const outputName = input.bundle_id

  const markdownFile = await renderMarkdown(runDir, input.bundle_id, markdown)
  const latexFile = await renderLatex({
    runDir,
    bundleID: input.bundle_id,
    draft: input.draft,
    markdown,
    outputName,
    tools,
    command,
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
        span_name: `paper_fucker.export.${file.format}`,
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
