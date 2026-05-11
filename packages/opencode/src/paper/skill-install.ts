import { existsSync } from "fs"
import { copyFile, mkdir, readFile } from "fs/promises"
import os from "os"
import path from "path"

export type PaperSkillInstallStatus = "installed" | "already_installed" | "source_missing"

export interface PaperSkillInstallTarget {
  name: "codex" | "agents"
  path: string
  status: PaperSkillInstallStatus
}

export interface PaperSkillInstallResult {
  skill_id: "nature-paper"
  source: string
  targets: PaperSkillInstallTarget[]
  restart_required: boolean
}

export interface PaperSkillInstallOptions {
  home?: string
  workspace?: string
  install_agents?: boolean
}

function userHome(home?: string) {
  return path.resolve(home ?? process.env.PAPER_FUCKER_TEST_HOME ?? process.env.PAPER_FUCKER_HOME ?? os.homedir())
}

export function firstPartyNatureSkillPath(workspace?: string) {
  const workspaceSource = path.join(path.resolve(workspace ?? process.cwd()), ".paper_fucker", "skills", "nature-paper", "SKILL.md")
  if (existsSync(workspaceSource)) return workspaceSource
  const cwdSource = path.join(process.cwd(), ".paper_fucker", "skills", "nature-paper", "SKILL.md")
  if (existsSync(cwdSource)) return cwdSource
  return path.resolve(import.meta.dir, "../../../..", ".paper_fucker", "skills", "nature-paper", "SKILL.md")
}

function targetPath(home: string, root: ".codex" | ".agents") {
  return path.join(home, root, "skills", "nature-paper", "SKILL.md")
}

async function copyIfMissing(source: string, target: string, name: PaperSkillInstallTarget["name"]) {
  if (!existsSync(source)) {
    return { name, path: target, status: "source_missing" as const }
  }
  if (existsSync(target)) {
    return { name, path: target, status: "already_installed" as const }
  }
  await mkdir(path.dirname(target), { recursive: true })
  await copyFile(source, target)
  return { name, path: target, status: "installed" as const }
}

export async function inspectNatureSkill(options: PaperSkillInstallOptions = {}) {
  const source = firstPartyNatureSkillPath(options.workspace)
  const home = userHome(options.home)
  const targets = [
    { name: "codex" as const, path: targetPath(home, ".codex") },
    { name: "agents" as const, path: targetPath(home, ".agents") },
  ]
  const sourceText = existsSync(source) ? await readFile(source, "utf8") : ""
  return {
    skill_id: "nature-paper" as const,
    source,
    source_exists: existsSync(source),
    source_valid: sourceText.includes("name: nature-paper") && sourceText.includes("Nature Portfolio"),
    targets: targets.map((target) => ({
      ...target,
      exists: existsSync(target.path),
    })),
  }
}

export async function installNaturePaperSkill(
  options: PaperSkillInstallOptions = {},
): Promise<PaperSkillInstallResult> {
  const source = firstPartyNatureSkillPath(options.workspace)
  const home = userHome(options.home)
  const targets = [
    await copyIfMissing(source, targetPath(home, ".codex"), "codex"),
    ...(options.install_agents === false ? [] : [await copyIfMissing(source, targetPath(home, ".agents"), "agents")]),
  ]
  return {
    skill_id: "nature-paper",
    source,
    targets,
    restart_required: targets.some((target) => target.status === "installed"),
  }
}
