# PaperRun Resume Guidance Controller Report

Version: 0.3.2-dev

Work commit: 644922b

Generated: 2026-05-10

## Summary

PaperRun now has a durable controller layer. The controller records pause checkpoints, queued guidance, resume/retry/cancel controls, internal session references, and controller SSE state so users can steer a paper run through the API/TUI instead of issuing shell commands.

## Implemented

- Added `PaperRunController.v1` state under each run directory.
- Projected `controller_state` into `PaperRunSnapshot`.
- Synced controller checkpoints after PaperRun creation.
- Queued user guidance through `recordPaperRunGuidance()`.
- Added `controlPaperRun()` for `resume`, `retry`, and `cancel`; resume/retry mark queued guidance as applied.
- Added `/paper/runs/:runID/control`.
- Extended SSE output to include both `paper.run.snapshot` and `paper.run.controller`.
- Renamed runtime status events to `run.status.changed` to satisfy the research event contract.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/paperrun-controller.test.ts test/paper/run-api.test.ts`
  - Passed: 2 pass, 0 fail, 36 expects.
- `npx --yes bun@1.3.13 run --cwd packages/opencode typecheck`
  - Passed.

## Remaining Work

The controller persists state and API controls. The next tasks will add richer material indexing, TUI live controls, export renderer hardening, and observability/audit coverage.
