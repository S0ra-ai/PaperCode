import { createHash } from "crypto"
import { readdir, readFile, stat } from "fs/promises"
import path from "path"
import { RESEARCH_SCHEMA_VERSION, type ResearchSourceKind } from "./research/contracts"
import {
  appendResearchEvent,
  appendResearchFact,
  loadResearchRun,
  writeResearchArtifact,
  type ResearchRuntimeOptions,
} from "./research/runtime"

export type MaterialKind = "code" | "paper_file" | "dataset" | "experiment_log"
export type MaterialStatus = "indexed" | "skipped"
export type MaterialSkipReason =
  | "missing"
  | "outside_workspace"
  | "secret_like_path"
  | "ignored_path"
  | "binary_file"
  | "read_error"

export interface MaterialSourceRange {
  start_line: number
  end_line: number
}

export interface MaterialIndexItem {
  kind: MaterialKind
  path: string
  status: MaterialStatus
  reason?: MaterialSkipReason
  mime_type?: string
  bytes?: number
  sha256?: string
  source_id?: string
  source_range?: MaterialSourceRange
  text_preview?: string
}

export interface MaterialIndex {
  schema_version: "MaterialIndex.v1"
  workspace: string
  created_at: string
  items: MaterialIndexItem[]
  summary: {
    indexed: number
    skipped: number
    by_kind: Record<MaterialKind, number>
  }
}

export interface IndexResearchMaterialsInput {
  workspace_path: string
  code_paths?: string[]
  paper_files?: string[]
  dataset_paths?: string[]
  experiment_logs?: string[]
  now?: string
}

function nowIso(override?: string) {
  return override ?? new Date().toISOString()
}

function toPosix(input: string) {
  return input.replace(/\\/g, "/")
}

