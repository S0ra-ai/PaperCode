# Architecture Reframe Report

> Historical path note: this report predates task-032. Any `packages/server` or `@paper-fucker/server` paths below are provenance only; the current paper_fucker runtime authority is `packages/opencode/src/paper`, and `packages/server` is intentionally absent.

Version: `0.1.18-dev`

TaskFlow task: `task-021-architecture-reframe`

Date: `2026-05-09`

## Decision

paper_fucker is now defined as a closed-loop paper system built on a deeply modified OpenCode substrate.

OpenCode owns the substrate capabilities:

- providers and models
- agents and sessions
- built-in tools
- MCP servers
- skills
- TUI
- permissions and plugins

paper_fucker owns the paper domain:

- multi-input intake
- paper profiles
- model role routing
- research capability registry
- paper orchestration
- ClaimLedger-first authoring
- verification gates
- preview and export bundles

## Product Modes

The paper domain explicitly supports these intake modes:

- `topic_to_paper`
- `code_to_paper`
- `data_to_paper`
- `experiment_log_to_paper`
- `materials_to_paper`

## Model Positioning

DeepSeek remains the default sample endpoint with model id `deepseek-v4-pro`, but the architecture is OpenCode-provider-agnostic. Any model provider that OpenCode can resolve must be eligible for paper_fucker role routing.

## Verification

```text
npx --yes bun@1.3.13 --cwd packages/server test test/paper/architecture.test.ts
```

Result: `3 pass, 0 fail, 6 expect() calls`.
