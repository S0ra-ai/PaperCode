import { PAPER_MODEL_ROLES, parsePaperModelId, type PaperModelRef, type PaperModelRole } from "./model-router"

export interface ModelRoleAssignment {
  default_model: string
  roles?: Partial<Record<PaperModelRole, string>>
  subagents?: Record<string, string>
}

export type ModelRoleAssignmentSource = "default" | "role_override" | "subagent_override"

export type ResolvedModelRoleAssignment = PaperModelRef & {
  role: PaperModelRole
  subagent_role?: string
  source: ModelRoleAssignmentSource
}

export function resolveModelRoleAssignment(
  assignment: ModelRoleAssignment,
  role: PaperModelRole,
  subagentRole?: string,
): ResolvedModelRoleAssignment {
  if (!PAPER_MODEL_ROLES.includes(role)) {
    throw new Error(`Unknown paper model role: ${role}`)
  }
  const subagent = subagentRole ? assignment.subagents?.[subagentRole] : undefined
  const override = assignment.roles?.[role]
  const source: ModelRoleAssignmentSource = subagent ? "subagent_override" : override ? "role_override" : "default"
  const parsed = parsePaperModelId(subagent ?? override ?? assignment.default_model, role)
  return {
    role,
    subagent_role: subagentRole,
    source,
    provider_id: parsed.provider_id,
    model_id: parsed.model_id,
  }
}

export function resolveAllModelRoleAssignments(assignment: ModelRoleAssignment) {
  return Object.fromEntries(
    PAPER_MODEL_ROLES.map((role) => [role, resolveModelRoleAssignment(assignment, role)]),
  ) as Record<PaperModelRole, ResolvedModelRoleAssignment>
}
