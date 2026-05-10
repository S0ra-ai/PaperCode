# TUI Provider Copy Cleanup

Version: `0.5.2-dev`
TaskFlow task: `task-053-tui-provider-copy-cleanup`
Branch: `fix/tui-provider-copy`
Date: `2026/05/10`

## Summary

The Paper Fucker TUI home surface still had small user-visible copy that made the product feel like an OpenCode entrypoint:

- The home placeholder example used `--code packages/opencode`.
- A home tip said to add an "OpenCode provider".
- The tips label and built-in theme tip were still English even though the default interface language is Chinese.

## Changes

- Changed the code-to-paper home example to `--code . 写一篇系统论文`.
- Changed provider tip wording to "OpenAI-compatible、DeepSeek 或其他模型 provider".
- Localized the tips label from `Tip` to `提示`.
- Localized the built-in theme switching tip.

## Verification

Verified with:

```text
npx --yes bun@1.3.13 run --cwd packages/opencode typecheck
passed
```

The current TUI home/tips copy scan returned no matches for:

```text
OpenCode provider
Open Code
● Tip
Use {highlight}/themes
--code packages/opencode
```

The replacement copy scan confirmed the Paper Fucker wording is present.
