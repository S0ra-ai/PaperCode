# Template Resolution Report

> Historical path note: this report predates task-032. Any `packages/server` or `@paper-fucker/server` paths below are provenance only; the current paper_fucker runtime authority is `packages/opencode/src/paper`, and `packages/server` is intentionally absent.

Date: 2026-05-09
TaskFlow task: `task-010-template-resolve`
Version: `0.1.10-dev`

## Implemented

- Added `TemplateSpec.v1` with source evidence, trust level, license status, confidence, required files, and conflict flags.
- Added deterministic trusted template resolver with built-in IEEE and ACM official candidates plus CJC fallback.
- Automatic adoption requires clear license, no conflicts, and confidence at least 0.75.
- Pause reasons cover source conflict, unclear license, low confidence, and user requirement conflict.
- Added Markdown-to-LaTeX application through the existing Python bridge and `research-tools` CLI.

## Verification

- Official IEEE source adoption succeeds.
- Conflicting source, unclear license, and low-confidence candidates pause.
- Missing venue falls back to CJC default.
- Runtime records template resolution artifacts and applies Markdown to LaTeX through Python bridge.

## Boundaries

OpenCode search/MCP should feed candidate evidence into this resolver. The resolver itself remains first-party TypeScript code under `packages/server/src/research/templates`.
