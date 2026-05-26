# 查新、论文脊梁、全局图与实时监控验收

- generated_at: 2026-05-26 19:30 +08:00
- branch: feature/research-closure-monitor
- scope: 0.12.x/0.13.0-dev research closure line

## 验收结论

已完成研究闭环主链路：

- 查新检查点进入 literature、experiment_design、claim_ledger 阶段。
- 昂贵实验前新增 ExperimentNoveltyGate；精确重复或显式 duplicate 诊断会改道，普通相关工作只要求 review。
- PaperSpine 在正文写作前固化中心论点、动机链、贡献链、证据链、章节意图和 revision matrix。
- GlobalFigureSpec 根据 target profile 生成 overview figure panel 计划，并绑定 claim/source/artifact 证据。
- Preview 从静态 artifact tabs 升级为实时监控台，展示 stage graph、查新、PaperSpine、全局图、draft、ledger、cost/agent/gate。
- TUI PaperRun dashboard 新增“研究闭环”摘要，与 PaperRun snapshot 和 Preview monitor 使用同一事实源。

## 验收记录

- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/research-closure.test.ts test/paper/paperrun-execution.test.ts`
  - 5 pass, 0 fail, 45 expect calls
- `npx --yes bun@1.3.13 run --cwd packages/opencode typecheck`
  - passed
- `npx --yes bun@1.3.13 --cwd packages/preview test`
  - 3 pass, 0 fail
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\live-preview-browser-smoke.ps1`
  - passed: token rejection, read-only write rejection, SSE snapshot refresh
- `npx --yes bun@1.3.13 --cwd packages/opencode test`
  - 2572 pass, 38 skip, 2 todo, 56 fail
  - 失败集中在当前本机环境敏感路径：provider paid-model auth、全局 skill 污染、snapshot/storage 历史测试；本轮新增的 `paper/research-closure`、`paper/paperrun-execution`、`preview` 和 typecheck 均已通过。

## 剩余边界

- 当前 live preview browser smoke 验证 token、只读和 SSE 数据刷新；真实浏览器像素级 UI smoke 可在后续 Playwright 阶段继续加强。
- TaskFlow Git 分支工具因既有未归属 dirty 文件拒绝自动开分支，本轮手动使用 `feature/research-closure-monitor` 并保留该 dirty 文件不动。
