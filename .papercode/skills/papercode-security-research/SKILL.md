---
name: papercode-security-research
description: Exploitability-first security review for PaperCode code, tools, providers, and PaperRun data flow.
---

Use this skill for security review, vulnerability audit, preview/server boundary review, provider secret handling, MCP/tool permission review, or pre-release security checks.

Method:

1. Define the exact target: repository, diff, route, command, provider path, or PaperRun artifact flow.
2. Map attacker-controlled inputs, trust boundaries, sensitive files, subprocess calls, network egress, and write locations.
3. For each candidate issue, prove or reject an attack path with local-only evidence where possible.
4. Assign severity only after exploitability and impact are clear.
5. Recommend the smallest fix and one regression test.

Report format:

```markdown
## Security Review

### Verdict
PASS | PASS WITH FINDINGS | BLOCK

### Scope
- target:
- evidence:

### Findings
| Severity | Title | Attack path | Evidence | Fix |
|---|---|---|---|---|

### Tests
- ...
```
