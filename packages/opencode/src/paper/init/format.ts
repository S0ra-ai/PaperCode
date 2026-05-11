import type { InitResetResult } from "./reset"
import type { InitWizardResult } from "./wizard"

type DoctorResult = {
  paths: InitWizardResult["paths"]
  config_exists: boolean
  tools_exists: boolean
  secrets_exists: boolean
  config?: InitWizardResult["config"]
  tools: InitWizardResult["tools"]
}

function availableTools(tools: InitWizardResult["tools"]) {
  return Object.values(tools.tools).filter((tool) => tool.status === "available")
}

function missingTools(tools: InitWizardResult["tools"]) {
  return Object.values(tools.tools).filter((tool) => tool.status !== "available")
}

function preview(names: string[], limit = 8) {
  if (names.length <= limit) return names.join(", ") || "无"
  return `${names.slice(0, limit).join(", ")} 等 ${names.length} 个`
}

function accessLabel(config: InitWizardResult["config"]) {
  if (config.access.mode === "full_access") return "Full Access（已显式确认风险）"
  return `Bounded（${config.access.bounded_hours ?? 24} 小时）`
}

function providerSummary(config: InitWizardResult["config"]) {
  const endpoints = config.models.endpoints
  if (endpoints.length === 0) return "尚未配置 provider"
  return preview(endpoints.map((endpoint) => `${endpoint.name} -> ${endpoint.model}`), 4)
}

export function formatInitResult(result: InitWizardResult) {
  const available = availableTools(result.tools)
  const missing = missingTools(result.tools)
  return [
    "Paper Fucker 初始化完成",
    "",
    `配置目录: ${result.paths.root}`,
    `默认语言: ${result.config.language.default}`,
    `访问模式: ${accessLabel(result.config)}`,
    `实时预览: ${result.config.preview.auto_open ? "已启用" : "已关闭"}`,
    `默认模型: ${result.config.model_roles.default_model}`,
    `Provider: ${providerSummary(result.config)}`,
    `外部工具: ${available.length} 个可用${missing.length > 0 ? `，${missing.length} 个缺失` : ""}`,
    `可用工具: ${preview(available.map((tool) => tool.name))}`,
    `本地密钥: ${result.wrote_secrets ? "已写入加密密钥文件" : "未写入；可稍后添加 provider key"}`,
    "",
    "下一步:",
    "  1. 运行 paper_fucker 打开中文论文工作台",
    "  2. 运行 paper_fucker init doctor 查看配置健康状态",
    "  3. 需要自动化脚本读取完整结果时，加 --json",
  ].join("\n")
}

export function formatDoctorResult(result: DoctorResult) {
  const available = availableTools(result.tools)
  const missing = missingTools(result.tools)
  const config = result.config
  const lines = [
    "Paper Fucker Doctor",
    "",
    `配置目录: ${result.paths.root}`,
    `配置文件: ${result.config_exists ? "已存在" : "缺失"}`,
    `工具缓存: ${result.tools_exists ? "已存在" : "缺失"}`,
    `本地密钥: ${result.secrets_exists ? "已配置" : "未配置"}`,
  ]

  if (config) {
    lines.push(
      `默认语言: ${config.language.default}`,
      `访问模式: ${accessLabel(config)}`,
      `实时预览: ${config.preview.auto_open ? "已启用" : "已关闭"}`,
      `默认模型: ${config.model_roles.default_model}`,
      `Provider: ${providerSummary(config)}`,
    )
  }

  lines.push(
    `外部工具: ${available.length} 个可用${missing.length > 0 ? `，${missing.length} 个缺失` : ""}`,
    `可用工具: ${preview(available.map((tool) => tool.name))}`,
  )

  if (missing.length > 0) {
    lines.push(`缺失工具: ${preview(missing.map((tool) => tool.name))}`)
  }

  lines.push("", "建议:")
  if (!result.config_exists) lines.push("  - 先运行 paper_fucker init 创建本地配置")
  if (!result.secrets_exists) lines.push("  - 还没有本地密钥；添加 provider key 后可运行 provider smoke")
  if (missing.length > 0) lines.push("  - 缺失的外部工具只影响对应能力，基础 TUI 仍可启动")
  if (result.config_exists && missing.length === 0) lines.push("  - 基础环境可用，可以打开 paper_fucker 开始测试")
  lines.push("  - 需要完整机器可读诊断时，加 --json")

  return lines.join("\n")
}

export function formatResetResult(result: InitResetResult) {
  const removed = result.targets.filter((target) => target.removed)
  const untouched = result.targets.filter((target) => !target.removed)
  const lines = [
    "Paper Fucker 本地状态重置完成",
    "",
    `范围: ${result.scope}`,
    `备份: ${result.backup ? result.backup_dir ?? "已启用" : "未启用"}`,
    `已清理: ${removed.length} 项`,
  ]
  for (const target of removed) {
    lines.push(`  - ${target.id}: ${target.path}`)
  }
  if (untouched.length > 0) {
    lines.push(`未变更: ${untouched.map((target) => target.id).join(", ")}`)
  }
  lines.push("", "需要完整机器可读结果时，加 --json")
  return lines.join("\n")
}
