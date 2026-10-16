import { createRequire } from "node:module"
import { mkdir, readFile } from "fs/promises"
import { existsSync } from "fs"
import os from "os"
import path from "path"
import {
  defaultStorageLayout,
  storageFacts,
  validate,
  type ResearchArtifact,
  type ResearchCheckpoint,
  type ResearchClaim,
  type ResearchContractKind,
  type ResearchDraft,
  type ResearchEvent,
  type ResearchExport,
  type ResearchRun,
  type ResearchReview,
  type ResearchSource,
  type ResearchToolTrace,
} from "./contracts"
import { withSpan } from "./telemetry"

export const RUN_INDEX_FILENAME = "index.sqlite"
export const GLOBAL_INDEX_FILENAME = "index.sqlite"

type JsonlKind = Exclude<ResearchContractKind, "run">
type SqliteDatabase = {
  exec(sql: string): unknown
  prepare(sql: string): { run(...values: unknown[]): unknown }
  close(): unknown
}

const require = createRequire(import.meta.url)

function openDatabase(filename: string): SqliteDatabase {
  if (typeof (globalThis as { Bun?: unknown }).Bun !== "undefined") {
    const { Database } = require("bun:sqlite") as { Database: new (path: string, options?: { create?: boolean }) => SqliteDatabase }
    return new Database(filename, { create: true })
  }
  const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => SqliteDatabase }
  return new DatabaseSync(filename)
}

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

type IndexedFacts = {
  run: ResearchRun
  events: ResearchEvent[]
  artifacts: ResearchArtifact[]
  sources: ResearchSource[]
  tool_traces: ResearchToolTrace[]
  claims: ResearchClaim[]
  drafts: ResearchDraft[]
  reviews: ResearchReview[]
  exports: ResearchExport[]
  checkpoints: ResearchCheckpoint[]
}

export type ResearchIndexSummary = {
  run_id: string
  run_index_path: string
  counts: Record<keyof Omit<IndexedFacts, "run">, number>
}

export function runIndexPath(runDir: string) {
  return path.join(runDir, RUN_INDEX_FILENAME)
}

function defaultHome() {
  return process.env.PAPERCODE_TEST_HOME ?? process.env.PAPERCODE_HOME ?? os.homedir()
}

export function globalIndexPath(home = defaultHome()) {
  return path.join(home, ".papercode", GLOBAL_INDEX_FILENAME)
}

async function readJson(file: string) {
  return JSON.parse(await readFile(file, "utf8")) as unknown
}

async function readJsonl(file: string) {
  if (!existsSync(file)) return []
  const text = await readFile(file, "utf8")
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown)
}

async function loadRunFacts(runDir: string): Promise<IndexedFacts> {
  const run = validate("run", await readJson(path.join(runDir, storageFacts.run)))
  const events = (await readJsonl(path.join(runDir, JSONL_KIND_TO_FILE.event))).map((item) => validate("event", item))
  const artifacts = (await readJsonl(path.join(runDir, JSONL_KIND_TO_FILE.artifact))).map((item) =>
    validate("artifact", item),
  )
  const sources = (await readJsonl(path.join(runDir, JSONL_KIND_TO_FILE.source))).map((item) => validate("source", item))
  const tool_traces = (await readJsonl(path.join(runDir, JSONL_KIND_TO_FILE.tool_trace))).map((item) =>
    validate("tool_trace", item),
  )
  const claims = (await readJsonl(path.join(runDir, JSONL_KIND_TO_FILE.claim))).map((item) => validate("claim", item))
  const drafts = (await readJsonl(path.join(runDir, JSONL_KIND_TO_FILE.draft))).map((item) => validate("draft", item))
  const reviews = (await readJsonl(path.join(runDir, JSONL_KIND_TO_FILE.review))).map((item) => validate("review", item))
  const exports = (await readJsonl(path.join(runDir, JSONL_KIND_TO_FILE.export))).map((item) => validate("export", item))
  const checkpoints = (await readJsonl(path.join(runDir, JSONL_KIND_TO_FILE.checkpoint))).map((item) =>
    validate("checkpoint", item),
  )

  return { run, events, artifacts, sources, tool_traces, claims, drafts, reviews, exports, checkpoints }
}

