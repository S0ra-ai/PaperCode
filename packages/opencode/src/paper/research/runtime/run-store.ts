import { existsSync } from "fs"
import { appendFile, mkdir, readFile } from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"
import {
  defaultStorageLayout,
  RESEARCH_SCHEMA_VERSION,
  storageFacts,
  validate,
  type ResearchActor,
  type ResearchArtifact,
  type ResearchContractByKind,
  type ResearchContractKind,
  type ResearchEvent,
  type ResearchMetadata,
  type ResearchRun,
  type ResearchRunStatus,
} from "../contracts"
import { rebuildGlobalIndex, rebuildRunIndex } from "../storage"
import { withSpan } from "../telemetry"
import { applyCostUsage, type ResearchCostBudget, type ResearchCostUsage, type ResearchPermissionInput } from "./policy"
import {
  chooseRunRoot,
  discoverRunDirs,
  runDirectoryPath,
  type ResearchPathOptions,
  type ResearchStorageScope,
} from "./paths"
import {
  createRuntimeState,
  loadRuntimeState,
  saveRuntimeState,
  updateRuntimeState,
  writeJsonAtomic,
  type ResearchFinalGateState,
  type ResearchRuntimeState,
} from "./state"

export type ResearchRuntimeOptions = ResearchPathOptions & {
  clock?: () => Date
  idFactory?: (kind: "run" | "event" | "artifact") => string
}

export type CreateResearchRunInput = {
  topic: string
  workspace?: string
  storage_scope?: ResearchStorageScope
  run_id?: string
  permission?: ResearchPermissionInput
  budget?: ResearchCostBudget
  metadata?: ResearchMetadata
}

export type ResearchRunHandle = {
  run: ResearchRun
  run_dir: string
  storage_scope: ResearchStorageScope
  state: ResearchRuntimeState
}

export type AppendResearchEventInput = {
  event_id?: string
  type: string
  actor: ResearchActor
  payload?: ResearchMetadata
  created_at?: string
}

export type ResearchRunStatusSnapshot = {
  run: ResearchRun
  run_dir: string
  state: ResearchRuntimeState
  counts: {
    events: number
    artifacts: number
    sources: number
    tool_traces: number
    claims: number
    drafts: number
    reviews: number
    exports: number
    checkpoints: number
  }
  artifact_versions: ResearchArtifactVersionSummary[]
}

export type ResearchArtifactVersionSummary = {
  logical_path: string
  latest_artifact_id: string
  latest_path: string
  latest_sha256?: string
  versions: number
  locked: boolean
  superseded_artifact_ids: string[]
}

type JsonlKind = Exclude<ResearchContractKind, "run">

const JSONL_KIND_TO_FILE: Record<JsonlKind, string> = {
  event: storageFacts.events,
  artifact: storageFacts.artifacts,
  source: storageFacts.sources,
  tool_trace: storageFacts.tool_traces,
  claim: storageFacts.claims,
  draft: storageFacts.drafts,
  review: storageFacts.reviews,
  export: storageFacts.exports,
  checkpoint: storageFacts.checkpoints,
}

const EMPTY_JSONL_FACTS = Object.values(JSONL_KIND_TO_FILE)

const TERMINAL_STATUSES = new Set<ResearchRunStatus>(["succeeded", "failed", "cancelled"])

function nowIso(options?: ResearchRuntimeOptions) {
  return (options?.clock?.() ?? new Date()).toISOString()
}

export function nextResearchId(kind: "run" | "event" | "artifact", options?: ResearchRuntimeOptions) {
  return options?.idFactory?.(kind) ?? `${kind}-${randomUUID()}`
}

async function nextUniqueResearchRunId(root: string, input: CreateResearchRunInput, options?: ResearchRuntimeOptions) {
  const existing = new Set((await discoverRunDirs({ workspace: options?.workspace, home: options?.home })).map((runDir) => path.basename(runDir)))
  const available = (runId: string) => {
    const runDir = runDirectoryPath(root, runId)
    return !existsSync(runDir) && !existing.has(path.basename(runDir))
  }
  if (input.run_id && available(input.run_id)) return input.run_id
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = input.run_id ? `${input.run_id}-${attempt + 1}` : nextResearchId("run", options)
    if (available(candidate)) return candidate
  }
  return `run-${randomUUID()}`
}

