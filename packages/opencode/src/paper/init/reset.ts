import path from "path"
import { cp, mkdir, rm } from "fs/promises"
import { existsSync } from "fs"
import { initPaths, PAPER_FUCKER_DIR, resolveInitHome } from "./config"

export type InitResetScope = "all" | "global" | "workspace-local" | "workspace-runs"

export type InitResetInput = {
  scope?: InitResetScope
  home?: string
  workspace?: string
  backup?: boolean
  yes?: boolean
  now?: Date
}

export type InitResetTarget = {
  id: "global" | "workspace-local" | "workspace-runs"
  path: string
  existed: boolean
  backed_up_to?: string
  removed: boolean
}

export type InitResetResult = {
  scope: InitResetScope
  backup: boolean
  backup_dir?: string
  targets: InitResetTarget[]
}

function timestamp(now = new Date()) {
  return now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z")
}

function normalize(file: string) {
  return path.resolve(file)
}

function ensureWorkspaceTarget(workspace: string, target: string) {
  const root = normalize(path.join(workspace, PAPER_FUCKER_DIR))
  const resolved = normalize(target)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Refusing to reset path outside workspace .paper_fucker: ${resolved}`)
  }
  return resolved
}

function ensureGlobalTarget(home: string, target: string) {
  const resolved = normalize(target)
  const expected = normalize(path.join(home, PAPER_FUCKER_DIR))
  if (resolved !== expected || path.basename(resolved) !== PAPER_FUCKER_DIR) {
    throw new Error(`Refusing to reset unexpected global Paper Fucker path: ${resolved}`)
  }
  return resolved
}

function selected(scope: InitResetScope, target: InitResetTarget["id"]) {
  if (scope === "all") return true
  if (scope === "global") return target === "global"
  if (scope === "workspace-local") return target === "workspace-local"
  if (scope === "workspace-runs") return target === "workspace-runs"
  return false
}

async function backupTarget(target: string, backupDir: string, label: string) {
  const destination = path.join(backupDir, label)
  await mkdir(path.dirname(destination), { recursive: true })
  await cp(target, destination, { recursive: true, force: true, errorOnExist: false })
  return destination
}

export function initResetBackupRoot(home?: string, now?: Date) {
  return path.join(resolveInitHome(home), ".paper_fucker_backups", timestamp(now))
}

export async function resetInitState(input: InitResetInput): Promise<InitResetResult> {
  if (!input.yes) throw new Error("Reset requires --yes.")
  const scope = input.scope ?? "all"
  const backup = input.backup ?? true
  const home = resolveInitHome(input.home)
  const workspace = normalize(input.workspace ?? process.cwd())
  const globalRoot = ensureGlobalTarget(home, initPaths(home).root)
  const workspacePaper = normalize(path.join(workspace, PAPER_FUCKER_DIR))
  if (globalRoot === workspacePaper) {
    throw new Error("Global Paper Fucker home resolves to the workspace .paper_fucker directory; refusing reset.")
  }

  const candidates: InitResetTarget[] = [
    {
      id: "global" as const,
      path: globalRoot,
      existed: existsSync(globalRoot),
      removed: false,
    },
    {
      id: "workspace-local" as const,
      path: ensureWorkspaceTarget(workspace, path.join(workspace, PAPER_FUCKER_DIR, "local")),
      existed: existsSync(path.join(workspace, PAPER_FUCKER_DIR, "local")),
      removed: false,
    },
    {
      id: "workspace-runs" as const,
      path: ensureWorkspaceTarget(workspace, path.join(workspace, PAPER_FUCKER_DIR, "runs")),
      existed: existsSync(path.join(workspace, PAPER_FUCKER_DIR, "runs")),
      removed: false,
    },
  ].filter((target) => selected(scope, target.id))

  const backupDir = backup ? initResetBackupRoot(home, input.now) : undefined
  if (backupDir) await mkdir(backupDir, { recursive: true })

  for (const target of candidates) {
    if (!target.existed) continue
    if (backupDir) target.backed_up_to = await backupTarget(target.path, backupDir, target.id)
    await rm(target.path, { recursive: true, force: true })
    target.removed = true
  }

  return {
    scope,
    backup,
    backup_dir: backupDir,
    targets: candidates,
  }
}

export function defaultResetHome() {
  return resolveInitHome()
}
