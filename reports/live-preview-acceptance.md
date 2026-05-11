# Live Preview Acceptance

- Generated: 2026-05-11
- TaskFlow task: `pre-release-live-preview-audit`

## Result

PaperRun preview is now a real browser workflow, not only an API payload.

- `/paper/runs/:runID/preview` builds a run-bound `PreviewSnapshot`.
- The endpoint starts a token-protected localhost preview server from `packages/preview`.
- The response includes `url`, `token`, and the `preview.v1` snapshot.
- The preview page serves read-only snapshot and SSE endpoints.
- The TUI PaperRun dashboard automatically requests preview once a run reports `preview_state.status=ready` and opens the returned URL in the default browser.

## Boundaries

- Preview is read-only; write methods return `405`.
- Preview access requires the generated token.
- The preview server is per-run and is replaced when the same run opens a fresh preview.
- Tests stop live preview servers after use to avoid dangling local listeners.

## Verification

- `packages/preview` test covers token enforcement, read-only behavior, HTML branding, and render queue updates.
- `packages/opencode` PaperRun API test covers `/preview` URL creation and `preview.v1` snapshot output.
- `packages/opencode` TUI controls test covers opening the returned preview URL through an injected opener.
