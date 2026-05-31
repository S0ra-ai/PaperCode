import { existsSync } from "fs"
import { access, mkdir, readdir, rm, writeFile } from "fs/promises"
import { randomUUID } from "crypto"
import os from "os"
import path from "path"
import { storageFacts } from "../contracts"

export const PAPER_FUCKER_DIR = ".paper_fucker"
export const RUNS_DIR = "runs"

export type ResearchStorageScope = "workspace" | "home"

export type ResearchPathOptions = {
  workspace?: string
  home?: string
  storage_scope?: ResearchStorageScope
}

export type ResearchRunRoot = {
  root: string
  scope: ResearchStorageScope
}

export function resolveResearchHome(home?: string) {
  return path.resolve(home ?? process.env.PAPER_FUCKER_TEST_HOME ?? process.env.PAPER_FUCKER_HOME ?? os.homedir())
}

export function resolveResearchWorkspace(workspace?: string) {
  return path.resolve(workspace ?? process.cwd())
}

export function workspaceRunRoot(workspace: string) {
  return path.join(resolveResearchWorkspace(workspace), PAPER_FUCKER_DIR, RUNS_DIR)
}

export function homeRunRoot(home?: string) {
  return path.join(resolveResearchHome(home), PAPER_FUCKER_DIR, RUNS_DIR)
}

export function runDirectoryName(runId: string) {
  return encodeURIComponent(runId).replaceAll("%", "~")
}

export function runDirectoryPath(root: string, runId: string) {
  return path.join(root, runDirectoryName(runId))
}

async function ensureWritableDirectory(dir: string) {
  await mkdir(dir, { recursive: true })
  const probe = path.join(dir, `.paper_fucker-write-${process.pid}-${randomUUID()}`)
  await writeFile(probe, "")
  await removeProbeFile(probe)
}

function isTransientWindowsFileError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "EBUSY" ||
      error.code === "EACCES" ||
      error.code === "EPERM" ||
      error.code === "ENOTEMPTY" ||
      error.code === "EFAULT")
  )
}

async function removeProbeFile(probe: string) {
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await rm(probe, { force: true })
      return
    } catch (error) {
      if (!isTransientWindowsFileError(error)) throw error
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)))
    }
  }
  throw lastError
}

export async function chooseRunRoot(options: ResearchPathOptions): Promise<ResearchRunRoot> {
  if (options.storage_scope === "home" || !options.storage_scope) {
    const root = homeRunRoot(options.home)
    await ensureWritableDirectory(root)
    return { root, scope: "home" }
  }

  const workspace = resolveResearchWorkspace(options.workspace)
  const workspaceRoot = workspaceRunRoot(workspace)
  await ensureWritableDirectory(workspaceRoot)
  return { root: workspaceRoot, scope: "workspace" }
}

async function safeRunDirs(root: string) {
  if (!existsSync(root)) return []
  const entries = await readdir(root, { withFileTypes: true })
  const dirs: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const runDir = path.join(root, entry.name)
    const runFile = path.join(runDir, storageFacts.run)
    try {
      await access(runFile)
      dirs.push(runDir)
    } catch {
      // Ignore incomplete directories; indexes are rebuildable from valid facts.
    }
  }
  return dirs
}

export async function discoverRunDirs(options: ResearchPathOptions) {
  const roots = [workspaceRunRoot(resolveResearchWorkspace(options.workspace)), homeRunRoot(options.home)]
  const uniqueRoots = Array.from(new Set(roots.map((item) => path.resolve(item))))
  const dirs = await Promise.all(uniqueRoots.map((root) => safeRunDirs(root)))
  return Array.from(new Set(dirs.flat().map((item) => path.resolve(item))))
}

export function normalizeRelativeArtifactPath(input: string) {
  const raw = input.replaceAll("\\", "/")
  if (!raw.trim()) throw new Error("Artifact path cannot be empty.")
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) throw new Error(`Artifact path must be relative: ${input}`)
  const normalized = path.posix.normalize(raw)
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Artifact path cannot escape the run directory: ${input}`)
  }
  return normalized
}

export function artifactAbsolutePath(runDir: string, relativePath: string) {
  const normalized = normalizeRelativeArtifactPath(relativePath)
  return path.join(runDir, ...normalized.split("/"))
}
