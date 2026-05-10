# PaperRun Execution Engine Report

Version: 0.3.1-dev

Work commit: e78a169

Generated: 2026-05-10

## Summary

PaperRun creation now drives the default paper stage engine. The product path no longer stops after creating run metadata and no longer depends on test-only handler injection for ordinary `/paper/runs` or TUI-created runs.

## Implemented

- `createPaperRun()` calls `startPaperResearchRun()` with the normalized intake request.
- Default concrete stage handlers now record planning, literature/data seed discovery, code-to-paper artifacts, experiment planning, failed reproduction diagnostics, ClaimLedger, draft, profile check, verification gate, preview/export artifacts, and controller snapshots.
- Run-scoped execution cache prevents repeated source/code/experiment/authoring work across adjacent stages.
- Missing or unreadable `code_paths` become a PaperRun blocked diagnostic instead of an HTTP 400 creation failure.
- PaperRun stage snapshots now treat `paperorchestrator.stage.completed` as a completed stage event.
- Runtime indexing is hardened against duplicate run directory and duplicate run id cases observed during repeated Windows index refreshes.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/paperrun-execution.test.ts`
  - Passed: 1 pass, 0 fail, 13 expects.
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/run-api.test.ts test/cli/tui/paper-workbench.test.ts test/paper/paperrun-execution.test.ts`
  - Passed: 5 pass, 0 fail, 56 expects.
- `npx --yes bun@1.3.13 run --cwd packages/opencode typecheck`
  - Passed.

## Remaining Work

The default engine is now real enough to create durable run facts and blocked/forced-draft artifacts, but it still uses deterministic local seed discovery and diagnostic experiment runners. Follow-up tasks `task-040` through `task-046` cover durable resume/control, real material indexing, live TUI controls, renderer pipeline hardening, observability/audit coverage, documentation path hygiene, and a live paper quality benchmark.
