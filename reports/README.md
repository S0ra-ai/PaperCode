# PaperCode Reports

This directory contains active verification and acceptance evidence for the current development line.

## Active Reports

- `strict-live-acceptance.md`: current focused strict live acceptance evidence. This report must include `Project version` and live benchmark `project_version` entries matching the root `CHANGELOG`.
- `autonomous-product-audit.md`: current product audit summary. It checks version sync, development docs, strict live evidence, public branding, Git Flow, and dangerous residue.
- `live-preview-browser-smoke.md`: latest browser-level Preview/SSE/read-only smoke evidence.

## Historical Reports

Old evidence that no longer matches the active project version should not stay in the active report slot. Move it under `reports/archive/` with the proven version in the filename.

The current audit intentionally treats a missing active full-workspace report as acceptable because focused strict live acceptance is the required milestone evidence. A new `reports/strict-live-full-acceptance.md` should only exist after rerunning `scripts/strict-acceptance.ps1 -FullWorkspaceSuite` for the current version.
