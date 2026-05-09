import { LocalContext } from "@/util/local-context"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import path from "path"
import type * as Project from "./project"

export interface InstanceContext {
  directory: string
  worktree: string
  project: Project.Info
}

export const context = LocalContext.create<InstanceContext>("instance")

function isUnsupportedWindowsPosixRoot(filepath: string) {
  if (process.platform !== "win32") return false
  const normalized = filepath.replace(/\\/g, "/")
  return /^\/(?![a-zA-Z](?:\/|$)|cygdrive\/[a-zA-Z](?:\/|$)|mnt\/[a-zA-Z](?:\/|$))/.test(normalized)
}

function containsProjectPath(parent: string, child: string) {
  if (process.platform !== "win32") return AppFileSystem.contains(parent, child)
  const normalizedParent = AppFileSystem.normalizePath(parent)
  const normalizedChild = AppFileSystem.normalizePath(child)
  const relative = path.win32.relative(normalizedParent, normalizedChild)
  return relative === "" || (!relative.startsWith("..") && !path.win32.isAbsolute(relative))
}

/**
 * Check if a path is within the project boundary.
 * Returns true if path is inside ctx.directory OR ctx.worktree.
 * Paths within the worktree but outside the working directory should not trigger external_directory permission.
 */
export function containsPath(filepath: string, ctx: InstanceContext): boolean {
  if (isUnsupportedWindowsPosixRoot(filepath)) return false
  if (containsProjectPath(ctx.directory, filepath)) return true
  // Non-git projects set worktree to "/" which would match ANY absolute path.
  // Skip worktree check in this case to preserve external_directory permissions.
  if (ctx.worktree === "/") return false
  return containsProjectPath(ctx.worktree, filepath)
}
