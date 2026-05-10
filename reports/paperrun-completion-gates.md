# PaperRun Completion Gate Alignment

- Task: `task-048-paperrun-completion-gates`
- Version target: `0.4.2-dev`
- Date: 2026-05-10
- Branch: `fix/paperrun-completion-gates`

## Result

PaperRun status projection now separates execution completion from paper eligibility:

- A run that finishes the full stage graph but fails the authenticity/final gate is projected as `blocked`, not `running`.
- The durable controller state reports `review_required` for completed-but-gate-blocked runs.
- The underlying research run may be persisted as `succeeded` when execution completed; the PaperRun snapshot remains blocked until the paper gate passes.
- `reproduction_failure` is reflected on the `reproduction` stage projection, so the stage graph no longer shows a successful reproduction stage while the final gate blocks on reproduction.

## Semantics

- `running`: work is still active or has pending/running stages.
- `blocked`: the PaperRun cannot produce a final export because a stage or final gate blocks it.
- `review_required`: the controller state for a completed run that needs evidence, reproduction, or user guidance before final export.
- `succeeded`: all stages completed and the final gate passed.
- `failed`: execution failed before a reviewable blocked paper state could be produced.
- `cancelled`: user/system cancelled the run.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/paperrun-execution.test.ts test/paper/paperrun-controller.test.ts test/cli/tui/paper-workbench-controls.test.ts`
- `npx --yes bun@1.3.13 run --cwd packages/opencode typecheck`

