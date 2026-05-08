# Legacy Archive Manifest

Date: 2026-05-08

This archive preserves filtered reference snapshots for the new `paper_fucker`
OpenCode-derived product. These files are historical inputs only. They are not
the source of truth for the new implementation.

## Sources

- `E:\Project\IntelliGen`
  - Git branch: `rebuild`
  - Source commit: `a07d4b70d679`
  - Snapshot path: `legacy/intelligen-v3`
  - Snapshot files: 570
  - Source worktree was dirty at archive time; generated/cache changes were not
    treated as new product source.
- `E:\Project\Folio`
  - Git branch: `master`
  - Source commit: `76b4d5c265a6`
  - Snapshot path: `legacy/folio`
  - Snapshot files: 256
  - Git bundle: `legacy/folio.git.bundle`
  - Bundle size: 1,308,648 bytes
  - Source worktree was dirty at archive time; only a filtered snapshot and git
    bundle were recorded.

## Filter Policy

Included:

- Source code, docs, tests, plans, prompts, templates, examples, and meaningful
  reports or screenshots.
- Package metadata, lockfiles, `.env.example`, and project configuration that is
  useful for reconstruction or analysis.

Excluded:

- `.git`, real `.env`, `node_modules`, `.venv`, generated caches, pycache,
  test caches, Playwright MCP state, build/dist/site output, sandbox output,
  logs, nested archives, and database WAL/SHM files.

## Verification

- `legacy/folio.git.bundle` verifies successfully and records a complete Folio
  history.
- Required IntelliGen archive items exist: `README.md`, `CHANGELOG.md`,
  `docker-compose.yml`, `.env.example`, `packages/`, and `docs/`.
- Required Folio archive items exist: `README.md`, `AGENTS.md`,
  `PROJECT_CONTEXT.md`, `plan.md`, `pyproject.toml`, `app/`, `docs/`, and
  `tests/`.
- Forbidden archive artifacts were checked and no real `.env`, dependency
  directory, cache directory, pycache, sandbox, build output, log, or nested
  archive remains under `legacy/`.
- Original source directories were not deleted or modified by this archive task.
