# Report Path Hygiene

Version: `0.3.7-dev`
TaskFlow task: `task-045-report-path-hygiene`
Branch: `feature/report-path-hygiene`
Date: `2026/05/10`

## Scope

This cleanup makes the post-hard-fork architecture unambiguous without rewriting historical evidence.

Current authority:

- Paper domain runtime: `packages/opencode/src/paper`
- OpenCode substrate: `packages/opencode`
- Python tool bridge: `research-tools`
- Preview/export UI: `packages/preview`
- Removed sidecar: `packages/server`

## Audit Result

`README.md`, `scripts/strict-acceptance.ps1`, and the hard-fork reports already describe the current state: `packages/opencode/src/paper` is authoritative and `packages/server` must not exist.

The stale references were concentrated in reports written before `task-032-opencode-paper-core-migration`. Those reports are still useful as provenance, but their original `packages/server` wording can look like current guidance when read alone.

## Updated Reports

The following pre-hard-fork reports now carry a top-level historical path note:

- `reports/architecture-reframe.md`
- `reports/code-to-paper.md`
- `reports/core-contract-validation.md`
- `reports/end-to-end-acceptance.md`
- `reports/experiment-loop.md`
- `reports/experiment-mcp-loop.md`
- `reports/export-bundles.md`
- `reports/init-diagnostics-smoke.md`
- `reports/literature-data-discovery.md`
- `reports/model-router.md`
- `reports/orchestrator-smoke.md`
- `reports/paper-authoring-loop.md`
- `reports/paper-profile-skills.md`
- `reports/phase-1-acceptance.md`
- `reports/preview-smoke.md`
- `reports/project-structure-cleanup.md`
- `reports/python-tool-bridge-smoke.md`
- `reports/real-orchestrator.md`
- `reports/research-intake.md`
- `reports/research-runtime-smoke.md`
- `reports/research-skill-mcp-bus.md`
- `reports/template-resolution.md`
- `reports/tui-paper-workbench.md`
- `reports/verification-gate.md`
- `reports/writing-claim-ledger.md`

The note states that any `packages/server` or `@papercode/server` paths are provenance only and that the current runtime authority is `packages/opencode/src/paper`.

## Intentionally Retained History

`CHANGELOG` and completed TaskFlow task logs were not rewritten. They contain real historical commit and verification records, so changing old paths there would reduce traceability.

The following current files may still mention `packages/server` by design:

- `README.md`: explains that historical reports may retain old paths and that `packages/server` is absent now.
- `reports/hard-fork-acceptance.md`: records the hard-fork acceptance condition that the former sidecar is absent.
- `reports/opencode-paper-core-migration.md`: records the migration from `@papercode/server`.
- `reports/strict-live-acceptance.md`: records strict acceptance evidence for the absent sidecar.
- `scripts/strict-acceptance.ps1`: asserts `packages/server` does not exist.

## Verification Policy

Future documentation should use `packages/opencode/src/paper` for current paper runtime references. If a report needs to mention `packages/server`, it must be either:

- a historical/provenance note,
- a migration note,
- or an explicit assertion that the sidecar is absent.
