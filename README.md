# paper_fucker

Current version: <!-- version:start -->0.1.2-dev<!-- version:end -->

`paper_fucker` is a private-first, OpenCode-derived research automation product for building verifiable academic-paper research packages from a topic, codebase, or project workspace.

The repository is governed by TaskFlow. The active implementation plan lives in `.plan/confirmed/`; historical planning drafts are not an execution source.

## Current Status

- Repository governance and planning bootstrap are in progress.
- The product direction is a hard fork of OpenCode, not a thin wrapper.
- The authoritative research contracts and server-side paper_fucker runtime live under `packages/server`.
- Research runs are stored workspace-first under `<workspace>/.paper_fucker/runs/<run-id>`, with `~/.paper_fucker/runs/<run-id>` as the fallback.
- Runtime operations are automatic API calls, not workflows that require users to keep typing shell commands.
- The imported OpenCode package remains the upstream-derived agent/CLI substrate while paper_fucker runtime surfaces are extracted into first-party packages.
- Python is reserved for per-run MCP and CLI research tools.
- Project configuration and run indexes use `~/.paper_fucker`.
- The default target is Windows-native operation.

## Project Structure

- `schemas/research/`: JSON Schema source of truth for research runs, events, artifacts, sources, tool traces, claims, drafts, reviews, exports, and checkpoints.
- `packages/server/`: first-party paper_fucker TypeScript server/runtime package. It owns AJV validation, OpenTelemetry span hooks, generated TypeScript contract types, run/event/artifact runtime APIs, permission/resource/cost/final-gate state, and rebuildable SQLite indexes.
- `research-tools/`: Python MCP/CLI tool package. Generated Pydantic v2 models mirror the JSON Schema contracts for tool-side validation.
- `packages/opencode/`: imported OpenCode-derived agent and CLI substrate retained during migration; new paper_fucker domain code should not be added here unless it is a deliberate compatibility adapter.

## Planning Source

Use TaskFlow tasks under `.plan/confirmed/` as the implementation source of truth.

Important early tasks:

- `task-001-repo-governance`: repository, license, changelog, and Git Flow governance.
- `task-002-legacy-archive`: safe archive of legacy source projects.
- `task-003-import-opencode`: import an OpenCode release snapshot as the product base.
- `task-004-brand-paper-fucker`: rebrand command, config, and user-facing surfaces.
- `task-017-core-contract`: schema, storage, event, artifact, and generated type contracts.
- `task-005-research-runtime`: first-party research run, event, artifact, permission, resource, cost, resume, and final gate runtime.
- `task-018-phase-1-acceptance`: Windows-native phase 1 acceptance gate.

## Branching

This repository uses Git Flow:

- `main` is the stable integration branch.
- `develop` is the development integration branch.
- Work branches use Git Flow names based on the function being changed, for example `feature/repository-governance`, `fix/version-check`, or `hotfix/private-license`.

Do not publish releases, tags, or public packages unless explicitly approved.

## Version Policy

`CHANGELOG` is the only version source.

README must expose the same version as the latest `CHANGELOG` entry. Run this check after any changelog or README update:

```powershell
.\scripts\check-readme-version.ps1
```

Development versions advance as `<major>.<minor>.<patch>-dev`; each completed TaskFlow change records a distinct dev version such as `0.1.2-dev`.

## License

This project is private and all rights are reserved unless a later written license change says otherwise.

Third-party source snapshots keep their original licenses. OpenCode provenance and license details are recorded in `NOTICE.md` for the imported upstream snapshot.