function createRunSchema(db: SqliteDatabase) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    DROP TABLE IF EXISTS meta;
    DROP TABLE IF EXISTS events;
    DROP TABLE IF EXISTS artifacts;
    DROP TABLE IF EXISTS sources;
    DROP TABLE IF EXISTS tool_traces;
    DROP TABLE IF EXISTS claims;
    DROP TABLE IF EXISTS drafts;
    DROP TABLE IF EXISTS reviews;
    DROP TABLE IF EXISTS exports;
    DROP TABLE IF EXISTS checkpoints;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE events (event_id TEXT PRIMARY KEY, type TEXT NOT NULL, created_at TEXT NOT NULL, payload_json TEXT NOT NULL);
    CREATE TABLE artifacts (artifact_id TEXT PRIMARY KEY, kind TEXT NOT NULL, path TEXT NOT NULL, created_at TEXT NOT NULL, payload_json TEXT NOT NULL);
    CREATE TABLE sources (source_id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, payload_json TEXT NOT NULL);
    CREATE TABLE tool_traces (trace_id TEXT PRIMARY KEY, tool_name TEXT NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL);
    CREATE TABLE claims (claim_id TEXT PRIMARY KEY, status TEXT NOT NULL, confidence REAL NOT NULL, payload_json TEXT NOT NULL);
    CREATE TABLE drafts (draft_id TEXT PRIMARY KEY, title TEXT NOT NULL, path TEXT NOT NULL, payload_json TEXT NOT NULL);
    CREATE TABLE reviews (review_id TEXT PRIMARY KEY, target_id TEXT NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL);
    CREATE TABLE exports (export_id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, path TEXT NOT NULL, payload_json TEXT NOT NULL);
    CREATE TABLE checkpoints (checkpoint_id TEXT PRIMARY KEY, stage TEXT NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL);
  `)
}

type SqlBinding = string | number | bigint | boolean | null | Uint8Array

/**
 * The fact files are append-only, so the same primary key can appear more than once: exporting a run
 * twice writes the same `export:<bundle>:<format>` ids again, because a bundle id is derived from the
 * mode and the draft. The index is a projection of those files and has to tolerate that - the row
 * that survives is the last one, which is the export whose files are actually on disk.
 */
function insertJson<T>(db: SqliteDatabase, table: string, columns: string[], rows: T[], values: (row: T) => SqlBinding[]) {
  const placeholders = columns.map(() => "?").join(", ")
  const statement = db.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`)
  for (const row of rows) statement.run(...values(row), JSON.stringify(row))
}

