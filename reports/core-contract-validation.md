# Core Contract Validation Report

> Historical path note: this report predates task-032. Any `packages/server` or `@papercode/server` paths below are provenance only; the current papercode runtime authority is `packages/opencode/src/paper`, and `packages/server` is intentionally absent.

Date: 2026-05-08
Branch: feature/core-research-contracts
TaskFlow task: task-017-core-contract

## Scope

- Created `schemas/research/v1.schema.json` as the JSON Schema source of truth for research run facts, event envelopes, artifacts, sources, tool traces, claims, drafts, reviews, exports, and checkpoints.
- Created `@papercode/server` under `packages/server` as the first-party papercode server/runtime package. New research runtime code now lives outside the imported OpenCode package.
- Added generated TypeScript contract types under `packages/server/src/research/generated/`.
- Added generated Pydantic v2 contract models under `research-tools/src/papercode_tools/generated/`.
- Added AJV 2020 runtime validation, explicit schema-version migration failures, JSON/JSONL fact loading, run-local `index.sqlite` rebuild, and global `~/.papercode/index.sqlite` rebuild.
- Added OpenTelemetry API integration through `packages/server/src/research/telemetry.ts`; validation and index rebuild operations now emit `papercode.research` spans when an OTEL tracer provider is configured.

## Storage Contract

- JSON/JSONL files remain the fact source:
  - `run.json`
  - `events.jsonl`
  - `artifacts.jsonl`
  - `sources.jsonl`
  - `tool-traces.jsonl`
  - `claims.jsonl`
  - `drafts.jsonl`
  - `reviews.jsonl`
  - `exports.jsonl`
  - `checkpoints.jsonl`
- Run-local SQLite indexes are rebuildable at `index.sqlite`.
- The global index is rebuildable at `~/.papercode/index.sqlite`.
- SQLite files are derived indexes, not authoritative facts.

## Validation

- `npx --yes bun@1.3.13 install` passed and updated the workspace lockfile.
- `npx --yes bun@1.3.13 run --cwd packages/server typecheck` passed.
- `npx --yes bun@1.3.13 --cwd packages/server test test/research/contracts.test.ts` passed: 3 pass, 0 fail.
- `PYTHONPATH=research-tools/src python -c "from papercode_tools.generated import ResearchRun, RESEARCH_SCHEMA_VERSION; ..."` passed with Pydantic 2.11.3.
- `npx --yes bun@1.3.13 run typecheck` passed across the workspace: 13 successful tasks.

## Compatibility Boundary

- `packages/opencode` remains the upstream-derived CLI/agent substrate during migration.
- New papercode domain contracts and server-side runtime code belong in `packages/server`.
- Future adapters may import from `@papercode/server`; new domain code should not be added to `packages/opencode` unless it is explicitly compatibility glue.
