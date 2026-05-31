---
description: Find removable dead code with reference checks
---

Find dead code in the requested scope, or in the current branch diff if no scope is provided.

Process:

1. Run the narrowest useful static checks for unused locals/exports.
2. For every candidate, verify references with `rg` and TypeScript/LSP evidence where available.
3. Never remove entry points, tests, public exports, command templates, skill definitions, package exports, or migration files without explicit evidence.
4. If edits are requested, group by file and keep commits small.

Output:

```markdown
## PaperCode Dead Code Review

### Confirmed
| File | Symbol | Evidence | Action |
|---|---|---|---|

### Rejected Candidates
| File | Symbol | Reason |
|---|---|---|

### Next Step
- ...
```
