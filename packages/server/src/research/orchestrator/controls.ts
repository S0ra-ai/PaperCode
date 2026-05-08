import { appendResearchEvent, updateResearchRunStatus, type ResearchRuntimeOptions } from "../runtime"

export type OrchestratorControl =
  | "observe"
  | "pause"
  | "stop"
  | "resume"
  | "rollback"
  | "diagnostics"
  | "cost"
  | "tools"
  | "models"
  | "template"
  | "preview"
  | "export"

export const ORCHESTRATOR_CONTROLS: OrchestratorControl[] = [
  "observe",
  "pause",
  "stop",
  "resume",
  "rollback",
  "diagnostics",
  "cost",
  "tools",
  "models",
  "template",
  "preview",
  "export",
]

export async function runOrchestratorControl(
  runDir: string,
  control: OrchestratorControl,
  options?: ResearchRuntimeOptions,
) {
  await appendResearchEvent(
    runDir,
    {
      type: `orchestrator.control.${control}`,
      actor: "user",
      payload: { control },
    },
    options,
  )
  if (control === "stop") await updateResearchRunStatus(runDir, "cancelled", options)
  return { control, accepted: true }
}
