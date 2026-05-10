# Default Observability Coverage

- Task: `task-050-default-observability-coverage`
- Version target: `0.4.4-dev`
- Date: 2026-05-10
- Branch: `fix/default-observability-coverage`

## Result

Default PaperRun execution now records complete observability audit coverage without tests or callers manually injecting audit events.

Automatic coverage includes:

- `stage`: derived from PaperRun stage events.
- `capability`: emitted for the default ResearchCapabilityRegistry.
- `model_role`: emitted for every resolved paper model role.
- `subagent`: emitted for the root run agent.
- `tool`: emitted through a default engine tool trace.
- `data_egress`: emitted from the intake data-egress policy and candidate paths.
- `export_renderer`: emitted by Markdown, LaTeX, PDF, and DOCX renderers.
- `cost`: emitted as a zero-cost baseline unless later model/tool usage updates it.

## Live Evidence

- Command: `npx --yes bun@1.3.13 scripts/live-paper-quality-benchmark.ts`.
- Latest summary: `tmp/live-paper-quality-benchmark/paperrun-summary.json` (ignored runtime output).
- Audit counts: `stage=28`, `capability=12`, `model_role=8`, `subagent=1`, `tool=1`, `data_egress=1`, `export_renderer=4`, `cost=1`.
- `missing_kinds`: empty.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/observability-audit.test.ts`
- `npx --yes bun@1.3.13 scripts/live-paper-quality-benchmark.ts`

