# Automatic Orchestrator Smoke Report

> Historical path note: this report predates task-032. Any `packages/server` or `@papercode/server` paths below are provenance only; the current papercode runtime authority is `packages/opencode/src/paper`, and `packages/server` is intentionally absent.

Date: 2026-05-09
TaskFlow task: `task-009-auto-orchestrator`
Version: `0.1.9-dev`

## Implemented

- Added a first-party automatic stage graph under `packages/server/src/research/orchestrator`.
- Stages run in this order: intake, template, literature, data, experiment, writing, verification, export.
- Each stage is a checkpoint and may emit an artifact payload schema hint such as `TemplateSpec.v1`, `LiteratureMap.v1`, or `ExportBundle.v1`.
- Full Access policy proceeds automatically except on safety, authenticity, cost anomaly, missing external tool, license/source conflict, low confidence, manual pause, or stage failure.
- TUI guidance is stored as a `GuidanceQueue.v1` artifact and applied at the next eligible checkpoint.
- Run controls are exposed as a stable list: observe, pause, stop, resume, rollback, diagnostics, cost, tools, models, template, preview, export.
- The orchestrator emits `preview.start_requested` so the read-only preview can follow automatic runs.

## Verification

- `packages/server/test/research/orchestrator.test.ts` covers full automatic stage execution, guidance application, preview startup event, policy pause, and control event emission.

## Boundaries

The orchestrator uses handler injection for downstream stage implementations. Template, literature/data, experiment, writing, verification, and export logic are implemented by later TaskFlow tasks and remain first-party modules rather than OpenCode package internals.
