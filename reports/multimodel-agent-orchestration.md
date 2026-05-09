# Multi-model Agent Orchestration

## Summary

Implemented `task-036-multimodel-agent-orchestration` on `feature/multimodel-agent-orchestration`.

The paper runtime now has explicit budget tiers, private-first data egress checks, and a multi-layer `PaperAgentTree` where parent and child agents may resolve different OpenCode provider/model ids.

## Changes

- Added `BudgetTierPolicy` for `quick`, `standard`, `deep`, `submission`, and `custom` runs.
- Added `DataEgressPolicy` evaluation for authorized paths, denied glob patterns, secret-like paths, binary artifacts, and audit traces.
- Added `AgentRoleRouter` and `PaperAgentTree` helpers for root/stage/worker/specialist/reviewer/verifier/citation-style nested agents.
- Added per-agent provider/model provenance, source of model assignment, input/output artifact references, tool trace references, and depth enforcement.
- Updated `PaperRun` snapshot projection so Agent Tree budget limits come from the shared budget tier policy.
- Fixed Windows project containment checks used by skill directories, read, shell, and external-directory permissions so cross-drive paths cannot be treated as project-local.
- Updated Paper HttpApi bridge coverage, Windows path test fixtures, and Windows-stable prompt/shell/compaction timing so the full opencode suite tracks the hard-forked `/paper` surface and valid Git Bash/MSYS path forms.
- Stabilized Windows-native watcher, PTY output, temp cleanup, provider, MCP, and research e2e tests so full-suite verification can complete under local Windows load.
- Documented multi-model agent orchestration and private-first data egress in README.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/opencode test`: passed, 2549 pass, 29 skip, 2 todo, 0 fail, 7379 expects.
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/agents.test.ts`: passed, 4 pass, 0 fail, 11 expects.
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/tool/shell.test.ts`: passed, 90 pass, 1 skip, 0 fail, 254 expects.
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/file/watcher.test.ts`: passed, 5 pass, 0 fail, 9 expects.
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/pty/pty-output-isolation.test.ts`: passed, 3 pass, 0 fail, 3 expects.
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/agent/agent.test.ts -t "skill directories are allowed"`: passed.
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/file/path-traversal.test.ts`: passed, 15 pass, 0 fail.
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/server/httpapi-bridge.test.ts -t "covers every generated"`: passed.
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/tool/external-directory.test.ts test/tool/read.test.ts`: passed, 45 pass, 0 fail.
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/session/prompt.test.ts -t "prompt submitted during an active run"`: passed.
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/session/prompt.test.ts -t "loop waits while shell runs"`: passed.
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/session/prompt.test.ts -t "shell completion resumes queued"`: passed.
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/session/compaction.test.ts -t "stops quickly when aborted during retry backoff"`: passed.
- `npx --yes bun@1.3.13 run --cwd packages/opencode typecheck`: passed.
- `npx --yes bun@1.3.13 --cwd packages/preview test`: passed, 2 pass, 0 fail, 9 expects.
- `python -m unittest discover -s research-tools/tests`: passed, 4 tests OK.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-readme-version.ps1`: passed, README version 0.2.5-dev matches CHANGELOG latest version.
