import type { InitResetResult } from "./reset"
import type { InitWizardResult } from "./wizard"

type DoctorResult = {
  paths: InitWizardResult["paths"]
  config_exists: boolean
  tools_exists: boolean
  secrets_exists: boolean
  config?: InitWizardResult["config"]
  tools: InitWizardResult["tools"]
  skills?: InitWizardResult["skills"] | Awaited<ReturnType<typeof import("../skill-install").inspectNatureSkill>>
  managed_capabilities?: InitWizardResult["managed_capabilities"]
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

function modelSummary(config: InitWizardResult["config"]) {
  return config.model_roles.default_model || "未配置模型"
}

function groupedLine(label: string, values: string[]) {
  return [`${label}:`, ...(values.length > 0 ? values.map((value) => `  - ${value}`) : ["  - 无"])]
}

export function formatInitResult(result: InitWizardResult) {
  const available = availableTools(result.tools)
  const missing = missingTools(result.tools)
  return [
    "PaperCode 初始化完成",
    "",
    `配置目录: ${result.paths.root}`,
    `默认语言: ${result.config.language.default}`,
    `访问模式: ${accessLabel(result.config)}`,
    `实时预览: ${result.config.preview.auto_open ? "已启用" : "已关闭"}`,
    `默认模型: ${modelSummary(result.config)}`,
    `Provider: ${providerSummary(result.config)}`,
    `Nature Skill: ${result.skills.restart_required ? "已安装，重启 PaperCode 后生效" : "已就绪"}`,
    `外部工具: ${available.length} 个可用${missing.length > 0 ? `，${missing.length} 个缺失` : ""}`,
    `可用工具: ${preview(available.map((tool) => tool.name))}`,
    `本地密钥: ${result.wrote_secrets ? "已写入加密密钥文件" : "未写入；可稍后添加 provider key"}`,
    "",
    "下一步:",
    "  1. 运行 papercode 打开中文论文工作台",
    "  2. 运行 papercode init doctor 查看配置健康状态",
    "  3. 需要自动化脚本读取完整结果时，加 --json",
  ].join("\n")
}

export function formatDoctorResult(result: DoctorResult) {
  const available = availableTools(result.tools)
  const missing = missingTools(result.tools)
  const config = result.config
  const configured = [
    `配置目录 ${result.paths.root}`,
    ...(result.config_exists ? ["配置文件已存在"] : []),
    ...(result.tools_exists ? ["工具缓存已存在"] : []),
    ...(result.secrets_exists ? ["本地密钥已配置"] : []),
    ...(config
      ? [
          `默认语言 ${config.language.default}`,
          `访问模式 ${accessLabel(config)}`,
          `实时预览 ${config.preview.auto_open ? "已启用" : "已关闭"}`,
        ]
      : []),
    ...(available.length > 0 ? [`可用工具 ${preview(available.map((tool) => tool.name))}`] : []),
  ]

  const unconfigured = [
    ...(!result.config_exists ? ["配置文件缺失"] : []),
    ...(!result.tools_exists ? ["工具缓存缺失"] : []),
    ...(!result.secrets_exists ? ["本地密钥未配置"] : []),
    ...(config ? [`默认模型 ${modelSummary(config)}`, `Provider ${providerSummary(config)}`].filter((item) => item.includes("未配置") || item.includes("尚未配置")) : []),
  ]

  const optionalMissing = [
    ...missing.map((tool) => `${tool.name} 缺失；只影响对应实验/导出能力`),
    ...(result.managed_capabilities ?? [])
      .filter((capability) => capability.status === "optional_missing")
      .map((capability) => `${capability.display_name}: ${capability.impact}`),
  ]

  const blocked = [
    ...(config?.model_roles.default_model ? [] : ["未选择主决策模型；PaperRun 会暂停在模型工作台"]),
    ...(result.managed_capabilities ?? [])
      .filter((capability) => capability.status === "missing")
      .map((capability) => `${capability.display_name}: ${capability.impact}`),
  ]

  const nextSteps = []
  if (!result.config_exists) nextSteps.push("先运行 papercode init 创建本地配置")
  if (!result.secrets_exists) nextSteps.push("添加 provider key 后再运行 provider smoke")
  if (!config?.model_roles.default_model) nextSteps.push("进入 /models 添加 provider、勾选允许模型并选择主决策模型")
  if (optionalMissing.length > 0) nextSteps.push("按需运行 papercode init 修复可选工具或 Skill")
  if (nextSteps.length === 0) nextSteps.push("基础环境可用，可以打开 papercode 开始测试")
  nextSteps.push("需要完整机器可读诊断时，加 --json")

  const lines = [
    "PaperCode Doctor",
    "",
    ...groupedLine("已配置", configured),
    "",
    ...groupedLine("未配置", unconfigured),
    "",
    ...groupedLine("可选缺失", optionalMissing),
    "",
    ...groupedLine("阻断缺失", blocked),
    "",
    ...groupedLine("下一步建议", nextSteps),
  ]

  return lines.join("\n")
}

export function formatResetResult(result: InitResetResult) {
  const removed = result.targets.filter((target) => target.removed)
  const untouched = result.targets.filter((target) => !target.removed)
  const lines = [
    "PaperCode 本地状态重置完成",
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