async function nextUniqueResearchEventId(runDir: string, options?: ResearchRuntimeOptions) {
  const existing = new Set((await readJsonlFacts(runDir, "event")).map((event) => event.event_id))
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = nextResearchId("event", options)
    if (!existing.has(candidate)) return candidate
  }
  return `event-${randomUUID()}`
}

export function runFilePath(runDir: string) {
  return path.join(runDir, storageFacts.run)
}

export function factFilePath(runDir: string, kind: JsonlKind) {
  return path.join(runDir, JSONL_KIND_TO_FILE[kind])
}

async function initializeFactFiles(runDir: string) {
  await mkdir(runDir, { recursive: true })
  await mkdir(path.join(runDir, "artifacts"), { recursive: true })
  for (const file of EMPTY_JSONL_FACTS) {
    await Bun.write(path.join(runDir, file), "")
  }
}

async function writeRun(runDir: string, run: ResearchRun) {
  await writeJsonAtomic(runFilePath(runDir), validate("run", run))
}

export async function loadResearchRun(runDir: string) {
  return validate("run", JSON.parse(await readFile(runFilePath(runDir), "utf8")) as unknown)
}

export async function readJsonlFacts<K extends JsonlKind>(runDir: string, kind: K): Promise<ResearchContractByKind[K][]> {
  const file = factFilePath(runDir, kind)
  const text = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return ""
    throw error
  })
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => validate(kind, JSON.parse(line) as unknown))
}

export async function appendResearchFact<K extends JsonlKind>(
  runDir: string,
  kind: K,
  value: ResearchContractByKind[K],
) {
  const checked = validate(kind, value)
  await appendFile(factFilePath(runDir, kind), `${JSON.stringify(checked)}\n`)
  return checked
}

export async function refreshResearchIndexes(runDir: string, options?: ResearchPathOptions) {
  return withSpan(
    "research.runtime.index_refresh",
    {
      "paper_fucker.research.run_dir": runDir,
    },
    async (span) => {
      const run = await loadResearchRun(runDir)
      const runSummary = await rebuildRunIndex(runDir)
      const runDirs = await discoverRunDirs({
        workspace: options?.workspace ?? run.workspace,
        home: options?.home,
      })
      const normalizedRunDir = path.resolve(runDir).toLowerCase()
      const seenRunDirs = new Set(runDirs.map((item) => path.resolve(item).toLowerCase()))
      if (!seenRunDirs.has(normalizedRunDir)) runDirs.push(runDir)
      const global_index_path = await rebuildGlobalIndex(runDirs, { home: options?.home })
      span.setAttribute("paper_fucker.research.run_id", run.run_id)
      span.setAttribute("paper_fucker.research.global_index.path", global_index_path)
      return { run_index_path: runSummary.run_index_path, global_index_path }
    },
  )
}

export async function appendResearchEvent(
  runDir: string,
  input: AppendResearchEventInput,
  options?: ResearchRuntimeOptions & { refresh_indexes?: boolean },
) {
  return withSpan(
    "research.runtime.event_append",
    {
      "paper_fucker.research.run_dir": runDir,
      "paper_fucker.research.event.type": input.type,
    },
    async (span) => {
      const run = await loadResearchRun(runDir)
      const createdAt = input.created_at ?? nowIso(options)
      const event = await appendResearchFact(runDir, "event", {
        schema_version: RESEARCH_SCHEMA_VERSION,
        event_id: input.event_id ?? (await nextUniqueResearchEventId(runDir, options)),
        run_id: run.run_id,
        type: input.type,
        created_at: createdAt,
        actor: input.actor,
        payload: input.payload ?? {},
      })
      await writeRun(runDir, { ...run, updated_at: createdAt })
      span.setAttribute("paper_fucker.research.run_id", run.run_id)
      span.setAttribute("paper_fucker.research.event_id", event.event_id)
      if (options?.refresh_indexes !== false) await refreshResearchIndexes(runDir, options)
      return event
    },
  )
}

