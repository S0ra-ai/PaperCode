# Export Bundles Report

TaskFlow task: `task-015-export-bundles`
Version: `0.1.15-dev`
Date: `2026/05/09`

## Scope

- Added first-party export boundaries under `packages/server/src/research/export/`.
- Added `ExportBundle.v1`, file manifest, final/forced status, verification summary, and renderer diagnostics.
- Implemented final export blocking when `final_gate.status` is not `passed`.
- Implemented forced draft export with visible Markdown banner and failed checks.
- Implemented Markdown/LaTeX/PDF/DOCX file manifest generation and export fact recording.

## Verification Scenarios

- Final gate passed produces Markdown, LaTeX, PDF, and DOCX file records.
- Failed final gate blocks final export.
- Forced draft export is allowed and clearly marked with failed checks.
- Missing PDF/DOCX renderers are recorded as diagnostics.
- Manifest includes source artifact refs and SHA-256 hashes.

## Commands

```powershell
npx --yes bun@1.3.13 --cwd packages/server test test/research/export.test.ts
npx --yes bun@1.3.13 run --cwd packages/server typecheck
```