export async function rebuildRunIndex(runDir: string): Promise<ResearchIndexSummary> {
  return withSpan("research.index.rebuild_run", { "papercode.research.run_dir": runDir }, async (span) => {
    const facts = await loadRunFacts(runDir)
    const indexPath = runIndexPath(runDir)
    const db = openDatabase(indexPath)
    try {
      db.exec("PRAGMA busy_timeout = 30000;")
      createRunSchema(db)
      db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run("run", JSON.stringify(facts.run))
      db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run("storage", JSON.stringify(defaultStorageLayout))
      insertJson(db, "events", ["event_id", "type", "created_at", "payload_json"], facts.events, (row) => [
        row.event_id,
        row.type,
        row.created_at,
      ])
      insertJson(
        db,
        "artifacts",
        ["artifact_id", "kind", "path", "created_at", "payload_json"],
        facts.artifacts,
        (row) => [row.artifact_id, row.kind, row.path, row.created_at],
      )
      insertJson(db, "sources", ["source_id", "kind", "title", "payload_json"], facts.sources, (row) => [
        row.source_id,
        row.kind,
        row.title,
      ])
      insertJson(db, "tool_traces", ["trace_id", "tool_name", "status", "payload_json"], facts.tool_traces, (row) => [
        row.trace_id,
        row.tool_name,
        row.status,
      ])
      insertJson(db, "claims", ["claim_id", "status", "confidence", "payload_json"], facts.claims, (row) => [
        row.claim_id,
        row.status,
        row.confidence,
      ])
      insertJson(db, "drafts", ["draft_id", "title", "path", "payload_json"], facts.drafts, (row) => [
        row.draft_id,
        row.title,
        row.path,
      ])
      insertJson(db, "reviews", ["review_id", "target_id", "status", "payload_json"], facts.reviews, (row) => [
        row.review_id,
        row.target_id,
        row.status,
      ])
      insertJson(db, "exports", ["export_id", "draft_id", "path", "payload_json"], facts.exports, (row) => [
        row.export_id,
        row.draft_id,
        row.path,
      ])
      insertJson(db, "checkpoints", ["checkpoint_id", "stage", "status", "payload_json"], facts.checkpoints, (row) => [
        row.checkpoint_id,
        row.stage,
        row.status,
      ])
    } finally {
      db.close()
    }

    span.setAttribute("papercode.research.run_id", facts.run.run_id)
    span.setAttribute("papercode.research.index.path", indexPath)
    span.setAttribute("papercode.research.events.count", facts.events.length)
    span.setAttribute("papercode.research.artifacts.count", facts.artifacts.length)
    return {
      run_id: facts.run.run_id,
      run_index_path: indexPath,
      counts: {
        events: facts.events.length,
        artifacts: facts.artifacts.length,
        sources: facts.sources.length,
        tool_traces: facts.tool_traces.length,
        claims: facts.claims.length,
        drafts: facts.drafts.length,
        reviews: facts.reviews.length,
        exports: facts.exports.length,
        checkpoints: facts.checkpoints.length,
      },
    }
  })
}

export async function rebuildGlobalIndex(runDirs: string[], options?: { home?: string }) {
  return withSpan("research.index.rebuild_global", { "papercode.research.runs.count": runDirs.length }, async (span) => {
    const indexPath = globalIndexPath(options?.home)
    await mkdir(path.dirname(indexPath), { recursive: true })
    const runs: Array<{ run: ResearchRun; runDir: string }> = []
    const seenRunIds = new Set<string>()
    for (const runDir of runDirs) {
      const run = validate("run", await readJson(path.join(runDir, storageFacts.run)))
      if (seenRunIds.has(run.run_id)) continue
      seenRunIds.add(run.run_id)
      runs.push({ run, runDir })
    }
    const db = openDatabase(indexPath)
    try {
      db.exec("PRAGMA busy_timeout = 30000;")
      db.exec(`
        CREATE TABLE IF NOT EXISTS runs (
          run_id TEXT PRIMARY KEY,
          topic TEXT NOT NULL,
          workspace TEXT NOT NULL,
          status TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          run_dir TEXT NOT NULL
        );
      `)
      db.exec("BEGIN IMMEDIATE;")
      try {
        db.exec("DELETE FROM runs;")
        const insert = db.prepare(
          "INSERT INTO runs (run_id, topic, workspace, status, updated_at, run_dir) VALUES (?, ?, ?, ?, ?, ?)",
        )
        for (const item of runs) {
          insert.run(item.run.run_id, item.run.topic, item.run.workspace, item.run.status, item.run.updated_at, item.runDir)
        }
        db.exec("COMMIT;")
      } catch (error) {
        db.exec("ROLLBACK;")
        throw error
      }
    } finally {
      db.close()
    }
    span.setAttribute("papercode.research.global_index.path", indexPath)
    return indexPath
  })
}
