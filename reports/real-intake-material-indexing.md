# Real Intake Material Indexing Report

Version: 0.3.3-dev

Work commit: 11d1042

Generated: 2026-05-10

## Summary

PaperRun intake now creates a real `MaterialIndex.v1` from user-supplied code paths, paper files, dataset paths, and experiment logs. Indexed items are written into run artifacts and the Source Ledger with source ranges when text is available.

## Implemented

- Workspace-safe path containment for material inputs.
- Recursive indexing for code directories.
- Source ranges for text files.
- MIME, byte size, sha256, preview, and source id metadata.
- Secret-like path filtering for `.env`, API key, and secret names.
- Ignored path filtering for `.git` and `node_modules`.
- Unsupported binary skip handling.
- `recordMaterialIndex()` writes a `MaterialIndex.v1` artifact and Source Ledger entries.
- Default PaperRun intake stage records material index artifacts before later stages run.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/material-index.test.ts`
  - Passed: 2 pass, 0 fail, 11 expects.
- `npx --yes bun@1.3.13 run --cwd packages/opencode typecheck`
  - Passed.

## Remaining Work

PDF and DOCX are classified and tracked as supported binary paper files, but deep text extraction is left to the Python/tool bridge and follow-up material parsing work. Later tasks will expose these indexed materials in live TUI controls and export/preview diagnostics.
