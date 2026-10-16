# Model Router Report

> Historical path note: this report predates task-032. Any `packages/server` or `@papercode/server` paths below are provenance only; the current papercode runtime authority is `packages/opencode/src/paper`, and `packages/server` is intentionally absent.

Version: `0.1.19-dev`

TaskFlow task: `task-022-model-router`

Date: `2026-05-09`

## Decision

papercode model selection is role-based and OpenCode-provider-agnostic. DeepSeek remains the default sample model, but the router accepts any OpenCode `provider/model` id and supports per-role overrides.

## Roles

- `planner`
- `literature_researcher`
- `code_analyst`
- `experiment_designer`
- `writer`
- `reviewer`
- `citation_checker`
- `cheap_summarizer`

## Config

Initialization now writes:

```json
{
  "model_roles": {
    "strategy": "opencode_provider_agnostic",
    "default_model": "deepseek/deepseek-v4-pro",
    "roles": {}
  }
}
```

## Verification

```text
npx --yes bun@1.3.13 --cwd packages/server test test/paper/model-router.test.ts
npx --yes bun@1.3.13 --cwd packages/server test test/init/init.test.ts
```

Results: model router `4 pass, 0 fail`; init `2 pass, 0 fail`.
