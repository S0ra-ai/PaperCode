# paper_fucker

Current version: <!-- version:start -->0.1.0-dev<!-- version:end -->

`paper_fucker` is a private-first, OpenCode-derived research automation product for building verifiable academic-paper research packages from a topic, codebase, or project workspace.

The repository is governed by TaskFlow. The active implementation plan lives in `.plan/confirmed/`; historical planning drafts are not an execution source.

## Current Status

- Repository governance and planning bootstrap are in progress.
- The product direction is a hard fork of OpenCode, not a thin wrapper.
- The authoritative research runtime will live in the OpenCode TypeScript server.
- Python is reserved for per-run MCP and CLI research tools.
- Project configuration and run indexes use `~/.paper_fucker`.
- The default target is Windows-native operation.

## Planning Source

Use TaskFlow tasks under `.plan/confirmed/` as the implementation source of truth.

Important early tasks:

- `task-001-repo-governance`: repository, license, changelog, and Git Flow governance.
- `task-002-legacy-archive`: safe archive of legacy source projects.
- `task-003-import-opencode`: import an OpenCode release snapshot as the product base.
- `task-004-brand-paper-fucker`: rebrand command, config, and user-facing surfaces.
- `task-017-core-contract`: schema, storage, event, artifact, and generated type contracts.
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

The initial private planning version is `0.1.0-dev`.

## License

This project is private and all rights are reserved unless a later written license change says otherwise.

Third-party source snapshots keep their original licenses. OpenCode provenance and license details must be recorded in `NOTICE.md` when the upstream snapshot is imported.
