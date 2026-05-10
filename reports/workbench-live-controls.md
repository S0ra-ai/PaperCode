# Workbench Live Controls

Version: 0.3.4-dev  
Work commit: 30479e1  
Date: 2026/05/10

## Summary

The Chinese PaperRun TUI dashboard now exposes live controls instead of static labels. It can present guidance, resume, retry, cancel, preview, final export, forced draft export, capability health, and model-role visibility as renderer-independent state backed by PaperRun HTTP APIs.

## Implemented

- Added `PaperWorkbenchControl` state with method, endpoint, enabled/disabled state, payload, danger flag, and action kind.
- Added API helpers for:
  - `/paper/runs/:runID/guidance`
  - `/paper/runs/:runID/control`
  - `/paper/runs/:runID/preview`
  - `/paper/runs/:runID/export`
  - `/paper/capabilities`
  - `/paper/model-roles`
  - `/paper/doctor`
- Added dashboard projections for durable controller status, pending guidance count, model role labels, provider/model ids, MCP health, skill health, and toolchain health.
- Updated the Solid TUI route to fetch capabilities and doctor diagnostics, then render controller status, action availability, model roles, and MCP/Skill/toolchain health in Chinese.
- Kept dashboard state compatible with older snapshots that do not yet contain `controller_state` or `diagnostics.model_roles`.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/opencode test test/cli/tui/paper-workbench.test.ts test/cli/tui/paper-workbench-controls.test.ts`
  - Result: 5 pass, 0 fail, 38 expects.
- `npx --yes bun@1.3.13 run --cwd packages/opencode typecheck`
  - Result: passed.

## Notes

This task makes the TUI workbench operational for normal run steering. The next expected improvement is deeper export rendering and preview/export file materialization, which belongs to the export renderer pipeline task.
