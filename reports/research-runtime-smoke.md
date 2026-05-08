# Research Runtime Smoke

Date: 2026-05-08
TaskFlow task: task-005-research-runtime
Branch: feature/research-runtime

## Scope

The authoritative paper_fucker research runtime now lives in `packages/server/src/research/runtime`.
It is intentionally first-party server/runtime code, not new domain code inside `packages/opencode`.
`packages/opencode` remains the upstream-derived agent/CLI substrate and future adapter surface.

## Implemented Runtime Surface

- `paths.ts`: workspace-first `<workspace>/.paper_fucker/runs/<run-id>` placement, `~/.paper_fucker/runs/<run-id>` fallback, run directory discovery, and relative artifact path safety.
- `run-store.ts`: run creation, run loading, resume, status snapshots, append-only event facts, run/global SQLite index refresh, cost recording, and final gate updates.
- `artifact-store.ts`: versioned artifact writes, stable normalized data hashing, supersedes metadata, locked artifact rejection, and artifact lifecycle events.
- `policy.ts`: Full Access + Unlimited Research default policy, bounded mode with 3h default and 24h cap, resource auto-detection, soft budget tracking, and budget alerts.
- `state.ts`: mutable runtime state in `runtime-state.json` for permissions, resources, cost, and final gate state.
- OpenTelemetry spans: runtime create/resume/status, event append, index refresh, artifact write, cost record, and final gate update all route through `paper_fucker.research` span helpers.

## Smoke Coverage

- Create a run in a workspace and verify:
  - `run.json`
  - `runtime-state.json`
  - JSONL fact files
  - run-local `index.sqlite`
  - global `~/.paper_fucker/index.sqlite`
- Resume and status APIs return current run state and fact counts.
- Artifact writes are append-only, hash normalized data, version repeated logical paths, and reject superseding a locked latest artifact.
- Permission/resource/cost/final gate state records:
  - bounded 3h mode
  - no manual command requirement for automatic runtime calls
  - CPU/memory/platform snapshot
  - soft budget alert event
  - blocked final gate state

## Verification

- `npx --yes bun@1.3.13 --cwd packages/server test test/research/runtime.test.ts`: passed, 3 pass, 0 fail, 28 expects.
- `npx --yes bun@1.3.13 --cwd packages/server test test/research/contracts.test.ts test/research/runtime.test.ts`: passed, 6 pass, 0 fail, 39 expects.
- `npx --yes bun@1.3.13 run --cwd packages/server typecheck`: passed.
- `npx --yes bun@1.3.13 run typecheck`: passed across workspace, 13 successful tasks.