export async function createResearchRun(
  input: CreateResearchRunInput,
  options?: ResearchRuntimeOptions,
): Promise<ResearchRunHandle> {
  return withSpan(
    "research.runtime.run_create",
    {
      "paper_fucker.research.topic": input.topic,
    },
    async (span) => {
      const createdAt = nowIso(options)
      const workspace = path.resolve(input.workspace ?? options?.workspace ?? process.cwd())
      const runRoot = await chooseRunRoot({ workspace, home: options?.home, storage_scope: input.storage_scope })
      const runId = await nextUniqueResearchRunId(runRoot.root, input, { ...options, workspace })
      const runDir = runDirectoryPath(runRoot.root, runId)
      await initializeFactFiles(runDir)

      const run: ResearchRun = {
        schema_version: RESEARCH_SCHEMA_VERSION,
        run_id: runId,
        topic: input.topic,
        workspace,
        status: "running",
        created_at: createdAt,
        updated_at: createdAt,
        storage: defaultStorageLayout,
        metadata: {
          ...(input.metadata ?? {}),
          runtime: {
            storage_scope: runRoot.scope,
            run_dir: runDir,
          },
        },
      }
      const state = createRuntimeState({
        run_id: runId,
        storage_scope: runRoot.scope,
        permission: input.permission,
        budget: input.budget,
        now: createdAt,
      })
      await writeRun(runDir, run)
      await saveRuntimeState(runDir, state)
      await appendResearchEvent(
        runDir,
        {
          type: "run.created",
          actor: "system",
          created_at: createdAt,
          payload: {
            topic: input.topic,
            storage_scope: runRoot.scope,
          },
        },
        { ...options, refresh_indexes: false },
      )
      await refreshResearchIndexes(runDir, { workspace, home: options?.home })
      span.setAttribute("paper_fucker.research.run_id", runId)
      span.setAttribute("paper_fucker.research.run_dir", runDir)
      span.setAttribute("paper_fucker.research.storage_scope", runRoot.scope)
      return {
        run: await loadResearchRun(runDir),
        run_dir: runDir,
        storage_scope: runRoot.scope,
        state: await loadRuntimeState(runDir),
      }
    },
  )
}

export async function updateResearchRunStatus(
  runDir: string,
  status: ResearchRunStatus,
  options?: ResearchRuntimeOptions,
) {
  return withSpan(
    "research.runtime.run_status_update",
    {
      "paper_fucker.research.run_dir": runDir,
      "paper_fucker.research.run.status": status,
    },
    async () => {
      const updatedAt = nowIso(options)
      const run = await loadResearchRun(runDir)
      await writeRun(runDir, { ...run, status, updated_at: updatedAt })
      await appendResearchEvent(
        runDir,
        {
          type: "run.status.changed",
          actor: "system",
          created_at: updatedAt,
          payload: { status },
        },
        options,
      )
      return loadResearchRun(runDir)
    },
  )
}

export async function resumeResearchRun(runDir: string, options?: ResearchRuntimeOptions) {
  return withSpan(
    "research.runtime.run_resume",
    {
      "paper_fucker.research.run_dir": runDir,
    },
    async () => {
      const run = await loadResearchRun(runDir)
      const status = TERMINAL_STATUSES.has(run.status) ? run.status : "running"
      if (status !== run.status) await writeRun(runDir, { ...run, status, updated_at: nowIso(options) })
      await appendResearchEvent(
        runDir,
        {
          type: "run.resumed",
          actor: "system",
          payload: { status },
        },
        options,
      )
      return getResearchRunStatus(runDir)
    },
  )
}

function artifactLogicalPath(artifact: ResearchArtifact) {
  const value = artifact.metadata?.logical_path
  return typeof value === "string" ? value : artifact.path
}

function artifactVersion(artifact: ResearchArtifact) {
  const value = artifact.metadata?.version
  return typeof value === "number" ? value : 1
}

function artifactLocked(artifact: ResearchArtifact) {
  return artifact.metadata?.locked === true
}

export function summarizeArtifactVersions(artifacts: ResearchArtifact[]) {
  const groups = new Map<string, ResearchArtifact[]>()
  for (const artifact of artifacts) {
    const logicalPath = artifactLogicalPath(artifact)
    groups.set(logicalPath, [...(groups.get(logicalPath) ?? []), artifact])
  }
  return Array.from(groups.entries()).map(([logicalPath, versions]) => {
    const sorted = versions.toSorted((left, right) => artifactVersion(left) - artifactVersion(right))
    const latest = sorted[sorted.length - 1]!
    return {
      logical_path: logicalPath,
      latest_artifact_id: latest.artifact_id,
      latest_path: latest.path,
      latest_sha256: latest.sha256,
      versions: sorted.length,
      locked: artifactLocked(latest),
      superseded_artifact_ids: sorted.slice(0, -1).map((artifact) => artifact.artifact_id),
    }
  })
}

