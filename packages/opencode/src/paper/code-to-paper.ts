import { readdir, readFile, stat } from "fs/promises"
import path from "path"
import { appendResearchEvent, writeResearchArtifact, type ResearchRuntimeOptions } from "./research/runtime"
import type { ResearchArtifact } from "./research/contracts"

export interface SourceRange {
  path: string
  start_line: number
  end_line: number
}

export interface CodebaseMap {
  schema_version: "CodebaseMap.v1"
  files: Array<{
    path: string
    language: string
    line_count: number
    role: "source" | "test" | "config"
    source_range: SourceRange
  }>
}

export interface MethodExtraction {
  schema_version: "MethodExtraction.v1"
  methods: Array<{
    name: string
    kind: "function" | "class"
    summary: string
    source_range: SourceRange
  }>
}

export interface ExperimentSurface {
  schema_version: "ExperimentSurface.v1"
  tests: Array<{
    path: string
    framework: string
    source_range: SourceRange
  }>
  runnable_entries: Array<{
    name: string
    command: string
    source_range: SourceRange
  }>
}

export interface ReproductionPlan {
  schema_version: "ReproductionPlan.v1"
  steps: Array<{
    title: string
    command: string
    source_range: SourceRange
  }>
}

export interface CodeToPaperAnalysis {
  codebase_map: CodebaseMap
  method_extraction: MethodExtraction
  experiment_surface: ExperimentSurface
  reproduction_plan: ReproductionPlan
}

export interface AnalyzeCodebaseForPaperInput {
  workspace_path: string
  code_paths: string[]
}

function toPosix(input: string) {
  return input.replace(/\\/g, "/")
}

function languageFor(file: string) {
  const ext = path.extname(file).toLowerCase()
  if (ext === ".ts" || ext === ".tsx") return "typescript"
  if (ext === ".js" || ext === ".jsx") return "javascript"
  if (ext === ".py") return "python"
  if (ext === ".json") return "json"
  if (ext === ".md") return "markdown"
  return ext.slice(1) || "text"
}

function roleFor(file: string): "source" | "test" | "config" {
  const normalized = toPosix(file)
  if (normalized.includes("/test/") || /\.test\.[tj]sx?$/.test(normalized) || /\.spec\.[tj]sx?$/.test(normalized)) return "test"
  if (path.basename(file) === "package.json" || path.basename(file).startsWith("tsconfig")) return "config"
  return "source"
}

async function collectFiles(root: string, relativeInput: string): Promise<string[]> {
  const absolute = path.join(root, relativeInput)
  const item = await stat(absolute)
  if (item.isFile()) return [toPosix(relativeInput)]
  const entries = await readdir(absolute, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue
    const child = toPosix(path.posix.join(toPosix(relativeInput), entry.name))
    if (entry.isDirectory()) files.push(...(await collectFiles(root, child)))
    else if (entry.isFile()) files.push(child)
  }
  return files
}

function closingBraceLine(lines: string[], startIndex: number) {
  let balance = 0
  for (let index = startIndex; index < lines.length; index++) {
    const line = lines[index] ?? ""
    balance += (line.match(/{/g) ?? []).length
    balance -= (line.match(/}/g) ?? []).length
    if (balance <= 0 && index > startIndex) return index + 1
  }
  return startIndex + 1
}

function extractMethods(file: string, text: string): MethodExtraction["methods"] {
  const lines = text.split(/\r?\n/)
  const methods: MethodExtraction["methods"] = []
  lines.forEach((line, index) => {
    const functionMatch = line.match(/export\s+function\s+([A-Za-z0-9_]+)/)
    const classMatch = line.match(/export\s+class\s+([A-Za-z0-9_]+)/)
    const match = functionMatch ?? classMatch
    if (!match?.[1]) return
    const kind = functionMatch ? "function" : "class"
    methods.push({
      name: match[1],
      kind,
      summary: `${kind} ${match[1]} is exported from ${file}.`,
      source_range: {
        path: file,
        start_line: index + 1,
        end_line: closingBraceLine(lines, index),
      },
    })
  })
  return methods
}

