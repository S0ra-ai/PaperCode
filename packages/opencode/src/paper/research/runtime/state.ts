import { randomUUID } from "crypto"
import { mkdir, readFile, rename, rm, writeFile } from "fs/promises"
import path from "path"
import { setTimeout as sleep } from "timers/promises"
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

const ATOMIC_REPLACE_RETRY_CODES = new Set(["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"])
const ATOMIC_REPLACE_RETRY_DELAYS_MS = [10, 25, 50, 100, 200, 400]

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
  const tmp = `${file}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`)
  try {
    await renameWithRetry(tmp, file)
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw error
  }
}

function isRetryableAtomicReplaceError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""
  return ATOMIC_REPLACE_RETRY_CODES.has(code)
}

async function renameWithRetry(source: string, destination: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(source, destination)
      return
    } catch (error) {
      const delay = ATOMIC_REPLACE_RETRY_DELAYS_MS[attempt]
      if (delay === undefined || !isRetryableAtomicReplaceError(error)) throw error
      await sleep(delay)
    }
  }
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