export async function getResearchRunStatus(runDir: string): Promise<ResearchRunStatusSnapshot> {
  return withSpan(
    "research.runtime.run_status",
    {
      "paper_fucker.research.run_dir": runDir,
    },
    async (span) => {
      const [
        run,
        state,
        events,
        artifacts,
        sources,
        toolTraces,
        claims,
        drafts,
        reviews,
        exports,
        checkpoints,
      ] = await Promise.all([
        loadResearchRun(runDir),
        loadRuntimeState(runDir),
        readJsonlFacts(runDir, "event"),
        readJsonlFacts(runDir, "artifact"),
        readJsonlFacts(runDir, "source"),
        readJsonlFacts(runDir, "tool_trace"),
        readJsonlFacts(runDir, "claim"),
        readJsonlFacts(runDir, "draft"),
        readJsonlFacts(runDir, "review"),
        readJsonlFacts(runDir, "export"),
        readJsonlFacts(runDir, "checkpoint"),
      ])
      span.setAttribute("paper_fucker.research.run_id", run.run_id)
      span.setAttribute("paper_fucker.research.events.count", events.length)
      span.setAttribute("paper_fucker.research.artifacts.count", artifacts.length)
      return {
        run,
        run_dir: runDir,
        state,
        counts: {
          events: events.length,
          artifacts: artifacts.length,
          sources: sources.length,
          tool_traces: toolTraces.length,
          claims: claims.length,
          drafts: drafts.length,
          reviews: reviews.length,
          exports: exports.length,
          checkpoints: checkpoints.length,
        },
        artifact_versions: summarizeArtifactVersions(artifacts),
      }
    },
  )
}

export async function recordResearchCost(runDir: string, usage: ResearchCostUsage, options?: ResearchRuntimeOptions) {
  return withSpan(
    "research.runtime.cost_record",
    {
      "paper_fucker.research.run_dir": runDir,
      "paper_fucker.research.cost.llm_usd": usage.llm_usd ?? 0,
      "paper_fucker.research.cost.api_usd": usage.api_usd ?? 0,
    },
    async () => {
      const updatedAt = nowIso(options)
      const previous = await loadRuntimeState(runDir)
      const state = await updateRuntimeState(runDir, (current) => ({
        ...current,
        cost: applyCostUsage(current.cost, usage, updatedAt),
        updated_at: updatedAt,
      }))
      await appendResearchEvent(
        runDir,
        {
          type: "cost.recorded",
          actor: "system",
          created_at: updatedAt,
          payload: {
            usage,
            cost: state.cost,
          },
        },
        { ...options, refresh_indexes: false },
      )
      for (const alert of state.cost.alerts.slice(previous.cost.alerts.length)) {
        await appendResearchEvent(
          runDir,
          {
            type: "budget.alert",
            actor: "system",
            created_at: alert.created_at,
            payload: alert,
          },
          { ...options, refresh_indexes: false },
        )
      }
      await refreshResearchIndexes(runDir, options)
      return state.cost
    },
  )
}

export async function setResearchFinalGate(
  runDir: string,
  gate: Pick<ResearchFinalGateState, "status"> & Partial<Pick<ResearchFinalGateState, "blockers">>,
  options?: ResearchRuntimeOptions,
) {
  return withSpan(
    "research.runtime.final_gate_update",
    {
      "paper_fucker.research.run_dir": runDir,
      "paper_fucker.research.final_gate.status": gate.status,
    },
    async () => {
      const updatedAt = nowIso(options)
      const state = await updateRuntimeState(runDir, (current) => ({
        ...current,
        final_gate: {
          status: gate.status,
          blockers: gate.blockers ?? [],
          updated_at: updatedAt,
        },
        updated_at: updatedAt,
      }))
      await appendResearchEvent(
        runDir,
        {
          type: "finalgate.updated",
          actor: "system",
          created_at: updatedAt,
          payload: state.final_gate,
        },
        options,
      )
      return state.final_gate
    },
  )
}
