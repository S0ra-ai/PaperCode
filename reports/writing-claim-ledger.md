# Writing ClaimLedger Verification

TaskFlow task: `task-013-writing-claim-ledger`
Version: `0.1.13-dev`
Date: `2026/05/09`

## Scope

- Added first-party writing boundaries under `packages/server/src/research/writing/`.
- Added `ClaimLedger.v1`, `DraftPaper.v1`, citation refs, checkpoint guidance, and draft revision payload schemas.
- Implemented claim-first composition before Markdown generation.
- Implemented streamed Markdown chunks for preview and source-range annotations.
- Implemented checkpoint guidance application, line diffs, rollback tokens, and rollback restoration.

## Verification Scenarios

- Supported claims bind citations from source ids before draft sections are composed.
- Draft writing records claim facts, draft facts, claim ledger artifact, Markdown draft artifact, and stream chunks.
- Unsupported claims are annotated in Markdown before final export.
- Checkpoint guidance modifies the next draft revision automatically.
- Revision diff records old/new lines and rollback restores the previous Markdown.

## Commands

```powershell
npx --yes bun@1.3.13 --cwd packages/server test test/research/writing.test.ts
npx --yes bun@1.3.13 run --cwd packages/server typecheck
```
