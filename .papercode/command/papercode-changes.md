---
description: Summarize unpublished PaperCode changes from real diffs
---

Immediately produce a concise change analysis. Do not ask a question first.

Use the current repository state as evidence:

1. Find the comparison base from `$ARGUMENTS`; if empty, compare against the upstream branch merge base.
2. Read actual diffs with `git diff` and representative commits with `git show`.
3. Group user-facing changes by `tui`, `paper`, `model`, `runtime`, `docs`, `build`, and `tests`.
4. For each item, explain what changed and why it matters.
5. Call out breaking behavior, migration notes, and suggested version bump.

Output:

```markdown
## PaperCode Change Summary

### Highlights
- ...

### By Area
- tui: ...
- paper: ...

### Risk
- ...

### Version
- recommended: ...
```
