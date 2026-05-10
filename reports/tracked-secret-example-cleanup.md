# Tracked Secret Example Cleanup

Version: `0.5.3-dev`
TaskFlow task: `task-054-tracked-secret-example-cleanup`
Branch: `fix/tracked-secret-example`
Date: `2026/05/10`

## Summary

A final tracked secret scan found a secret-like example token in `github/README.md`:

```text
ANTHROPIC_API_KEY=sk-ant-api03-1234567890
```

Although it was example documentation, it matched the shape of a provider key and should not remain tracked.

## Changes

- Replaced the provider key example with `<provider-api-key>`.
- Replaced the GitHub token example with `<github-token>`.

## Verification

Verified with tracked scans:

```text
git grep -n -P "(?<![A-Za-z0-9])sk-[A-Za-z0-9._-]{20,}" -- . ':!CHANGELOG' ':!reports' ':!tmp'
no matches

git grep -n -P "github_pat_[A-Za-z0-9_]{10,}" -- . ':!CHANGELOG' ':!reports' ':!tmp'
no matches
```

`TaskFlow validate_task task-054-tracked-secret-example-cleanup` returned valid with no warnings.
