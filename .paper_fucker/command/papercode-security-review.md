---
description: Security review with exploitability-first evidence
---

Audit the requested scope, or the current branch diff if no scope is provided.

Rules:

- No severity without a concrete attack path.
- No high or critical finding without clear exploit preconditions and impact.
- Prefer local fixtures, dry runs, and static proof over risky live testing.
- Cite exact files, functions, and commands used.
- Keep generic hardening advice out of findings; put it in a short notes section.

Check at minimum:

- auth and token handling
- filesystem writes, path traversal, and archive extraction
- subprocess and shell command construction
- MCP/tool/plugin permissions
- provider secrets and data egress
- preview/server write boundaries
- dependency and build-script risk

Output:

```markdown
## PaperCode Security Review

### Verdict
PASS | PASS WITH FINDINGS | BLOCK

### Scope
- ...

### Findings
| Severity | Title | Attack path | Evidence | Fix |
|---|---|---|---|---|

### Notes
- ...
```
