# Provider Model Wizard

## Summary

Implemented `task-035-provider-model-wizard` on `feature/provider-model-wizard`.

The paper runtime can now discover models from OpenAI-compatible endpoints, keep API keys out of tracked files, and resolve default, per-role, and subagent model overrides.

## Changes

- Added `ProviderEndpointConfig`, `ModelDiscoveryResult`, and OpenAI-compatible `/models` discovery.
- Added secret-safe provider config storage:
  - public config: `~/.paper_fucker/providers/<provider-id>.json`
  - API keys: `~/.paper_fucker/local/provider-secrets.json`
- Added `ModelRoleAssignment` and role/subagent override resolution.
- Extended `/paper/providers/discover` with POST discovery for user-supplied endpoints.
- Extended `/paper/model-roles` with POST assignment resolution.
- Added a TUI `Paper model roles` command/dialog for role visibility.
- Added tests for discovery, key redaction, storage, and override resolution.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/model-discovery.test.ts`: passed, 3 pass, 0 fail, 13 expects.
- `npx --yes bun@1.3.13 run --cwd packages/opencode typecheck`: passed.
