import { existsSync } from "fs"
import { copyFile, mkdir, readFile } from "fs/promises"
import os from "os"
import path from "path"

export type ManagedPaperSkillID =
  | "nature-paper"
  | "architecture-diagram"
  | "paper-framework-figure-studio-pro"
  | "bb-browser"

export type PaperSkillInstallStatus = "installed" | "already_installed" | "source_missing"

export interface PaperSkillInstallTarget {
  name: "codex" | "agents"
  path: string
  status: PaperSkillInstallStatus
}

export interface PaperSkillInstallResult {
  skill_id: ManagedPaperSkillID
  source: string
  targets: PaperSkillInstallTarget[]
  restart_required: boolean
}

export interface PaperSkillInstallOptions {
  home?: string
  workspace?: string
  install_agents?: boolean
}

export interface PaperManagedCapability {
  id: ManagedPaperSkillID
  capability_name: `skill.${ManagedPaperSkillID}`
  kind: "skill"
  display_name: string
  required: boolean
  install_policy: "built_in" | "paper_managed"
  source: string
  source_exists: boolean
  source_valid: boolean
  targets: Array<PaperSkillInstallTarget & { exists: boolean }>
  status: "available" | "missing" | "optional_missing"
  impact: string
  install_hint: string
}

interface ManagedSkillSpec {
  id: ManagedPaperSkillID
  display_name: string
  marker: string
  required: boolean
  install_policy: PaperManagedCapability["install_policy"]
  impact: string
  install_hint: string
}

const MANAGED_SKILLS: ManagedSkillSpec[] = [
  {
    id: "nature-paper",
    display_name: "Nature paper profile skill",
    marker: "name: nature-paper",
    required: false,
    install_policy: "built_in",
    impact: "Nature-style formatting, figure, supplementary material, and submission checks are degraded.",
    install_hint: "运行 paper_fucker init，或从项目内置 skill 包安装 nature-paper。",
  },
  {
    id: "architecture-diagram",
    display_name: "Architecture diagram skill",
    marker: "name: architecture-diagram",
    required: false,
    install_policy: "built_in",
    impact: "系统架构、方法管线和平台拓扑图需要回退到普通文本或手工绘制。",
    install_hint: "运行 paper_fucker init，安装 Paper Fucker 内置 architecture-diagram skill。",
  },
  {
    id: "paper-framework-figure-studio-pro",
    display_name: "Paper Framework Figure Studio Pro",
    marker: "name: paper-framework-figure-studio-pro",
    required: false,
    install_policy: "built_in",
    impact: "论文 framework figure、method overview 和 reviewer-facing schematic 的生成与审稿循环会降级。",
    install_hint: "运行 paper_fucker init，安装 Paper Fucker 内置 paper-framework-figure-studio-pro skill。",
  },
  {
    id: "bb-browser",
    display_name: "Managed browser acquisition",
    marker: "name: bb-browser",
    required: false,
    install_policy: "paper_managed",
    impact: "需要浏览器登录态或网页数据采集的文献与数据任务会降级为普通远程检索。",
    install_hint: "运行 paper_fucker init doctor 查看 Paper Fucker 托管浏览器能力修复建议。",
  },
]

function userHome(home?: string) {
  const normalize = (value: string | undefined) => {
    if (!value) return undefined
    const trimmed = value.trim()
    if (!trimmed || trimmed === "undefined" || trimmed === "null") return undefined
    return trimmed
  }
  return path.resolve(
    normalize(home) ?? normalize(process.env.PAPER_FUCKER_TEST_HOME) ?? normalize(process.env.PAPER_FUCKER_HOME) ?? os.homedir(),
  )
}

export function firstPartySkillPath(skillID: ManagedPaperSkillID, workspace?: string) {
  const workspaceSource = path.join(path.resolve(workspace ?? process.cwd()), ".paper_fucker", "skills", skillID, "SKILL.md")
  if (existsSync(workspaceSource)) return workspaceSource
  const cwdSource = path.join(process.cwd(), ".paper_fucker", "skills", skillID, "SKILL.md")
  if (existsSync(cwdSource)) return cwdSource
  return path.resolve(import.meta.dir, "../../../..", ".paper_fucker", "skills", skillID, "SKILL.md")
}

export function firstPartyNatureSkillPath(workspace?: string) {
  return firstPartySkillPath("nature-paper", workspace)
}

function targetPath(home: string, root: ".codex" | ".agents", skillID: ManagedPaperSkillID) {
  return path.join(home, root, "skills", skillID, "SKILL.md")
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

export async function inspectPaperManagedCapabilities(options: PaperSkillInstallOptions = {}): Promise<PaperManagedCapability[]> {
  const home = userHome(options.home)
  return Promise.all(
    MANAGED_SKILLS.map(async (skill) => {
      const source = firstPartySkillPath(skill.id, options.workspace)
      const targets = [
        { name: "codex" as const, path: targetPath(home, ".codex", skill.id) },
        { name: "agents" as const, path: targetPath(home, ".agents", skill.id) },
      ]
      const sourceText = existsSync(source) ? await readFile(source, "utf8") : ""
      const inspectedTargets = targets.map((target) => ({
        ...target,
        status: existsSync(target.path) ? ("already_installed" as const) : ("source_missing" as const),
        exists: existsSync(target.path),
      }))
      const installed = inspectedTargets.some((target) => target.exists)
      const sourceValid = sourceText.includes(skill.marker)
      return {
        id: skill.id,
        capability_name: `skill.${skill.id}` as const,
        kind: "skill" as const,
        display_name: skill.display_name,
        required: skill.required,
        install_policy: skill.install_policy,
        source,
        source_exists: existsSync(source),
        source_valid: sourceValid || installed,
        targets: inspectedTargets,
        status: sourceValid || installed ? ("available" as const) : skill.required ? ("missing" as const) : ("optional_missing" as const),
        impact: skill.impact,
        install_hint: skill.install_hint,
      }
    }),
  )
}

export async function inspectNatureSkill(options: PaperSkillInstallOptions = {}) {
  return (await inspectPaperManagedCapabilities(options)).find((skill) => skill.id === "nature-paper")!
}

export async function installNaturePaperSkill(
  options: PaperSkillInstallOptions = {},
): Promise<PaperSkillInstallResult> {
  const source = firstPartyNatureSkillPath(options.workspace)
  const home = userHome(options.home)
  const targets = [
    await copyIfMissing(source, targetPath(home, ".codex", "nature-paper"), "codex"),
    ...(options.install_agents === false
      ? []
      : [await copyIfMissing(source, targetPath(home, ".agents", "nature-paper"), "agents")]),
  ]
  return {
    skill_id: "nature-paper",
    source,
    targets,
    restart_required: targets.some((target) => target.status === "installed"),
  }
}
