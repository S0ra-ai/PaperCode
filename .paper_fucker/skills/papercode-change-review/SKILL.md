---
name: papercode-change-review
description: Review PaperCode repository changes using actual diffs rather than commit titles.
---

Use this skill when a PaperCode change summary, release note, or implementation review needs to be grounded in real diffs.

Workflow:

1. Identify the base ref from the prompt, upstream branch, or merge base.
2. Inspect `git diff --stat`, `git diff --name-only`, and representative file diffs.
3. Group changes by product area: TUI, PaperRun, model workbench, runtime, preview/export, docs, build, and tests.
4. Summarize user-visible behavior first; keep internal refactors secondary.
5. Include risks only when tied to a concrete changed surface.

Output must be short, evidence-backed, and suitable for changelog or PR review.