async function packageScripts(root: string): Promise<ExperimentSurface["runnable_entries"]> {
  const packagePath = path.join(root, "package.json")
  const text = await readFile(packagePath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (!text) return []
  const parsed = JSON.parse(text) as { scripts?: Record<string, string> }
  const lines = text.split(/\r?\n/)
  return Object.entries(parsed.scripts ?? {}).map(([name, command]) => {
    const scriptLine = lines.findIndex((line) => line.includes(JSON.stringify(name)))
    return {
      name,
      command,
      source_range: {
        path: "package.json",
        start_line: scriptLine >= 0 ? scriptLine + 1 : 1,
        end_line: scriptLine >= 0 ? scriptLine + 1 : lines.length,
      },
    }
  })
}

export async function analyzeCodebaseForPaper(input: AnalyzeCodebaseForPaperInput): Promise<CodeToPaperAnalysis> {
  const workspace = path.resolve(input.workspace_path)
  const files = (await Promise.all(input.code_paths.map((codePath) => collectFiles(workspace, toPosix(codePath))))).flat().sort()
  const readable = await Promise.all(
    files.map(async (file) => ({
      path: file,
      text: await readFile(path.join(workspace, file), "utf8"),
    })),
  )

  const codebase_map: CodebaseMap = {
    schema_version: "CodebaseMap.v1",
    files: readable.map((file) => {
      const lineCount = file.text.split(/\r?\n/).length
      return {
        path: file.path,
        language: languageFor(file.path),
        line_count: lineCount,
        role: roleFor(file.path),
        source_range: { path: file.path, start_line: 1, end_line: lineCount },
      }
    }),
  }
  const runnableEntries = await packageScripts(workspace)
  const experiment_surface: ExperimentSurface = {
    schema_version: "ExperimentSurface.v1",
    tests: codebase_map.files
      .filter((file) => file.role === "test")
      .map((file) => ({
        path: file.path,
        framework: file.language === "typescript" ? "bun:test" : "unknown",
        source_range: file.source_range,
      })),
    runnable_entries: runnableEntries,
  }

  return {
    codebase_map,
    method_extraction: {
      schema_version: "MethodExtraction.v1",
      methods: readable.flatMap((file) => extractMethods(file.path, file.text)),
    },
    experiment_surface,
    reproduction_plan: {
      schema_version: "ReproductionPlan.v1",
      steps: runnableEntries.map((entry) => ({
        title: `Run ${entry.name}`,
        command: entry.command,
        source_range: entry.source_range,
      })),
    },
  }
}

export async function recordCodeToPaperArtifacts(
  runDir: string,
  analysis: CodeToPaperAnalysis,
  options?: ResearchRuntimeOptions,
): Promise<ResearchArtifact[]> {
  const artifacts: ResearchArtifact[] = []
  artifacts.push(
    await writeResearchArtifact(runDir, {
      kind: "log",
      logical_path: "code-to-paper/codebase-map.json",
      data: analysis.codebase_map,
      metadata: { artifact_schema: "CodebaseMap.v1" },
    }, options),
  )
  artifacts.push(
    await writeResearchArtifact(runDir, {
      kind: "log",
      logical_path: "code-to-paper/method-extraction.json",
      data: analysis.method_extraction,
      metadata: { artifact_schema: "MethodExtraction.v1" },
    }, options),
  )
  artifacts.push(
    await writeResearchArtifact(runDir, {
      kind: "log",
      logical_path: "code-to-paper/experiment-surface.json",
      data: analysis.experiment_surface,
      metadata: { artifact_schema: "ExperimentSurface.v1" },
    }, options),
  )
  artifacts.push(
    await writeResearchArtifact(runDir, {
      kind: "log",
      logical_path: "code-to-paper/reproduction-plan.json",
      data: analysis.reproduction_plan,
      metadata: { artifact_schema: "ReproductionPlan.v1" },
    }, options),
  )
  await appendResearchEvent(
    runDir,
    {
      type: "codetopaper.artifacts.created",
      actor: "system",
      payload: { artifact_ids: artifacts.map((artifact) => artifact.artifact_id) },
    },
    options,
  )
  return artifacts
}
