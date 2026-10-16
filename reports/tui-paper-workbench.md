# TUI Paper Workbench Report

> Historical path note: this report predates task-032. Any `packages/server` or `@papercode/server` paths below are provenance only; the current papercode runtime authority is `packages/opencode/src/paper`, and `packages/server` is intentionally absent.

- Task: `task-029-tui-paper-workbench`
- Version: `0.1.26-dev`
- Branch: `feature/tui-paper-workbench`
- Date: `2026-05-09`

## Scope

This task moves the OpenCode-derived TUI toward a papercode research workbench instead of a generic chat home screen.

## Implemented

- Added `TuiPaperWorkbenchState.v1` for the Chinese home workbench state.
- Added `TuiResearchRunState.v1` for renderer-independent run view state mapping.
- Mapped the paper stage graph into Chinese stage labels and status labels.
- Added standard run panels for stage graph, events, Source Ledger, Claim Ledger, experiment status, and model/tool/cost diagnostics.
- Added run controls for pause, resume, preview, export, and capability installation.
- Updated OpenCode TUI home placeholders to accept paper topics, code paths, paper materials, datasets, and experiment logs.
- Added first-screen `papercode 论文工作台` signal while preserving plugin slots and prompt behavior.
- Updated README and colon-history CHANGELOG to version `0.1.26-dev`.

## Notes

- The current TUI change exposes the workbench state and first-screen entry points.
- Deeper run-page interaction, live preview binding, revision controls, and final export gating are owned by `task-030-paper-authoring-loop`.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/server test test/paper/tui-state.test.ts`
  - Passed: 2 pass, 0 fail, 8 expects.
- Full typecheck, README/CHANGELOG version validation, and TaskFlow validation are recorded in the task step log and CHANGELOG verification block.

---

## Hard Fork PaperRun Route Update

- Task: `task-034-dialog-workbench-tui`
- Version: `0.2.3-dev`
- Branch: `feature/dialog-workbench-tui`
- Date: `2026-05-09`

### Scope

This task turns the default TUI home flow into a real PaperRun dialog workbench. It no longer treats the first prompt as an ordinary chat-session prompt; it parses the user's Chinese research request and creates a PaperRun through `/paper/runs`.

### Implemented

- Added `packages/opencode/src/cli/cmd/tui/routes/paper/workbench.ts` for prompt parsing, `/paper/runs` submission, PaperRun fetching, and dashboard state mapping.
- Added `packages/opencode/src/cli/cmd/tui/routes/paper/index.tsx` for the PaperRun dashboard route.
- Added `PaperRoute` to the route context and registered the route in the main TUI switch.
- Updated `Home` to submit prompts to `/paper/runs` and navigate to the PaperRun dashboard.
- Added `Prompt.onSubmitPrompt` interception so the home flow can bypass ordinary chat-session creation.
- Updated plugin current-route metadata so plugins can detect `paper` route context.
- Added tests for prompt parsing, `/paper/runs` submission, and Chinese dashboard panel state.

### Verification

- `npx --yes bun@1.3.13 --cwd packages/opencode test test/cli/tui/paper-workbench.test.ts`
  - Passed: 3 pass, 0 fail, 20 expects.
- `npx --yes bun@1.3.13 run --cwd packages/opencode typecheck`
  - Passed.
