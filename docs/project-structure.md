# Paper Fucker Project Structure

This repository is intentionally split between product runtime, local runtime state, historical provenance, and release evidence. The root should stay readable enough for release testing from a clean checkout.

## Active Product Runtime

- `packages/opencode/`: the hard-forked Paper Fucker product core. OpenCode provider/model, agent/session, MCP, skill, tool, permission, plugin, and TUI substrate code stays here; Paper Fucker domain code lives under `packages/opencode/src/paper`.
- `packages/preview/`: token-protected read-only browser preview with snapshot and SSE endpoints for live paper writing/rendering progress.
- `research-tools/`: Python MCP/CLI bridge for document conversion, crawler/data helpers, external tool discovery, and generated Pydantic validation.
- `schemas/`: JSON Schema contracts for research runs, events, artifacts, sources, tool traces, claims, drafts, reviews, exports, and checkpoints.
- `scripts/`: release readiness, strict acceptance, live benchmark, provider smoke, version, and hygiene automation.

## Product State And Configuration

- `.paper_fucker/paper_fucker.jsonc`: tracked project-level Paper Fucker config template and MCP defaults.
- `.paper_fucker/skills/`, `.paper_fucker/agent/`, `.paper_fucker/command/`, `.paper_fucker/theme/`, `.paper_fucker/glossary/`, `.paper_fucker/tools/`: tracked first-party assets fused into the product.
- `.paper_fucker/local/`: ignored local secrets, provider keys, model defaults, and machine-specific overrides.
- `.paper_fucker/runs/`: ignored workspace-local PaperRun outputs.
- `~/.paper_fucker/`: global user configuration, providers, secrets, tool links, backups, and fallback runs.

Tracked project assets must not be deleted by reset commands. Runtime reset may only touch ignored local/global state after backup.

## Planning And History

- `.plan/`: TaskFlow project router state. `.plan/confirmed/` is the active execution source of truth.
- `CHANGELOG`: current active colon-history file. It keeps the 0.8.x line during 0.8 readiness.
- `docs/changelog/v0/`: archived colon-history files for 0.1.x through 0.7.x.
- `reports/`: current and historical acceptance reports. Reports written before the hard-fork migration may retain old paths as provenance.

## Reference And Upstream Material

- `legacy/`: imported reference projects and bundles used for architecture analysis only.
- `upstream/`: upstream OpenCode README/provenance references, not the public Paper Fucker documentation.
- `NOTICE.md`, `LICENSE`: upstream license/provenance and private project license boundary.

## Root Directory Hygiene

The root keeps only cross-cutting entrypoints and metadata:

- Build/config: `package.json`, `bun.lock`, `bunfig.toml`, `tsconfig.json`, `turbo.json`, `.oxlintrc.json`, `.prettierignore`, `.editorconfig`.
- Nix/SST/upstream integration: `flake.nix`, `flake.lock`, `nix/`, `infra/`, `github/`, `sdks/`, `patches/`.
- Product docs and governance: `README.md`, `CHANGELOG`, `CONTRIBUTING.md`, `SECURITY.md`, `NOTICE.md`, `docs/`, `reports/`.

Ignored local directories such as `node_modules/`, `.turbo/`, `tmp/`, `.paper_fucker/local/`, and `.paper_fucker/runs/` can appear in a developer workspace but are not release artifacts.
