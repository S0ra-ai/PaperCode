# Paper Fucker 测试隔离审计

生成时间：2026-05-27

## 结论

- `research-tools` MCP 工具注册已补充闭包绑定回归测试，确认每个 tool 调用自己的 handler。
- `packages/opencode` provider auth 失败在单测与 provider 文件级复跑中未复现；已清理由测试运行生成的 `packages/opencode/undefined/.paper_fucker` 临时目录。
- 模型库存语义已收紧：历史候选模型不会自动提升为已注册 provider；只有订阅登录成功或自定义 endpoint 发现成功的 provider 会进入 Paper Fucker 候选模型来源。
- ChatGPT 与 GitHub Copilot 订阅作为 Paper Fucker 一等 provider 进入模型库存与路由契约，但不会绕过用户 allowlist。

## 验证

- `python -m unittest discover -s research-tools/tests`：通过，19 tests。
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/authoring.test.ts test/provider/provider.test.ts test/cli/cmd/tui/provider-options.test.ts test/paper/model-discovery.test.ts`：通过，103 tests。
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/model-discovery.test.ts test/paper/run-api.test.ts test/server/httpapi-bridge.test.ts test/cli/cmd/tui/provider-options.test.ts`：通过，43 tests。
- `npx --yes bun@1.3.13 --cwd packages/preview test`：通过，3 tests。
- `npx --yes bun@1.3.13 run --cwd packages/opencode typecheck`：通过。

## 剩余风险

- 全量 `packages/opencode` 测试仍需在最终收口前复跑一次，确认无跨文件全局状态污染。
- ChatGPT/Copilot 的真实订阅登录需要用户在 `/models` 内完成授权后做 live smoke。