function normalizeRelative(input: string) {
  return toPosix(path.normalize(input)).replace(/^\.\//, "")
}

function sha256(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex")
}

function sourceId(kind: MaterialKind, relativePath: string) {
  return `material:${kind}:${sha256(relativePath).slice(0, 16)}`
}

function sourceKind(kind: MaterialKind): ResearchSourceKind {
  if (kind === "code") return "code"
  if (kind === "dataset") return "dataset"
  if (kind === "experiment_log") return "tool_output"
  return "user_note"
}

function mimeType(relativePath: string) {
  const ext = path.extname(relativePath).toLowerCase()
  if (ext === ".ts" || ext === ".tsx") return "text/typescript"
  if (ext === ".js" || ext === ".jsx") return "text/javascript"
  if (ext === ".py") return "text/x-python"
  if (ext === ".md") return "text/markdown"
  if (ext === ".tex") return "text/x-tex"
  if (ext === ".csv") return "text/csv"
  if (ext === ".json") return "application/json"
  if (ext === ".log" || ext === ".txt") return "text/plain"
  if (ext === ".pdf") return "application/pdf"
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  return "application/octet-stream"
}

function secretLike(relativePath: string) {
  const normalized = toPosix(relativePath).toLowerCase()
  const base = path.posix.basename(normalized)
  return base === ".env" || base.startsWith(".env.") || normalized.includes("secret") || normalized.includes("apikey")
}

function ignoredPath(relativePath: string) {
  const normalized = toPosix(relativePath)
  return normalized.includes("/.git/") || normalized.startsWith(".git/") || normalized.includes("/node_modules/") || normalized.startsWith("node_modules/")
}

function supportedBinary(relativePath: string) {
  const ext = path.extname(relativePath).toLowerCase()
  return ext === ".pdf" || ext === ".docx"
}

function looksBinary(bytes: Uint8Array, relativePath: string) {
  if (supportedBinary(relativePath)) return false
  return bytes.slice(0, Math.min(bytes.byteLength, 4096)).includes(0)
}

function sourceRange(text: string): MaterialSourceRange {
  return {
    start_line: 1,
    end_line: Math.max(1, text.split(/\r?\n/).filter((line, index, lines) => index < lines.length - 1 || line.length > 0).length),
  }
}

async function collectInputPaths(workspace: string, kind: MaterialKind, inputs: string[]) {
  const output: Array<{ kind: MaterialKind; relativePath: string }> = []
  for (const input of inputs) {
    const relative = normalizeRelative(input)
    const absolute = path.resolve(workspace, relative)
    const item = await stat(absolute).catch(() => undefined)
    if (!item) {
      output.push({ kind, relativePath: relative })
      continue
    }
    if (item.isFile()) {
      output.push({ kind, relativePath: relative })
      continue
    }
    if (!item.isDirectory()) continue
    const entries = await readdir(absolute, { withFileTypes: true })
    for (const entry of entries) {
      const child = normalizeRelative(path.posix.join(relative, entry.name))
      if (entry.isDirectory()) output.push(...(await collectInputPaths(workspace, kind, [child])))
      else if (entry.isFile()) output.push({ kind, relativePath: child })
    }
  }
  return output
}

async function indexOne(workspace: string, kind: MaterialKind, relativePath: string): Promise<MaterialIndexItem> {
  const normalized = normalizeRelative(relativePath)
  if (secretLike(normalized)) return { kind, path: normalized, status: "skipped", reason: "secret_like_path" }
  if (ignoredPath(normalized)) return { kind, path: normalized, status: "skipped", reason: "ignored_path" }

  const absolute = path.resolve(workspace, normalized)
  const workspaceRoot = path.resolve(workspace).toLowerCase()
  if (!absolute.toLowerCase().startsWith(workspaceRoot)) {
    return { kind, path: normalized, status: "skipped", reason: "outside_workspace" }
  }

  const bytes = await readFile(absolute).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (!bytes) return { kind, path: normalized, status: "skipped", reason: "missing" }
  if (looksBinary(bytes, normalized)) return { kind, path: normalized, status: "skipped", reason: "binary_file" }

  const mime = mimeType(normalized)
  const text = mime.startsWith("text/") || mime === "application/json" ? bytes.toString("utf8") : ""
  return {
    kind,
    path: normalized,
    status: "indexed",
    mime_type: mime,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    source_id: sourceId(kind, normalized),
    source_range: text ? sourceRange(text) : undefined,
    text_preview: text ? text.slice(0, 500) : undefined,
  }
}

export async function indexResearchMaterials(input: IndexResearchMaterialsInput): Promise<MaterialIndex> {
  const workspace = path.resolve(input.workspace_path)
  const candidates = (
    await Promise.all([
      collectInputPaths(workspace, "code", input.code_paths ?? []),
      collectInputPaths(workspace, "paper_file", input.paper_files ?? []),
      collectInputPaths(workspace, "dataset", input.dataset_paths ?? []),
      collectInputPaths(workspace, "experiment_log", input.experiment_logs ?? []),
    ])
  ).flat()
  const seen = new Set<string>()
  const items: MaterialIndexItem[] = []
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.relativePath}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push(await indexOne(workspace, candidate.kind, candidate.relativePath))
  }
  const byKind = {
    code: 0,
    paper_file: 0,
    dataset: 0,
    experiment_log: 0,
  } satisfies Record<MaterialKind, number>
  for (const item of items.filter((item) => item.status === "indexed")) byKind[item.kind]++
  return {
    schema_version: "MaterialIndex.v1",
    workspace,
    created_at: nowIso(input.now),
    items,
    summary: {
      indexed: items.filter((item) => item.status === "indexed").length,
      skipped: items.filter((item) => item.status === "skipped").length,
      by_kind: byKind,
    },
  }
}

export async function recordMaterialIndex(
  runDir: string,
  index: MaterialIndex,
  options?: ResearchRuntimeOptions,
) {
  const run = await loadResearchRun(runDir)
  const artifact = await writeResearchArtifact(
    runDir,
    {
      kind: "source_snapshot",
      logical_path: "intake/material-index.json",
      data: index,
      source_ids: index.items.flatMap((item) => (item.source_id ? [item.source_id] : [])),
      metadata: { artifact_schema: "MaterialIndex.v1" },
    },
    options,
  )
  for (const item of index.items.filter((candidate) => candidate.status === "indexed" && candidate.source_id)) {
    await appendResearchFact(runDir, "source", {
      schema_version: RESEARCH_SCHEMA_VERSION,
      source_id: item.source_id!,
      run_id: run.run_id,
      kind: sourceKind(item.kind),
      title: item.path,
      locator: {
        path: item.path,
        line_start: item.source_range?.start_line,
        line_end: item.source_range?.end_line,
      },
      created_at: index.created_at,
      metadata: {
        artifact_schema: "MaterialIndexItem.v1",
        material_kind: item.kind,
        mime_type: item.mime_type,
        bytes: item.bytes,
        sha256: item.sha256,
      },
    })
  }
  await appendResearchEvent(
    runDir,
    {
      type: "materials.indexed",
      actor: "system",
      created_at: index.created_at,
      payload: { artifact_id: artifact.artifact_id, indexed: index.summary.indexed, skipped: index.summary.skipped },
    },
    options,
  )
  return { index, artifact }
}
