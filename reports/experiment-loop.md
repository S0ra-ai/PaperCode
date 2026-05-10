# Experiment Loop Verification

> Historical path note: this report predates task-032. Any `packages/server` or `@paper-fucker/server` paths below are provenance only; the current paper_fucker runtime authority is `packages/opencode/src/paper`, and `packages/server` is intentionally absent.

TaskFlow task: `task-012-experiment-loop`
Version: `0.1.12-dev`
Date: `2026/05/09`

## Scope

- Added first-party experiment loop boundaries under `packages/server/src/research/experiments/`.
- Added `ExperimentPlan.v1`, `ExperimentRun.v1`, and `ResultReport.v1` payload schemas.
- Planned proposed method, three baselines, and a key ablation for CS/AI experimental papers.
- Implemented host exploration with an injected command/tool runner abstraction.
- Implemented container reproduction as the final-claim gate.

## Verification Scenarios

- Successful proposed/baseline/ablation host runs plus container reproduction allow final claims.
- Proposed method below the best baseline returns a revise recommendation.
- Environment failures are classified separately from method failures.
- Resource exceeded failures are blocking.
- Failed container reproduction blocks final claims.

## Commands

```powershell
npx --yes bun@1.3.13 --cwd packages/server test test/research/experiments.test.ts
npx --yes bun@1.3.13 run --cwd packages/server typecheck
```
