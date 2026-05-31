import { randomBytes } from "crypto"

export type PreviewArtifactRef = {
  kind: "markdown" | "latex" | "pdf" | "docx"
  path?: string
  mime_type: string
  content?: string
  url?: string
  updated_at: string
}

export type PreviewAnnotation = {
  id: string
  kind: "claim" | "citation" | "template" | "experiment" | "reviewer" | "cost" | "agent"
  severity: "info" | "warning" | "error" | "blocker"
  message: string
  source?: {
    label: string
    path?: string
    line_start?: number
    line_end?: number
  }
  tui_ref?: string
}

export type PreviewDiagnostics = {
  tools: Record<string, { status: string; path?: string; message?: string }>
  costs: {
    llm_usd: number
    api_usd: number
    total_usd: number
  }
  agents: Array<{ name: string; status: string; detail?: string }>
}

export type PreviewMonitorSummary = {
  stage_graph: Array<{ id: string; label: string; status: string; summary?: string }>
  novelty: {
    status: string
    checkpoints: Array<{ id: string; stage: string; status: string; conflicts: number; summary: string }>
    experiment_gate?: { status: string; reason: string; allowed: boolean }
  }
  paper_spine?: {
    readiness: string
    central_claim: string
    motivation_chain: string[]
    contribution_chain: string[]
  }
  global_figure?: {
    status: string
    title: string
    panels: Array<{ id: string; title: string; purpose: string; evidence_refs: number }>
    checks: Array<{ id: string; status: string; message: string }>
  }
  ledger?: {
    sources: Array<{
      source_id: string
      kind: string
      title: string
      locator: string
      created_at: string
    }>
    claims: Array<{
      claim_id: string
      status: string
      confidence: number
      text: string
      source_ids: string[]
      artifact_ids: string[]
      created_at: string
    }>
  }
  cost_agent?: {
    costs: {
      llm_usd: number
      api_usd: number
      total_usd: number
      budget_total_usd?: number
      alerts: Array<{ id: string; category: string; threshold_usd: number; observed_usd: number }>
    }
    tokens: {
      input_tokens: number
      output_tokens: number
      total_tokens: number
      estimated: boolean
    }
    agent_tree: {
      total_agents: number
      active_agents: number
      blocked_agents: number
      max_depth: number
      max_parallel: number
      recent: Array<{
        agent_id: string
        role: string
        status: string
        model: string
        depth: number
      }>
    }
    agent_team: {
      members: number
      active_members: number
      queued_tasks: number
      active_tasks: number
      completed_tasks: number
      blocked_tasks: number
      unread_messages: number
      recent_tasks: Array<{ task_id: string; title: string; status: string }>
    }
  }
  model_routing?: Array<{
    decision_id: string
    created_at: string
    role: string
    stage?: string
    source: string
    decision_model?: string
    selected_model?: string
    provider_id?: string
    model_id?: string
    candidate_count: number
    allowed_model_count: number
    reason: string
    diagnostics: string[]
  }>
  experiment_guidance?: {
    status: string
    summary: string
    final_export_blocked: boolean
    gaps: string[]
    suggestions: Array<{
      gap: string
      severity: string
      recommended_script: string
      next_action: string
    }>
  }
  experiment_starter_pack?: {
    status: string
    summary: string
    package_json_scripts: Record<string, string>
    files: Array<{ path: string; purpose: string; artifact_id?: string; artifact_path?: string; mime_type?: string }>
    next_steps: string[]
    apply_endpoint?: string
    recommended_payload?: {
      dry_run: boolean
      overwrite: boolean
      update_package_json: boolean
    }
  }
  experiment_runs?: Array<{
    run_id: string
    experiment_id: string
    role: "proposed" | "baseline" | "ablation"
    environment: "host" | "container"
    status: string
    command: string
    exit_code: number
    wall_time_seconds: number
    peak_memory_mb?: number
    gpu_hours?: number
    cost_usd?: number
    metrics: Array<{ name: string; value: number; unit?: string }>
    stdout_excerpt?: string
    stderr_excerpt?: string
  }>
  experiment_terminal_traces?: Array<{
    trace_id: string
    artifact_id?: string
    experiment_id: string
    role: "proposed" | "baseline" | "ablation"
    environment: "host" | "container"
    command: string
    cwd: string
    status: string
    exit_code: number
    wall_time_seconds: number
    timed_out: boolean
    stdout_bytes: number
    stderr_bytes: number
    output_truncated: boolean
    stdout_excerpt?: string
    stderr_excerpt?: string
  }>
  machine_environment?: {
    status: string
    workspace: string
    default_run_root: string
    os: string
    cpu: string
    memory: {
      total_bytes: number
      free_bytes: number
    }
    disk?: {
      path: string
      total_bytes: number
      free_bytes: number
    }
    gpu: {
      mode: "gpu" | "cpu-only"
      devices: Array<{ vendor: string; name: string; memory_mb?: number; driver?: string; status: string }>
      cuda_status: string
      rocm_status: string
    }
    runtimes: Array<{ id: string; label: string; status: string; version?: string; path?: string }>
    compilers: Array<{ id: string; label: string; status: string; version?: string; path?: string }>
    optional_missing: number
    blocked: number
    notes: string[]
  }
  experiment_environment?: {
    status: string
    status_label: string
    workspace: string
    default_run_root: string
    os: string
    cpu: string
    memory: {
      total_bytes: number
      free_bytes: number
    }
    disk?: {
      path: string
      total_bytes: number
      free_bytes: number
    }
    gpu_mode: "gpu" | "cpu-only"
    notes: string[]
    groups: Array<{
      id: "gpu" | "runtime" | "compiler" | "virtualization"
      label: string
      status: string
      status_label: string
      available: number
      optional_missing: number
      blocked: number
      missing: number
      tools: Array<{
        id: string
        label: string
        status: string
        status_label: string
        version?: string
        path?: string
        impact?: string
      }>
    }>
  }
  gate: {
    status: string
    failed_checks: string[]
  }
  timeline: Array<{ type: string; label: string; at: string; detail?: string }>
}

export type PreviewRenderStatus = {
  state: "idle" | "queued" | "rendering" | "ready" | "failed" | "cancelled"
  job_id?: string
  stage?: string
  message?: string
  updated_at: string
}

export type PreviewSnapshot = {
  schema_version: "preview.v1"
  run_id: string
  title: string
  readonly: true
  updated_at: string
  artifacts: {
    markdown?: PreviewArtifactRef
    latex?: PreviewArtifactRef
    pdf?: PreviewArtifactRef
    docx?: PreviewArtifactRef
  }
  annotations: PreviewAnnotation[]
  diagnostics: PreviewDiagnostics
  monitor?: PreviewMonitorSummary
  render: PreviewRenderStatus
}

export type PreviewStreamEvent =
  | { type: "snapshot"; snapshot: PreviewSnapshot }
  | { type: "render"; render: PreviewRenderStatus }
  | { type: "annotation"; annotation: PreviewAnnotation }

export function createPreviewToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url")
}

export function isWriteMethod(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())
}
