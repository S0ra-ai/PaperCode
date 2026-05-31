# Pre-release Readiness Report

- Generated: 2026-05-11
- Branch: `feature/pre-release-readiness`
- Scope: release readiness before creating `release/0.8.5`
- Release action: none. No release branch, tag, or `main` operation is part of this readiness pass.

## Findings

- TaskFlow project-router binding for `paper_fucker` is valid and points at `E:\Project\paper_fucker\.plan`.
- Root `CHANGELOG` had 983 lines and mixed active 0.8.x entries with older 0.1.x to 0.7.x history.
- Root documentation still used `paper_fucker` as the top-level public brand instead of `PaperCode`.
- Live preview exists as a real package: `packages/preview` serves token-checked read-only snapshot and SSE endpoints, and `packages/opencode/src/paper/preview.ts` binds PaperRun drafts, export artifacts, annotations, costs, tools, and agents into `PreviewSnapshot`.
- Automatic browser opening is covered by `pre-release-live-preview-audit`: `/paper/runs/:runID/preview` now starts a token-protected localhost preview server and the TUI dashboard opens the returned URL once a run is preview-ready.

## Actions

- Split current changelog history so root `CHANGELOG` keeps 0.8.x only.
- Archived 0.1.x through 0.7.x colon-history entries under `docs/changelog/v0/`.
- Rewrote README around PaperCode as the public brand and documented the release-readiness versus release-branch boundary.
- Added `docs/project-structure.md` and `docs/changelog/README.md` as stable directory and archive entrypoints.
- Updated preview HTML/test copy and PaperRun HTTP API descriptions to use `PaperCode` for user-visible product surfaces.
- Added top-level `paper_fucker init [action]`, including `doctor` and backup-first `reset --scope all --backup --yes` for clean provider retesting.
- Added `scripts/provider-matrix-smoke.ps1` to generate `reports/provider-matrix-smoke.md` from configured providers without printing API keys.

## Acceptance Notes

- `CHANGELOG` is still the only current version source.
- Historical changelog archives are provenance only.
- `.paper_fucker/local/` and `.paper_fucker/runs/` remain ignored local state; tracked `.paper_fucker` assets are product assets and must not be deleted by reset.
- Pre-release readiness does not create tags. RC or final tags happen only after explicit release confirmation.
