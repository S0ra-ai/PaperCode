import { mkdir, readFile, rename, writeFile } from "fs/promises"
import path from "path"
import { RESEARCH_SCHEMA_VERSION, type ResearchSchemaVersion } from "../contracts"
import {
  createCostState,
  createPermissionState,
  detectResourceSnapshot,
  type ResearchCostBudget,
  type ResearchCostState,
  type ResearchPermissionInput,
  type ResearchPermissionState,
  type ResearchResourceSnapshot,
} from "./policy"
import type { ResearchStorageScope } from "./paths"

export const RUNTIME_STATE_FILE = "runtime-state.json"

export type ResearchFinalGateState = {
  status: "open" | "passed" | "blocked"
  blockers: string[]
  updated_at: string
}

export type ResearchRuntimeState = {
  schema_version: ResearchSchemaVersion
  run_id: string
  storage_scope: ResearchStorageScope
  permissions: ResearchPermissionState
  resources: ResearchResourceSnapshot
  cost: ResearchCostState
  final_gate: ResearchFinalGateState
  updated_at: string
}

export type CreateRuntimeStateInput = {
  run_id: string
  storage_scope: ResearchStorageScope
  permission?: ResearchPermissionInput
  budget?: ResearchCostBudget
  now: string
}

export async function writeJsonAtomic(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`)
  await rename(tmp, file)
}

export async function readJsonFile<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T
}

export function runtimeStatePath(runDir: string) {
  return path.join(runDir, RUNTIME_STATE_FILE)
}

export function createRuntimeState(input: CreateRuntimeStateInput): ResearchRuntimeState {
  return {
    schema_version: RESEARCH_SCHEMA_VERSION,
    run_id: input.run_id,
    storage_scope: input.storage_scope,
    permissions: createPermissionState(input.permission, input.now),
    resources: detectResourceSnapshot(input.now),
    cost: createCostState(input.budget),
    final_gate: {
      status: "open",
      blockers: [],
      updated_at: input.now,
    },
    updated_at: input.now,
  }
}

export async function loadRuntimeState(runDir: string) {
  return readJsonFile<ResearchRuntimeState>(runtimeStatePath(runDir))
}

export async function saveRuntimeState(runDir: string, state: ResearchRuntimeState) {
  await writeJsonAtomic(runtimeStatePath(runDir), state)
}

export async function updateRuntimeState(
  runDir: string,
  update: (state: ResearchRuntimeState) => ResearchRuntimeState,
) {
  const next = update(await loadRuntimeState(runDir))
  await saveRuntimeState(runDir, next)
  return next
}
