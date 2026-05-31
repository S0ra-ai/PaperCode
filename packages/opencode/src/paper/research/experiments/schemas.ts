export type ExperimentMetricDirection = "higher_better" | "lower_better"

export type ExperimentMetric = {
  name: string
  value: number
  direction: ExperimentMetricDirection
  unit?: string
}

export type ExperimentResourceUsage = {
  wall_time_seconds: number
  peak_memory_mb?: number
  gpu_hours?: number
  cost_usd?: number
}

export type ExperimentEnvironment = {
  mode: "host" | "container"
  image?: string
  digest?: string
  python?: string
  node?: string
  platform: NodeJS.Platform | "container"
  variables?: Record<string, string>
}

export type ExperimentCommand = {
  argv: string[]
  cwd?: string
  timeout_seconds?: number
  env?: Record<string, string>
}

export type ExperimentProtocolEntry = {
  protocol_id: string
  role: "proposed" | "baseline" | "ablation" | "container_reproduction"
  label: string
  command: ExperimentCommand
  expected_metric: string
  rationale: string
  source_range?: {
    path: string
    start_line: number
    end_line: number
  }
}

export type ExperimentProtocol = {
  schema_version: "ExperimentProtocol.v1"
  discovered_from: "package_scripts" | "manifest" | "manual"
  entries: ExperimentProtocolEntry[]
  gaps: string[]
}

export type ExperimentProtocolGuidanceItem = {
  gap: string
  severity: "blocking" | "warning"
  recommended_script: string
  package_json_example?: Record<string, string>
  rationale: string
  next_action: string
}

export type ExperimentProtocolGuidance = {
  schema_version: "ExperimentProtocolGuidance.v1"
  created_at: string
  status: "complete" | "needs_protocol"
  summary: string
  final_export_blocked: boolean
  gaps: string[]
  suggestions: ExperimentProtocolGuidanceItem[]
}

export type ExperimentProtocolStarterFile = {
  path: string
  purpose: string
  content: string
  mime_type?: string
  artifact_id?: string
  artifact_path?: string
}

export type ExperimentProtocolStarterPack = {
  schema_version: "ExperimentProtocolStarterPack.v1"
  created_at: string
  status: "ready" | "not_needed"
  summary: string
  package_json_scripts: Record<string, string>
  files: ExperimentProtocolStarterFile[]
  next_steps: string[]
}

export type ExperimentSpec = {
  experiment_id: string
  label: string
  role: "proposed" | "baseline" | "ablation"
  dataset_ids: string[]
  command: ExperimentCommand
  expected_metric: string
  rationale: string
}

export type ExperimentPlan = {
  schema_version: "ExperimentPlan.v1"
  plan_id: string
  topic: string
  method_name: string
  objective: string
  created_at: string
  metrics: Array<{ name: string; direction: ExperimentMetricDirection; primary?: boolean }>
  baselines: ExperimentSpec[]
  proposed: ExperimentSpec
  ablations: ExperimentSpec[]
  resource_budget: {
    max_wall_time_seconds: number
    max_memory_mb: number
    max_gpu_hours?: number
  }
  downgrade_policy: string[]
}

export type ExperimentRunStatus = "succeeded" | "failed" | "environment_failed" | "resource_exceeded"

export type ExperimentRun = {
  schema_version: "ExperimentRun.v1"
  experiment_run_id: string
  plan_id: string
  experiment_id: string
  role: ExperimentSpec["role"]
  status: ExperimentRunStatus
  environment: ExperimentEnvironment
  command: ExperimentCommand
  metrics: ExperimentMetric[]
  stdout: string
  stderr: string
  exit_code: number
  resource_usage: ExperimentResourceUsage
  failure_category?: "method_failed" | "environment_failed" | "resource_exceeded"
  started_at: string
  finished_at: string
  reproduction: {
    container_reproduced: boolean
    image?: string
    digest?: string
  }
}

export type ExperimentFinding = {
  category:
    | "underperforming_method"
    | "environment_failed"
    | "resource_exceeded"
    | "container_reproduction_failed"
    | "metric_missing"
    | "experiment_protocol_incomplete"
  severity: "info" | "warning" | "blocking"
  message: string
  experiment_ids: string[]
}

export type ResultReport = {
  schema_version: "ResultReport.v1"
  plan_id: string
  created_at: string
  primary_metric: string
  best_baseline?: {
    experiment_id: string
    value: number
  }
  proposed?: {
    experiment_id: string
    value: number
  }
  findings: ExperimentFinding[]
  blockers: string[]
  recommendation: "accept" | "revise" | "block"
  reproduction: {
    status: "not_run" | "passed" | "failed"
    container_run_ids: string[]
  }
  final_claims_allowed: boolean
}

export type ExperimentRunnerResult = {
  status: ExperimentRunStatus
  command?: ExperimentCommand
  metrics: ExperimentMetric[]
  stdout: string
  stderr: string
  exit_code: number
  resource_usage?: Partial<ExperimentResourceUsage>
}

export type ExperimentRunner = (
  spec: ExperimentSpec,
  environment: ExperimentEnvironment,
) => Promise<ExperimentRunnerResult> | ExperimentRunnerResult
