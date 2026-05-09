# PaperRun API

## Summary

Implemented `task-033-paper-run-api` on `feature/paper-run-api`.

`PaperRun` is now the first-class state projection for user-visible paper workflows inside the OpenCode hard fork. The API is attached to the instance HttpApi surface under `/paper` and uses workspace-first research runtime storage.

## Changes

- Added `packages/opencode/src/paper/run.ts` with `PaperRun`, `PaperRunSnapshot`, `PaperRunEvent`, `PaperRunPauseQuestion`, `PaperRunGuidanceResponse`, `AgentTree`, `AgentNode`, `DataEgressPolicy`, budget tier, quality mode, preview state, and export bundle helpers.
- Added `/paper/runs` create/get routes.
- Added `/paper/runs/:id/events` SSE snapshot stream.
- Added `/paper/runs/:id/guidance`, `/preview`, and `/export` routes.
- Added `/paper/capabilities`, `/paper/doctor`, `/paper/providers/discover`, and `/paper/model-roles` diagnostics/configuration routes.
- Wired `PaperApi` and `paperHandlers` into `InstanceHttpApi` and the instance route layer.
- Added `packages/opencode/test/paper/run-api.test.ts` to cover the API lifecycle.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/run-api.test.ts`: passed, 1 pass, 0 fail, 23 expects.
- `npx --yes bun@1.3.13 run --cwd packages/opencode typecheck`: passed.
