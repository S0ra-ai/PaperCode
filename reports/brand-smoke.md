# Brand Smoke Report

Date: 2026-05-08
Branch: feature/rebrand-papercode
TaskFlow task: task-004-brand-papercode

## Scope

- Renamed the user-visible command entrypoint to `papercode`.
- Moved project and global config defaults to `.papercode`, `papercode.json/jsonc`, and `~/.papercode`.
- Moved runtime storage defaults to `papercode.db` and channel-scoped `papercode-<channel>.db`.
- Rebranded HTTP/service identifiers, desktop product identifiers, app storage keys, SDK headers, install/build artifacts, Docker defaults, and TUI/app visible labels.
- Kept legacy `OPENCODE_*` environment variables and selected internal upstream package names as compatibility fallbacks.

## Verification

- `npx --yes bun@1.3.13 install` passed with no dependency changes.
- `npx --yes bun@1.3.13 run --cwd packages/core typecheck` passed.
- `npx --yes bun@1.3.13 run --cwd packages/opencode typecheck` passed.
- `npx --yes bun@1.3.13 run --cwd packages/app typecheck` passed.
- `npx --yes bun@1.3.13 run --cwd packages/sdk/js typecheck` passed.
- `npx --yes bun@1.3.13 run --cwd packages/ui typecheck` passed.
- `npx --yes bun@1.3.13 run --cwd packages/desktop typecheck` passed.
- `npx --yes bun@1.3.13 --cwd packages/core test test/global.test.ts` passed: 2 pass, 0 fail.
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/config/config.test.ts test/storage/db.test.ts test/server/httpapi-ui.test.ts test/mcp/headers.test.ts test/server/httpapi-cors.test.ts` passed: 99 pass, 0 fail.
- `npx --yes bun@1.3.13 --cwd packages/app test src/utils/server.test.ts src/utils/persist.test.ts src/theme-preload.test.ts src/utils/terminal-websocket-url.test.ts src/pages/layout/helpers.test.ts src/context/server.test.ts` passed: 328 pass, 0 fail.

## CLI Smoke

- `npx --yes bun@1.3.13 --cwd packages/opencode src/index.ts --help` lists commands under `papercode`, including `papercode run`, `papercode serve`, and `papercode web`; the mDNS default is `papercode.local`.
- `npx --yes bun@1.3.13 --cwd packages/opencode src/index.ts --version` returned `local`.
- `npx --yes bun@1.3.13 --cwd packages/opencode src/index.ts serve --hostname 127.0.0.1 --port 0` printed `papercode server listening on http://127.0.0.1:4096`; the smoke process was stopped after startup verification.

## Old Name Scan

- `rg --line-number "IntelliGen|intelligen|Python core|python core|codex/task" README.md packages CHANGELOG scripts .plan/confirmed/task-004-brand-papercode.yaml` found only historical `CHANGELOG` and TaskFlow references, generic `intelligence` words, model fixture URLs, upstream legal copy, and LSP/code-intelligence text. README has no active IntelliGen or Python-core authority wording.
- `rg --line-number '"opencode": "workspace:\*"|opencode@workspace|"name": "opencode"|"bin"\s*:\s*\{\s*"opencode"' package.json packages bun.lock` found no active workspace dependency, package name, or bin mapping for an `opencode` command package.
- `docs/` is absent, so old `docs/rebuild/` planning drafts are not present as an execution source.

## Accepted Compatibility Boundary

- The source directory `packages/opencode` remains unchanged in this step to avoid a broad package import-path migration.
- Internal `@opencode-ai/*` package scopes and selected `opencode` provider identifiers remain where they are upstream compatibility keys rather than papercode user-facing product surfaces.
- Legacy `OPENCODE_*` environment variables remain as fallbacks while preferred `PAPERCODE_*` variables are now supported.
