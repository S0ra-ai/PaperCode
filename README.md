# Paper Fucker

Current version: <!-- version:start -->0.8.5-dev<!-- version:end -->

Paper Fucker is a private-first, OpenCode-derived paper workbench. It turns a topic, codebase, dataset, experiment log, PDF, Markdown, LaTeX, DOCX, or mixed research material into a reviewable paper bundle with source discovery, code understanding, experiment/reproduction support, ClaimLedger-first writing, authenticity gates, live preview, and export.

TaskFlow is the execution source of truth. Active work lives under `.plan/confirmed/`; old planning drafts and historical reports are only provenance.

## Product Boundary

- `paper_fucker` is the command, package/config identifier, and local directory name.
- `Paper Fucker` is the user-visible product brand in startup, help, TUI, docs, doctor output, preview, and reports.
- OpenCode remains the internal substrate for providers/models, agents/sessions, tools, MCP, skills, permissions, plugins, and TUI runtime.
- Paper Fucker owns the paper domain: `PaperRun`, intake, research state, model roles, recursive agent fabric, capability registry, paper profiles, authoring, verification, preview/export binding, and final gates.
- DeepSeek is only a default sample provider. Any provider/model supported by the OpenCode substrate can be assigned to Paper Fucker roles.

## Current Status

- The authoritative paper runtime lives in `packages/opencode/src/paper`.
- `PaperRun` is the first-class user state. `/paper` HTTP APIs create runs, stream events, record guidance, expose preview/export state, list capabilities, run doctor diagnostics, discover providers, and resolve model roles.
- The default TUI is a Chinese paper workbench, not a generic chat entry. Users enter a topic, code path, paper material, dataset, experiment log, or mixed request; the system creates a `PaperRun` and advances the stage graph automatically.
- Recursive agent orchestration is product-unbounded. Budget, time, context, permissions, data egress, license/source gates, authenticity gates, and completion coverage stop expansion instead of fixed depth/count limits.
- The right sidebar keeps the old cost/token/context/outline value and adds Agent Tree, Agent Team, Gate, blockers, tool/model diagnostics, MemoryBank, and code-understanding state.
- Live preview is implemented as a read-only localhost preview package with token-checked snapshot and SSE endpoints. PaperRun preview snapshots bind drafts, export files, claim/citation/reviewer annotations, costs, agents, and tool diagnostics. The next readiness task audits whether automatic browser opening is wired end-to-end from the TUI control.
- Final export is blocked by authenticity gates. Forced drafts are allowed for review but must visibly carry failed checks.

## User Flow

1. Run `paper_fucker`.
2. Configure providers and local tools through `paper_fucker init`.
3. Enter a topic, code path, dataset, experiment logs, paper files, or a mixed Chinese instruction.
4. Paper Fucker creates a `PaperRun`, plans the paper, dispatches agents, calls MCP/skills/tools, builds ledgers, checks evidence, and updates the live TUI.
5. Open Preview from the run dashboard to watch draft/render state and annotations.
6. Export a reviewable bundle. Submission-candidate export is available only after stricter profile checks pass.

The system pauses only for actionable decisions: missing provider/tool/MCP/skill, cost overrun, data-egress authorization, license/source conflict, low-confidence research direction, unreproduced experiment, unsupported claim, or final gate block.

## Repository Map

See `docs/project-structure.md` for the full root-directory map and tracked/ignored state boundary.

- `CHANGELOG`: current active 0.8.x colon-history line only.
- `docs/changelog/v0/`: archived 0.1.x to 0.7.x colon-history files.
- `.plan/`: TaskFlow project plan, locks, and confirmed tasks.
- `.paper_fucker/`: tracked project assets such as skills, commands, themes, glossary, and config template.
- `.paper_fucker/local/` and `.paper_fucker/runs/`: ignored local secrets/runtime state.
- `packages/opencode/`: hard-forked Paper Fucker product core and OpenCode substrate.
- `packages/preview/`: first-party read-only live preview web package.
- `research-tools/`: Python MCP/CLI research tools and generated Pydantic-side validation helpers.
- `schemas/`: JSON Schema contract source for paper/research facts.
- `scripts/`: repository automation, acceptance, benchmark, version, and provider smoke entrypoints.
- `reports/`: current acceptance/audit reports. Historical reports may retain old paths as provenance.
- `legacy/` and `upstream/`: reference snapshots and upstream provenance, not active runtime authority.

## Release Readiness

Release preparation happens in two distinct phases:

- `pre-release readiness`: normal `feature/*` work from `develop`; no release branch, no tag, no `main`.
- `pre-release on release branch`: after readiness is clean, create `release/0.8.5` from `develop` for stabilization, manual provider testing, and RC fixes.

Tags are created only after explicit confirmation. RC tags may point at the release branch; final tags are created only when the formal release flow reaches `main`.

## Validation

Use these checks after changing docs, version, branding, or release-readiness code:

```powershell
.\scripts\check-readme-version.ps1
.\scripts\check-changelog-format.ps1
.\scripts\strict-acceptance.ps1 -CheckTimeoutSeconds 300
```

The full workspace suite is opt-in because it is slower:

```powershell
.\scripts\strict-acceptance.ps1 -FullWorkspaceSuite -CheckTimeoutSeconds 600 -FullWorkspaceTimeoutSeconds 2700
```

Reset local state before a clean provider test with backup:

```powershell
paper_fucker init reset --scope all --backup --yes
paper_fucker init doctor
.\scripts\provider-matrix-smoke.ps1
```

Reset only touches global `~/.paper_fucker` and ignored workspace `.paper_fucker/local/` plus `.paper_fucker/runs/`; tracked project assets under `.paper_fucker/skills/`, commands, themes, glossary, and config templates are preserved.

`scripts/provider-matrix-smoke.ps1` reads public provider configs from `~/.paper_fucker/providers/`, secrets from `~/.paper_fucker/local/provider-secrets.json`, calls `/models`, then runs a minimal OpenAI-compatible chat smoke for each configured provider. If no provider is configured it writes a `pending_config` report instead of failing.

## Version Policy

`CHANGELOG` is the only version source. The README version marker must match the latest root `CHANGELOG` history entry. Historical archive files under `docs/changelog/` preserve older colon-history entries but do not drive the current version.

## License

This project is private and all rights are reserved unless a later written license change says otherwise.

Third-party snapshots keep their original licenses. OpenCode provenance and license details are recorded in `NOTICE.md` for the imported upstream snapshot.
