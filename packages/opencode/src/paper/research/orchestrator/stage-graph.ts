export type ResearchStageId =
  | "intake"
  | "template"
  | "literature"
  | "data"
  | "experiment"
  | "writing"
  | "verification"
  | "export"

export type ResearchStageStatus = "pending" | "running" | "succeeded" | "paused" | "failed" | "skipped"

export type ResearchPauseReason =
  | "safety"
  | "authenticity"
  | "cost_anomaly"
  | "external_tool_missing"
  | "source_license_conflict"
  | "low_confidence"
  | "manual_pause"
  | "stage_failure"

export type ResearchStageDefinition = {
  id: ResearchStageId
  title: string
  checkpoint: true
  depends_on: ResearchStageId[]
  artifact_schema?: string
}

export type ResearchStageSnapshot = {
  id: ResearchStageId
  status: ResearchStageStatus
  started_at?: string
  completed_at?: string
  pause_reason?: ResearchPauseReason
  summary?: string
}

export type ResearchStageGraph = {
  schema_version: "orchestrator.stage_graph.v1"
  stages: ResearchStageDefinition[]
}

export const AUTOMATIC_STAGE_GRAPH: ResearchStageGraph = {
  schema_version: "orchestrator.stage_graph.v1",
  stages: [
    { id: "intake", title: "Intake topic and runtime context", checkpoint: true, depends_on: [] },
    {
      id: "template",
      title: "Resolve trusted paper template",
      checkpoint: true,
      depends_on: ["intake"],
      artifact_schema: "TemplateSpec.v1",
    },
    {
      id: "literature",
      title: "Discover and cluster open literature",
      checkpoint: true,
      depends_on: ["template"],
      artifact_schema: "LiteratureMap.v1",
    },
    {
      id: "data",
      title: "Discover datasets and source licenses",
      checkpoint: true,
      depends_on: ["literature"],
      artifact_schema: "DataPlan.v1",
    },
    {
      id: "experiment",
      title: "Plan and reproduce experiments",
      checkpoint: true,
      depends_on: ["data"],
      artifact_schema: "ExperimentPlan.v1",
    },
    {
      id: "writing",
      title: "Compose ClaimLedger-backed draft",
      checkpoint: true,
      depends_on: ["experiment"],
      artifact_schema: "DraftPaper.v1",
    },
    {
      id: "verification",
      title: "Run authenticity verification gate",
      checkpoint: true,
      depends_on: ["writing"],
      artifact_schema: "BlockingReport.v1",
    },
    {
      id: "export",
      title: "Export final or forced draft bundle",
      checkpoint: true,
      depends_on: ["verification"],
      artifact_schema: "ExportBundle.v1",
    },
  ],
}

export function initialStageSnapshots(graph: ResearchStageGraph = AUTOMATIC_STAGE_GRAPH): ResearchStageSnapshot[] {
  return graph.stages.map((stage) => ({
    id: stage.id,
    status: "pending",
  }))
}

export function nextRunnableStage(stages: ResearchStageSnapshot[], graph: ResearchStageGraph = AUTOMATIC_STAGE_GRAPH) {
  const byId = new Map(stages.map((stage) => [stage.id, stage]))
  return graph.stages.find((definition) => {
    const snapshot = byId.get(definition.id)
    if (!snapshot || snapshot.status !== "pending") return false
    return definition.depends_on.every((dependency) => byId.get(dependency)?.status === "succeeded")
  })
}
