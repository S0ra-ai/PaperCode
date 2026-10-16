# Project Structure Cleanup Report

> Historical path note: this report predates task-032. Any `packages/server` or `@papercode/server` paths below are provenance only; the current papercode runtime authority is `packages/opencode/src/paper`, and `packages/server` is intentionally absent.

TaskFlow task: `task-019-project-structure-cleanup`
Version: `0.1.16-dev`
Date: `2026/05/09`

## Scope

- Kept the repository root focused on papercode project files.
- Moved 21 localized OpenCode README files from the root into `upstream/opencode-readmes/` with `git mv`.
- Preserved upstream provenance with `upstream/opencode-readmes/README.md`.
- Added `packages/server/src/research/README.md` to define first-party research runtime boundaries.
- Updated root `README.md` project structure so new papercode domain logic lands under first-party runtime modules, not `packages/opencode`.

## Verification

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-readme-version.ps1
npx --yes bun@1.3.13 run --cwd packages/server typecheck
Get-ChildItem -File README.*.md
```

Expected root README structure: no localized `README.*.md` files remain at the root; the authoritative root README remains `README.md`.
