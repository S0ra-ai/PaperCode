# 模型 provider 配置

这份文档说明如何把自定义 LLM 端点接进 PaperCode，以及论文管线如何选择模型。文档语言默认中文；命令、字段名、路径和字面量保留原文。

## 两种写法

配置按固定顺序加载，**后加载者覆盖先加载者**：`~/.papercode/config/{config.json,papercode.json,papercode.jsonc}` → `PAPERCODE_CONFIG` 指定的单文件（或 `PAPERCODE_CONFIG_CONTENT` 注入内容）→ 项目目录逐级向上查找的 `papercode.json[c]` 与 `.papercode/` 目录。也就是说**项目级覆盖全局**；`PAPERCODE_CONFIG_DIR` 可改配置目录。

### `providers`：手写方言（推荐）

面向"自己接一个 OpenAI 兼容端点"的场景，字段少、语义直白：

```json
{
  "$schema": "https://papercode.local/config.json",
  "model": "fjbdg/deepseek-v4-flash-vision-exp",
  "providers": {
    "fjbdg": {
      "displayName": "fjbdg",
      "apiKeyEnv": "FJBDG_API_KEY",
      "api": "openai-completions",
      "baseURL": "https://newapi.fjbdg.top:10443/v1",
      "reasoning": "max",
      "models": [
        {
          "id": "deepseek-v4-flash-vision-exp",
          "contextWindow": 1000000,
          "maxTokens": 384000,
          "input": ["text", "image"],
          "reasoning": "max"
        }
      ]
    }
  }
}
```

字段映射（内部归一化后与 `provider` 同形）：

| `providers` 字段                   | 内部字段                                                 | 生效点                                              |
| ---------------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| `displayName`                      | `name`                                                   | provider 显示名                                     |
| `apiKeyEnv`                        | `env: [值]`                                              | 从环境变量取密钥（唯一变量时同时成为 provider key） |
| `api: "openai-completions"`        | `npm: "@ai-sdk/openai-compatible"`                       | 选择传输实现                                        |
| `baseURL`                          | `options.baseURL`                                        | 覆盖 provider 的 API 地址                           |
| `reasoning: "<effort>"`            | 每个模型的 `reasoning: true` + `options.reasoningEffort` | 作为请求的 `reasoning_effort` 默认值                |
| `models[].contextWindow`           | `limit.context`                                          | 上下文预算与溢出判断                                |
| `models[].maxTokens`               | `limit.output`                                           | 每次请求的 `max_tokens`                             |
| `models[].input: ["text","image"]` | `modalities.input`                                       | 图像输入能力开关                                    |
| `models[].reasoning`               | 同 provider 级，模型级优先                               | 同上                                                |
| `models[].reasoningEfforts`        | 变体 `variants[<档位>] = { reasoningEffort: <值> }`       | 声明该模型接受哪些档位、每档对应的厂商值            |
| `reasoningEfforts`（provider 级）  | 同上，作为该 provider 所有模型的默认                     | 模型级声明优先                                      |
| `compat.supportsDeveloperRole`     | 保留在归一化记录上                                       | 断言端点不接受 `developer` 角色（见"已知边界"）     |

`providers.*` 内的未知字段会**报错**（`ConfigInvalidError`，带字段路径），不会静默丢弃；这是与旧 `provider` 键的主要差别（旧键沿用 effect 解码器的默认行为，嵌套未知字段被丢弃）。

`contextWindow` 与 `maxTokens` 可以只声明一个：**未声明的一半保留继承值**（覆盖 models.dev 里的已知模型时尤其重要，不会把上下文清零）。只声明 `contextWindow` 时输出上限除非另有声明，否则仍受 `OUTPUT_TOKEN_MAX`（默认 32000）约束；只声明 `maxTokens` 时它按原值下发。

### `provider`：models.dev 覆盖写法（兼容保留）

用于覆盖 models.dev 里已知 provider 的模型元数据，字段是数据库形状：`name` / `env: []` / `npm` / `api`（URL）/ `options.apiKey` / `options.baseURL` / `models`（以 model id 为键的对象）/ `limit.{context,input,output}` / `modalities`。两个键同时声明同一 id 时，`provider` 获胜。

## 密钥来源

优先级：`options.apiKey`（配置内联，最高）> `~/.papercode/data/auth.json`（`papercode providers login` 写入）> 环境变量（`env` / `apiKeyEnv`）。推荐只写 `apiKeyEnv`，把密钥留在环境变量里，避免进入版本库。

`papercode providers list` 会把**全局配置**里声明的 provider 的环境变量一并列在 `Environment` 段（仅显示变量名，不显示值；该命令不依赖实例，所以项目级配置不参与）。HTTP API 返回的 provider 列表里 `key` 与 `options` 内的密钥字段（`apiKey`/`token`/`secret`/`authorization` 等）都会替换为 `[redacted]`，客户端只用 `source` / `env` 判断连通性。

## 让论文管线使用它

论文管线的模型选择独立于会话默认模型，状态保存在 `~/.papercode/model-inventory.json`：

1. **provider 可见**：配置里声明过的 provider 会自动出现在模型工作台（`/models`）的候选里，注册类型为 `manual`，来源标记 `source: "manual"`。
2. **允许列表**：模型默认**不**自动允许；需要在工作台勾选，或写入 `allowlist`。路由要求"允许列表非空 + 主决策模型在允许列表内"。
3. **主决策模型 / 角色覆盖**：`decision_model` 与 `role_overrides` 决定 `planner`、`writer`、`reviewer` 等角色的实际模型。
4. **会话默认模型**：PaperRun 的 agent 会话在没有显式 `--model` 时使用配置里的 `model`；这是"生成论文时用哪个模型"的实际开关。

最小可用配置：`providers` 声明端点 + `model` 指向该模型 + 工作台勾选该模型并设为主决策模型。缺任一项时运行会暂停并记录 `paper.stage.blocked`，提示里写明缺的是哪一步。

## 已知边界

- `api` 目前只映射 OpenAI 兼容传输（`openai-completions` / `openai-compatible`），其它形状未实现，枚举保持封闭以免静默降级。
- 配置声明的 `maxTokens` 会按原值发送（绕过 `OUTPUT_TOKEN_MAX` 的 32000 默认上限）；注册表继承来的限额仍受该上限约束。
- 配置声明的模型没有价格信息，`cost` 记 0；如需成本统计，在模型里补 `cost.{input,output}`。
- 部分兼容端点不接受 OpenAI 的 `developer` 角色（本仓库验证过的 `fjbdg` 端点对该角色返回 422）。本 fork 使用的 openai-compatible 传输始终发送 `system`，因此 `compat.supportsDeveloperRole: false` 是一条"已被满足的断言"——保留它是为了让配置自解释，声明 `true` 也不会让传输改用 `developer`。
- 修改配置后需要重启进程或让实例失效（配置按实例缓存）。

## 验收命令

```bash
cd packages/opencode
bun run typecheck
bun test test/provider/user-providers.test.ts
bun test test/config/config.test.ts test/paper/model-discovery.test.ts

# 端到端（需要真实密钥）
bun run --conditions=browser src/index.ts models <provider-id>          # 列出模型
bun run --conditions=browser src/index.ts providers list                # 列出密钥来源
bun run --conditions=browser src/index.ts run "论文主题"                 # 用配置的默认模型跑 PaperRun
```

观察 PaperRun 实际使用的模型：

```bash
grep 'service=llm' ~/.papercode/data/log/dev.log | tail -3
# 期望：service=llm providerID=<你的 id> modelID=<你的模型> ...
```
