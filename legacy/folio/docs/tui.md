# TUI 体验

Folio 的 TUI 以 [opencode](https://github.com/sst/opencode) 为参考，采
用左右双栏布局：左主对话区 + 右任务进度栏，底部 HUD 与输入框。

## 布局概览

```
+--Folio (model · endpoint · run-id)----------+
| +--Chat--------------+ +--Tasks-----------+ |
| | → 用户输入          | | ▶ format    1.2s ✓| |
| | Q (venue): 选择…    | | ▶ clarify   0.8s ✓| |
| | 1. IEEE — …         | | ▶ outline  3.1s ▶| |
| | → 1                 | |   draft        ⏸| |
| +---------------------+ +------------------+ |
| HUD: tokens 4128 · USD$0.03 · stage outline  |
| > [____________________________________]     |
+----------------------------------------------+
```

- **Chat**：所有引导、澄清问题、运行日志、refine 结果。
- **TaskPanel**：列出 pipeline 全部 stage（format_to_paper 或
  survey），实时显示 ⏸/▶/✓/✗/↷ 与累计耗时。
- **StatusBar**：当前 stage / 累计 tokens / USD+CNY 估算成本 / 已运行
  时间。

## 键位

| 键位 | 作用 |
|------|------|
| `↑` / `↓` | 翻输入历史（持久化在 `~/.folio/history`） |
| `Tab` | 在 `:` 命令提示中补全 |
| `?` | 显示命令与键位帮助 |
| `Ctrl+E` | 打开 endpoints 设置面板 |
| `Ctrl+C` | 中断当前 stage（已完成 stage 的 snapshot 保留） |

## 命令（slash）

| 命令 | 说明 |
|------|------|
| `:pdf <path> [topic...]` | 用样张 PDF 启动 format_to_paper 流水线 |
| `:survey <domain>` | 启动 survey 综述流水线 |
| `:resume [<uuid_prefix>]` | 续跑某次未完成的 run |
| `:endpoints` | 打开 endpoints 设置面板 |
| `:refine <instruction>` | 对最后一次产出进行追加修改 |
| `:open <section>` | 在主区预览某个章节文本 |
| `:abort` | 中断当前 stage |
| `:help` | 显示本帮助 |
| `:quit` | 退出 |

不带前导 `:` 的自由文本会被路由到 `intent` stage 进行 LLM 分类，
继续走 format_to_paper / survey / refine 之一。

## Onboarding

启动时若 `~/.folio/config.yml` 中没有任何 endpoint，TUI 会进入引导
模式：提示 `folio init` 或 `Ctrl+E` 打开 endpoints 面板配置首个
provider，避免直接落到死胡同界面。

## Transcript

每次 run 会在 `~/.folio/runs/<run_id>/transcript.md` 记录一份完整
对话副本：用户输入、澄清 Q&A、stage 进度、完成/失败 footer。崩溃
时也会保留已写入的内容，便于事后排查。

## 成本估算

`app/observability/pricing.py` 内置 deepseek / openai / anthropic 主流
模型的 USD/1k tokens 表，未知模型回退为 0；CNY 按 7.2 汇率换算。
StatusBar 每秒读 `trace.read_for_run(run_id)` 累加显示。
