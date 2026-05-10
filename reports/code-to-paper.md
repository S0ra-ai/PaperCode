# Code To Paper

> Historical path note: this report predates task-032. Any `packages/server` or `@paper-fucker/server` paths below are provenance only; the current paper_fucker runtime authority is `packages/opencode/src/paper`, and `packages/server` is intentionally absent.

Version: 0.1.24-dev

Task: `task-027-code-to-paper`

## Summary

paper_fucker can now turn code paths into source-grounded paper artifacts. The implementation is deliberately conservative: every extracted method, test, and reproduction command is tied to a concrete source range.

## Implemented

- Added `CodebaseMap.v1`.
- Added `MethodExtraction.v1`.
- Added `ExperimentSurface.v1`.
- Added `ReproductionPlan.v1`.
- Added static file collection for configured code paths.
- Added exported TypeScript function and class extraction.
- Added test file and package script discovery.
- Added runtime artifact recording for all four artifacts.
- Ensured artifact recording writes sequentially to avoid concurrent `run.json` updates on Windows.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/server test test/paper/code-to-paper.test.ts`
  - Result: 2 pass, 0 fail, 7 expects.

Further repository verification is recorded in the TaskFlow step log.
