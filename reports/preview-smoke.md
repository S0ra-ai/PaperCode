# Preview Smoke

> Historical path note: this report predates task-032. Any `packages/server` or `@papercode/server` paths below are provenance only; the current papercode runtime authority is `packages/opencode/src/paper`, and `packages/server` is intentionally absent.

Date: 2026-05-08
TaskFlow task: task-008-preview-runtime
Branch: feature/research-preview

## Scope

`packages/preview` implements the first-party read-only local research preview.
It is a localhost-only, token-protected surface for observing a run; mutations
remain in the first-party server/runtime.

## Implemented Surface

- `packages/preview/src/protocol.ts`: preview.v1 snapshot, artifact refs, annotations, diagnostics, render status, stream event types, token generation, and write-method detection.
- `packages/preview/src/server.ts`: localhost Bun server, token-checked preview/snapshot/SSE endpoints, static asset serving, and 405 rejection for write methods.
- `packages/preview/src/render-queue.ts`: immediate Markdown updates, derived artifact render jobs, stale job cancellation, and subscriber event publishing.
- `packages/preview/index.html`: static preview workbench.
- `packages/preview/src/style.css`: dense read-only research workspace UI.
- `packages/preview/src/client.js`: browser client for tabs, snapshot fetch, and SSE render updates.

## Verified Behavior

- Invalid token returns 401.
- Write methods return 405.
- Valid token returns `readonly: true` snapshot.
- Render queue cancels stale jobs and keeps the newest Markdown/derived output.
- Browser smoke loaded the UI at localhost and rendered title, live status, tabs, and Markdown content.

## Verification

- `npx --yes bun@1.3.13 install`: passed.
- `npx --yes bun@1.3.13 --cwd packages/preview test`: passed, 2 pass, 0 fail, 9 expects.
- `npx --yes bun@1.3.13 run --cwd packages/preview typecheck`: passed.
- `npx --yes bun@1.3.13 --cwd packages/server test test/init/init.test.ts test/research/contracts.test.ts test/research/runtime.test.ts test/research/python-bridge.test.ts`: passed, 9 pass, 0 fail, 60 expects.
- `npx --yes bun@1.3.13 run typecheck`: passed across workspace, 14 successful tasks.
- Browser smoke: `http://127.0.0.1:4180/preview?token=browser-token` loaded and accessibility snapshot showed `Browser Preview Smoke`, `live`, `ready`, tabs, and Markdown content.
- Browser screenshot saved to `reports/preview-browser-smoke.png`.
