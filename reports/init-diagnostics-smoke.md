# Init Diagnostics Smoke

Date: 2026-05-08
TaskFlow task: task-007-init-wizard
Branch: feature/init-diagnostics

## Scope

The first-party server package now owns the initialization and diagnostics flow for
`~/.paper_fucker`. The flow creates config, tool links, and encrypted secrets outside
the repository, then reports tool availability in a machine-readable diagnostics
payload.

## Implemented Surface

- `packages/server/src/init/config.ts`: `config.json`, `tools.json`, default config, and path helpers.
- `packages/server/src/init/discovery.ts`: pandoc, LaTeX engines, Docker, Python, Git, Chrome, and Edge discovery through user links, `PAPER_FUCKER_TOOL_*`, `PATH`, and common Windows locations.
- `packages/server/src/init/secrets.ts`: `secrets.enc` AES-256-GCM encryption with PBKDF2-SHA256.
- `packages/server/src/init/wizard.ts`: non-interactive setup and diagnostics API.
- `packages/server/src/init/cli.ts`: `init --yes ...` and `diagnostics` command flow.

## Verified Behavior

- Full Access mode requires explicit `--full-access-ack` or equivalent API acknowledgement.
- Secrets are encrypted into `~/.paper_fucker/secrets.enc` and are not written to `config.json`.
- Tool links are stored in `~/.paper_fucker/tools.json`, the same format consumed by Python research tools.
- Diagnostics report missing tools cleanly and marks linked tools as available from `config`.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/server test test/init/init.test.ts`: passed, 2 pass, 0 fail, 15 expects.
- `npx --yes bun@1.3.13 --cwd packages/server src/init/cli.ts init --yes ...`: passed.
- `npx --yes bun@1.3.13 --cwd packages/server src/init/cli.ts diagnostics --home <tmp>`: passed.
- `npx --yes bun@1.3.13 --cwd packages/server test test/init/init.test.ts test/research/contracts.test.ts test/research/runtime.test.ts test/research/python-bridge.test.ts`: passed, 9 pass, 0 fail, 60 expects.
- `npx --yes bun@1.3.13 run typecheck`: passed across workspace, 13 successful tasks.
