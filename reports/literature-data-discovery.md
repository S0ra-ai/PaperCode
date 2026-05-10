# Literature/Data Discovery Verification

> Historical path note: this report predates task-032. Any `packages/server` or `@paper-fucker/server` paths below are provenance only; the current paper_fucker runtime authority is `packages/opencode/src/paper`, and `packages/server` is intentionally absent.

TaskFlow task: `task-011-literature-data`
Version: `0.1.11-dev`
Date: `2026/05/09`

## Scope

- Added first-party source discovery boundaries under `packages/server/src/research/sources/`.
- Added TypeScript payload schemas for `SourceRecord.v1`, `LiteratureMap.v1`, `DataPlan.v1`, `DatasetCard.v1`, and `DirectionFeasibility.v1`.
- Recorded open literature and dataset discovery as run `source` facts plus source snapshot/log artifacts.
- Implemented Full Access automatic nearby-direction turn when the original topic lacks open verified datasets.

## Verification Scenarios

- Sufficient verified literature plus open verified dataset records four source facts and feasible status.
- Missing dataset on the original topic turns to a nearby feasible direction with rollback metadata.
- Restricted dataset license produces `dataset_license_conflict` and pauses.
- Failed source verification remains in diagnostics and is excluded from sufficiency counts.

## Commands

```powershell
npx --yes bun@1.3.13 --cwd packages/server test test/research/sources.test.ts
npx --yes bun@1.3.13 run --cwd packages/server typecheck
```
