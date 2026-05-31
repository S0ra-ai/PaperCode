---
name: papercode-workflow
description: Execute PaperCode development work with small scoped changes, verification, changelog update, and push.
---

Use this skill when a PaperCode task should be implemented and landed.

Protocol:

1. Inspect the current branch and worktree before editing.
2. Keep the write scope narrow and avoid unrelated refactors.
3. Prefer existing PaperCode modules and local patterns.
4. Update README, docs, or CHANGELOG when behavior changes.
5. Run targeted tests first, then broader checks when the touched surface is shared.
6. Commit and push after a coherent small feature is complete.

Output should state changed files, verification commands, and remaining risk.
