export const PAPER_MODEL_ROLES = [
  "planner",
  "literature_researcher",
  "code_analyst",
  "experiment_designer",
  "writer",
  "reviewer",
  "citation_checker",
  "cheap_summarizer",
  "subagent",
] as const

export type PaperModelRole = (typeof PAPER_MODEL_ROLES)[number]

export type PaperModelRef = {
  provider_id: string
  model_id: string
}

export type ModelRoleConfig = {
  default_model: string
  roles?: Partial<Record<PaperModelRole, string>>
}

export type ResolvedModelRole = PaperModelRef & {
  role: PaperModelRole
  source: "default" | "role_override"
}

export type ModelRoleRouter = {
  strategy: "paper_provider_agnostic"
  config: ModelRoleConfig
  resolve(role: PaperModelRole): ResolvedModelRole
  diagnostics(): {
    strategy: "paper_provider_agnostic"
    default_model: PaperModelRef
    role_overrides: Partial<Record<PaperModelRole, PaperModelRef>>
  }
}

export const DEFAULT_MODEL_ROLE_CONFIG = {
  default_model: "deepseek/deepseek-v4-pro",
  roles: {},
} as const satisfies ModelRoleConfig

export class InvalidPaperModelIdError extends Error {
  constructor(
    readonly value: string,
    readonly role?: PaperModelRole,
  ) {
    super(role ? `Invalid PaperCode model id for role "${role}": ${value}` : `Invalid PaperCode model id: ${value}`)
    this.name = "InvalidPaperModelIdError"
  }
}

export function parsePaperModelId(value: string, role?: PaperModelRole): PaperModelRef {
  const [provider, ...modelParts] = value.split("/")
  const model = modelParts.join("/")
  if (!provider?.trim() || !model.trim()) throw new InvalidPaperModelIdError(value, role)
  return {
    provider_id: provider.trim(),
    model_id: model.trim(),
  }
}

export function createModelRoleRouter(config: Partial<ModelRoleConfig> = {}): ModelRoleRouter {
  const resolvedConfig: ModelRoleConfig = {
    default_model: config.default_model ?? DEFAULT_MODEL_ROLE_CONFIG.default_model,
    roles: config.roles ?? {},
  }

  return {
    strategy: "paper_provider_agnostic",
    config: resolvedConfig,
    resolve(role) {
      const override = resolvedConfig.roles?.[role]
      const source = override ? "role_override" : "default"
      const ref = parsePaperModelId(override ?? resolvedConfig.default_model, role)
      return {
        role,
        ...ref,
        source,
      }
    },
    diagnostics() {
      const role_overrides: Partial<Record<PaperModelRole, PaperModelRef>> = {}
      for (const role of PAPER_MODEL_ROLES) {
        const value = resolvedConfig.roles?.[role]
        if (value) role_overrides[role] = parsePaperModelId(value, role)
      }
      return {
        strategy: "paper_provider_agnostic",
        default_model: parsePaperModelId(resolvedConfig.default_model),
        role_overrides,
      }
    },
  }
}
