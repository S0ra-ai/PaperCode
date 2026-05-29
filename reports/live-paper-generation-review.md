# Paper Fucker 自生成论文包质量评审

- generated_at: 2026-05-27T14:15:00+08:00
- project_version: 0.13.0-dev
- live_provider_smoke: passed (`deep`, 2 models, chat passed)
- strict_acceptance: passed (`reports/strict-live-acceptance.md`)

## 2026-05-30 指标文案与实时来源复审

- 协议场景复跑 `run-8664dcbc-5828-4c2f-9fc2-1ef582c814da`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-8664dcbc-5828-4c2f-9fc2-1ef582c814da\exports\bundle-final-draft-paper-final-export-bbb9f81b-7c97-4288-8f80-7f87fa41f858\bundle-final-draft-paper-final-export-bbb9f81b-7c97-4288-8f80-7f87fa41f858.md`。
- 终稿已消除“主指标 排序”“在 排序”“主要包括 ... 等”“并用 ...”等模板痕迹；ranking 场景的构念效度示例改为围绕 `排序 nDCG@3`，不再错误套用类型检查说明。
- `live-paper-quality-benchmark` 的 arXiv 检索保持真实网络来源：HTML 搜索超时后重试，并回退到官方 Atom API；未引入 mock、fixture 或伪来源。
- 结论：本轮提升了代码论文终稿的专业可读性和真实来源链路稳定性，但仍需继续提升研究问题表达、相关工作综合和面向真实用户仓库的实验协议生成质量。

## 2026-05-30 相关工作综合复审

- 协议场景复跑 `run-e9022fae-7544-4fca-a751-a83127557fba`：status=`succeeded`，final export=`final`，Preview=`ready`，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-e9022fae-7544-4fca-a751-a83127557fba\exports\bundle-final-draft-paper-final-export-26faafd9-3283-4102-8c26-9e0b5617cde0\bundle-final-draft-paper-final-export-26faafd9-3283-4102-8c26-9e0b5617cde0.md`。
- 相关工作新增“综合来看”谱系段，把已验证文献归入工具使用或智能体自动化、实验复现与验证风险、任务数据与领域评测、论文到代码执行链路等类别。
- 每条英文摘要文献的相关性改为“作用”标签，降低重复主题词堆砌；坏词扫描未发现 `主指标 排序`、`在 排序`、`主要包括 `、`并用 `、`mock/fake/fixture/placeholder` 或内部证据 ID 残留。

## 2026-05-30 相关工作对比段复审

- 协议场景复跑 `run-e10a7c20-16ea-48dd-9179-718ef929c779`：status=`succeeded`，final export=`final`，Preview=`ready`，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-e10a7c20-16ea-48dd-9179-718ef929c779\exports\bundle-final-draft-paper-final-export-bf8afc2d-1fa3-42be-9a2b-66e6281acef6\bundle-final-draft-paper-final-export-bf8afc2d-1fa3-42be-9a2b-66e6281acef6.md`。
- “对比这些方向”段现在会尽量为不同作用组选择不同代表文献；协议场景中工具/智能体、复现验证、论文到代码执行链路分别选出不同代表，避免机械重复。
- 坏词扫描未发现 `核心参考包括`、`文献图中的 `、`主指标 排序`、`在 排序`、`mock/fake/fixture/placeholder` 或内部证据 ID 残留。

## 2026-05-30 研究问题、贡献与来源概述复审

- 协议场景复跑 `run-77987b20-fb0e-4f9b-8297-df026741b56f`：status=`succeeded`，final export=`final`，Preview=`ready`，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-77987b20-fb0e-4f9b-8297-df026741b56f\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 研究问题不再输出“围绕标题提出三个问题”的模板句，改为把研究目标拆成证据边界、对照有效性和复现一致性，并显式写出 `基线=1、消融=1、容器复现=1`。
- 主要贡献改为三条可审查链路：源码范围/来源/实验记录、本文方法与基线/消融同协议比较、本机与容器运行约束结果表述。
- 来源概述改为类型计数，例如 `代码材料 3 个、已验证论文来源 5 个、数据集来源 1 个`，不再使用“主要包括 ... 等”。
- 坏词扫描未发现 `本文围绕`、`证据约束写作框架`、`主要包括`、`主指标 排序`、`在 排序`、`并用 `、`mock/fake/fixture/placeholder` 或内部证据 ID 残留。
- 质量判断：当前协议样本已经更接近正常论文的研究问题、贡献与材料说明；下一轮应继续减少主文中的“终稿检查/导出”等工程审计词，转为期刊论文常用的证据充分性、复现条件和材料可得性表述。

## 本轮实跑

| 场景 | Run ID | 结果 | 判断 |
| --- | --- | --- | --- |
| 真实代码仓库出论文 | `run-ba7a7f1c-0f71-46eb-9b99-00380d8debdf` | final blocked, forced draft | 正确阻断：缺 baseline、ablation 和容器复现协议 |
| 显式 baseline/ablation/container 协议 | `run-0a186395-a7b8-4dc4-82bd-fc70bb79ae77` | final export | 通过：host 与 container 复现均成功 |
| 带证据清单的 final gate | `run-b5753200-d430-480b-8a29-edb70033c7be` | final export | 通过：SourceEvidenceManifest、数据、复现和 final gate 均满足 |

## 质量判断

Paper Fucker 当前已经具备“诚实闭环”的关键能力：没有复现证据时不会生成 final export；有明确实验协议和证据清单时可以生成 Markdown、LaTeX、PDF、DOCX bundle。

对计算机类论文，最重要的改进点已经生效：

- 代码分析绑定 source range，不凭空描述代码。
- package scripts 只识别 `test/typecheck/check/lint/bench/baseline/ablation/repro/container` 等实验相关入口。
- 没有仓库声明的 baseline、ablation、container runner 时，ResultReport 标记 `reproduction_failure`，final gate 阻断。
- 没有完整实验协议时会生成 `ExperimentProtocolGuidance.v1`，并在 forced draft 中给出 `baseline:<name>`、`ablation:<name>`、`repro:container` 的补齐建议。
- 有显式协议时，host 与 container 命令会写入 Experiment Runs，草稿展示实际执行命令、退出码、指标和环境。
- forced draft 顶部显式标记失败检查，不伪装为终稿。

## 仍需提升

- 真实仓库场景仍更像“工程审计报告”，不是可投稿论文。原因是缺少外部文献查新、明确科学问题、真实 benchmark 数据和可重复 baseline。
- `final` benchmark 仍依赖本地 evidence manifest，适合作为 gate 验收，不等价于真实科研实验。
- 下一步应把 starter pack 的模板进一步落地为可选择写入用户仓库的补丁，并在用户确认后运行真实 baseline/ablation/container。

## 验证记录

- `npx --yes bun@1.3.13 --cwd packages/opencode test`: 2637 pass, 0 fail.
- focused Paper tests: 27 pass, 0 fail.
- guidance targeted tests: 8 pass, 0 fail.
- experiment guidance preview targeted tests: PaperRun execution 4 pass, TUI workbench 11 pass, preview tests 3 pass.
- experiment starter pack targeted tests: PaperRun execution 4 pass, TUI workbench 11 pass, preview tests 3 pass.
- `packages/opencode` typecheck: pass.
- `packages/preview` test: 3 pass, 0 fail.
- Python research tools: 19 pass.
- `scripts/provider-matrix-smoke.ps1`: passed.
- `scripts/live-preview-browser-smoke.ps1`: passed.
- `scripts/strict-acceptance.ps1 -CheckTimeoutSeconds 300`: passed.

## 2026-05-27 增量复审

- 代码类实跑 `run-67ab1f3f-6c96-4d76-92da-fc4a44cba8ab` 仍正确阻断 final export，原因是缺少 baseline、ablation 和 container reproduction 协议。
- Preview 不再只显示 `reproduction_failure`，实时 monitor 已展示 `ExperimentProtocolGuidance.v1`：`baseline:<name>`、`ablation:<name>`、`repro:container`。
- TUI 侧栏 gate/next action 已优先提示补齐实验协议，而不是泛化成 forced draft。
- 结论：当前系统对“需要写代码跑实验”的论文更诚实，能把缺失实验协议转成用户可执行的补齐清单；但真实投稿级论文仍需要用户提供或系统运行真实 benchmark 数据。

## 2026-05-27 Starter Pack 复审

- 代码类实跑 `run-a58ecba9-9276-4588-b6fa-db7e407c7f94` 生成 `ExperimentProtocolStarterPack.v1`，artifact 数增至 43。
- Preview annotation 数为 6，并同时展示 `ExperimentProtocolGuidance.v1` 与 `ExperimentProtocolStarterPack.v1`。
- Starter pack 包含 `baseline:starter`、`ablation:starter`、`repro:container:starter`，以及 `baseline-starter.ts`、`ablation-starter.ts`、`Dockerfile.repro`、`README.md` 四个模板文件。
- Forced draft 已包含 `Experiment Protocol Starter Pack` 章节，用户能直接看到建议 scripts、starter files 和 next steps。
- 结论：系统现在不仅指出缺口，还能产出可复制的实验协议模板；下一步应在 TUI 中提供“写入工作区并运行”的受控操作。

## 2026-05-27 Starter File Artifact 复审

- 代码类实跑 `run-cd251fd2-ce6b-4e11-be02-592d7bae22a1` 生成 47 个 artifact，其中包含 `ExperimentProtocolStarterFile.v1`。
- 四个 starter 文件已独立落盘到 run artifacts：`experiments/starter/baseline-starter.ts`、`experiments/starter/ablation-starter.ts`、`experiments/starter/Dockerfile.repro`、`experiments/starter/README.md`。
- `ExperimentProtocolStarterPack.v1` 已回写每个文件的 `artifact_id`、`artifact_path` 和 `mime_type`；Preview monitor 与 forced draft 都能显示这些 artifact 路径。
- Forced draft 仍保持 `reproduction_failure` 阻断，不把 starter 模板当作真实实验结果。
- 结论：starter pack 已从“说明性 JSON”升级为“可追溯、可复制的 run artifacts”；下一步应提供 TUI 受控写入工作区和实际运行入口。

## 2026-05-28 可读论文生成复审

- 真实仓库代码场景复跑 `run-08742bda-323a-4201-8908-10e4df09e204`：status=`blocked`，final export=`blocked`，forced draft=`forced_draft`，failed checks=`reproduction_failure`。
- 该场景会执行 proposed 命令并记录失败；系统不再把缺失的 baseline、ablation 或 container 脚本合成为成功结果，相关缺口保留为 `ExperimentProtocolGuidance.v1` 和 starter pack。
- Forced draft 输出已改为论文式结构：Abstract、Introduction、Related Work、Method、Data and Code Availability、Evaluation Protocol、Results、Discussion、Experiments and Reproducibility、Limitations、Conclusion，诊断清单进入附录。
- 显式 baseline/ablation/container 协议场景复跑 `run-02d5ec9a-260d-4d75-a740-9889da9f902b`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-02d5ec9a-260d-4d75-a740-9889da9f902b\exports\bundle-final-draft-baseline-ablation\bundle-final-draft-baseline-ablation.md`。
- 结论：Paper Fucker 已能在代码论文场景中生成可读论文包；当实验协议完整时产出 final，当真实仓库实验失败或协议缺失时诚实阻断并给出可执行补齐清单。

## 2026-05-28 TUI / Preview Starter Apply 复审

- TUI PaperRun 工作台新增 `写入实验模板` 控制，调用 `/paper/runs/:runID/experiment-starter/apply`，默认写入 starter 文件并合并 `package.json` scripts。
- Preview monitor 的 `experiment_starter_pack` 增加 `apply_endpoint` 与推荐 payload，Web 监控台能把同一能力做成受控按钮；Preview 仍保持只读，不直接写工作区。
- 显式 baseline/ablation/container 协议场景复跑 `run-fe0c21f9-4a57-49ca-86f3-9f7b1579f4f6`：status=`succeeded`，14 个 stage 全通过，41 个 artifact，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-fe0c21f9-4a57-49ca-86f3-9f7b1579f4f6\exports\bundle-final-draft-baseline-ablation\bundle-final-draft-baseline-ablation.md`。
- 结论：从“缺协议提示”到“写入模板、替换真实实验、再跑 final”的产品闭环已经打通；下一步应接入真正的交互式终端执行器和浏览器级 Preview 按钮验收。

## 2026-05-28 Preview 实验运行摘要复审

- Preview monitor 新增 `experiment_runs`，从 `ExperimentRun.v1[]` artifacts 读取 host/container 运行记录。
- 每条摘要包含环境、实验 id、角色、状态、命令、退出码、耗时、指标和 stdout/stderr 截断片段；完整日志继续保留在 run artifacts。
- 缺协议场景可以在 Preview 中看到失败 run，显式协议场景可以看到 container succeeded run。
- 验证：`packages/opencode` typecheck 通过；`packages/preview` test 3 pass；`test/paper/paperrun-execution.test.ts` 4 pass。

## 2026-05-28 完整论文正文复审

- 显式 baseline/ablation/container 协议场景复跑 `run-d92fe98c-123e-433c-afd1-d0fb3cd8a359`：status=`succeeded`，14 个 stage 全通过，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-d92fe98c-123e-433c-afd1-d0fb3cd8a359\exports\bundle-final-draft-baseline-ablation\bundle-final-draft-baseline-ablation.md`。
- Markdown 结构：正文改为 Research Questions、Contributions、Method、Evidence Model、Experimental Setup、Results、Reproducibility、Discussion、Threats to Validity；Evidence Trace 与 Operational Reproducibility Checklist 后置到 appendix，避免主文像系统报告。
- 摘要和贡献现在会提升 method/result claim 信号；长中文 claim 按句子边界截断，避免出现 `paper. ts`、`测试文…` 或双句号。
- Results 不再输出“复现实验记录 / 当前 proposed / 综合建议”等运行日志式措辞，改为“在主指标 ... 上，proposed 与最佳 baseline ...”的论文式比较句。
- 写作器新增 `joinBlocks`，避免新增章节产生多余空行；正文不再像诊断日志或短报告。
- 浏览器级 Preview smoke 通过，覆盖 token 拒绝、只读写请求拒绝、SSE snapshot refresh、浏览器 shell 渲染、浏览器 snapshot 读取和实验运行摘要字段。
- 验证：`test/paper/authoring.test.ts` 5 pass；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed；`scripts/live-preview-browser-smoke.ps1` passed。

## 2026-05-28 机器与实验环境监控复审

- Preview monitor 新增 `machine_environment`，从 PaperRun diagnostics 中的 `PaperMachineProfile.v1` 与 `PaperExperimentEnvironmentStatus.v1` 压缩生成。
- 摘要包含 workspace、default run root、OS/CPU/内存/磁盘、GPU mode、GPU devices、runtime/compiler 状态、可选缺失数、阻断数和 notes。
- Web 监控台 gate 区展示“机器与实验环境”，用户能直接看到当前运行是 GPU 还是 CPU-only，以及哪些工具可用或缺失。
- 浏览器级 smoke 已覆盖 machine environment summary：`scripts/live-preview-browser-smoke.ps1` passed，报告见 `reports/live-preview-browser-smoke.md`。
- 验证：`packages/opencode` typecheck passed；`packages/preview` test 3 pass；`test/paper/paperrun-execution.test.ts` 4 pass。

## 2026-05-28 受控实验协议重跑复审

- 新增 `runPaperRunExperimentProtocol`：读取当前 PaperRun 的 `ExperimentPlan.v1` 与 `ExperimentProtocol.v1`，在指定 workspace 中执行 proposed、baseline、ablation 和 container reproduction 命令。
- 新增 HTTP 入口：`POST /paper/runs/:runID/experiments/run`，支持 `dry_run`、`workspace_path`、`timeout_seconds`。
- TUI PaperRun 工作台新增“运行实验协议”控制，默认 payload 为 `{ dry_run:false, timeout_seconds:120 }`。
- 执行结果会写回新的 `ExperimentRun.v1[]` 与 `ResultReport.v1` artifact，并发布 Preview snapshot，Web 监控台可继续读取实验运行摘要。
- 最新协议场景复跑 `run-9eb5b958-2a31-430d-a222-53583cf0c4ab`：status=`succeeded`，final export=`final`，failed checks 为空，Preview ready。
- 验证：`test/paper/paperrun-execution.test.ts` 5 pass；`test/cli/tui/paper-workbench.test.ts` 13 pass；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。

## 2026-05-28 终端级实验 Trace 复审

- `runPaperRunExperimentProtocol` 现在为每条实际执行命令写入 `ExperimentTerminalTrace.v1` artifact。
- Trace 记录命令、cwd、环境、退出码、超时状态、耗时、stdout/stderr 字节数、64 KiB 输出摘要和 `output_truncated` 标记。
- 事件流新增 `experiment.command.started` 与 `experiment.command.completed`，能从 PaperRun 事件层审计命令开始、结束、状态和 trace artifact。
- API 返回 `terminal_traces` 摘要，TUI/Preview 后续可以基于该字段做运行明细或终端视图。
- 当用户修复失败的 container 脚本后再次运行实验协议，系统会根据最新 `ResultReport.v1` 清除 `reproduction_failure` blocker；其他 blocker 不会被吞掉。
- 修复实验协议后如未重新执行 final export，`export_state` 会保持 blocked 并报告 `final_export_missing`；旧 forced draft 不会冒充 final。随后显式调用 `exportPaperRun(... forced:false)` 才生成真正 final bundle。
- final export 前会基于最新 `ClaimLedger.v1`、`ExperimentRun.v1[]` 和 `ResultReport.v1` 刷新 `DraftPaper.v1`；修复实验后导出的 Markdown 不再包含旧失败脚本或 `reproduction_failure`，并显示容器复现已通过。
- final export 刷新现在只取每个 experiment/environment 的最新运行记录；旧失败复现实验保留在 artifact 历史里，但不会进入终稿 Results 或 Reproducibility。
- 当最新 `ResultReport.v1` 已允许 final claims，终稿不再附带旧 `ExperimentProtocolGuidance.v1` / `ExperimentProtocolStarterPack.v1` 修复清单。
- 底层 artifact store 已改为生成唯一 artifact id，避免重启/恢复后 idFactory 复位导致后续导出撞库。
- 最新协议场景 benchmark：`run-308f562a-d633-440f-8a30-20aea2c4c20c`，status=`succeeded`，final export=`final`，failed checks 为空，Preview ready。
- Preview monitor 现在暴露 `experiment_terminal_traces`，Web 监控台显示“终端证据”，浏览器 smoke 覆盖 terminal trace summary。
- 验证：先观察到 `result.terminal_traces` 缺失导致目标测试失败；又观察到成功重跑后 reproduction gate 仍 blocked；再观察到 Preview monitor 缺少 terminal traces；随后观察到旧 forced draft 被误报为 final；最后观察到 final export 使用旧失败草稿。实现后 `test/paper/paperrun-execution.test.ts` 6 pass，`packages/opencode` typecheck passed，`packages/preview` test 3 pass，`scripts/live-preview-browser-smoke.ps1` passed，`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。

## 2026-05-28 论文正文可读性复审

- 最新协议场景 benchmark：`run-2523aa7b-da0a-4e23-81d0-4311ef860536`，status=`succeeded`，14 个 stage 全通过，final export=`final`，failed checks 为空，Preview ready。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-2523aa7b-da0a-4e23-81d0-4311ef860536\exports\bundle-final-draft-baseline-ablation\bundle-final-draft-baseline-ablation.md`。
- 引言和相关工作现在会优先使用 result claim；如果本次运行只有 method claim 但已有 `ResultReport.v1`，会回退到主指标、proposed 和最佳 baseline 的结果证据，不再退回泛泛描述。
- claim 文本进入正文前会清理中文句号后的英文式空格，避免出现 `。 系统`、`。 当前`、`。 因此` 这类可读性问题。
- 最新抽查确认：正文包含完整 Abstract、Introduction、Research Questions、Contributions、Related Work、Method、Evidence Model、Experimental Setup、Results、Reproducibility、Discussion、Threats to Validity、Limitations、Conclusion 和附录；未出现 `复现实验记录`、`当前 proposed`、`综合建议`、`Experiment Protocol Fix`、`System Architecture` 或旧 container 镜像文案。
- 验证：`test/paper/authoring.test.ts` 7 pass；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。

## 2026-05-28 Starter 到重跑闭环复审

- 修复点：`ExperimentProtocolStarterPack.v1` 的 `package_json_scripts` 不再混入 guidance 示例脚本，只写入实际随 starter pack 落盘的 `baseline:starter`、`ablation:starter`、`repro:container:starter`。
- 修复点：`runPaperRunExperimentProtocol` 在执行前会重新扫描当前 workspace 的 `package.json`。当用户写入 starter 并补全脚本后，系统会写入 refreshed `ExperimentProtocol.v1`，用新协议重建本次执行计划，而不是继续跑旧的缺口协议或默认 placeholder 命令。
- 新增回归：`applied starter scripts can become the rerun protocol after user completes them`，覆盖缺协议 PaperRun -> 写入 starter -> 用户补齐 package scripts -> 重跑 host/container -> final export。
- 新增 live benchmark 场景：`scripts/live-paper-quality-benchmark.ts --scenario starter-rerun`，覆盖同一闭环并生成可审计 summary。
- 最新 starter-rerun benchmark：`run-6bffc247-3982-4ac2-aa7c-35c0018ebcb1`，initial status=`blocked`，starter apply=`ready`，protocol rerun=`succeeded`，final export=`final`，Preview ready。
- 最新协议场景 benchmark：`run-4ccedadb-7737-4627-8200-073732f2dc96`，status=`succeeded`，final export=`final`，failed checks 为空，Preview ready。
- 最新缺协议代码场景 benchmark：`run-214f5d62-be40-44a6-9a0d-f38c3534b4e8`，status=`blocked`，final export=`blocked`，forced draft=`forced_draft`，failed checks=`reproduction_failure`，47 个 artifact，说明 starter pack 仍生成且不会伪装为成功实验。
- 验证：`test/paper/paperrun-execution.test.ts` 7 pass；`test/paper/run-api.test.ts -t "starter files"` 1 pass；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario starter-rerun` passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed；`scripts/live-paper-quality-benchmark.ts --scenario code` passed。

## 2026-05-28 Preview 终端证据与完整论文复审

- 先把浏览器 smoke 收紧到 DOM 级别：要求 Web 监控台真实显示 `ExperimentTerminalTrace.v1` 的 stdout 摘要，而不是只在 snapshot JSON 里存在。
- 收紧后暴露出 `packages/preview/src/client.js` 的模板字符串语法错误；该错误会让页面只剩静态 shell，旧 smoke 没有发现。
- 修复后 `renderTraceExcerpt` 默认展开 stdout/stderr 摘要，Preview 的“终端证据”区域能直接显示命令输出片段。
- Windows PowerShell 5.1 下 smoke 的中文 here-string 会转码，DOM 断言中的中文改用 Unicode escape，避免测试自身 mojibake。
- 最新协议场景 benchmark：`run-b862c3aa-9aef-4564-9abc-86e85357e34a`，status=`succeeded`，14 个 stage 全通过，41 个 artifact，final export=`final`，failed checks 为空，Preview ready。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-b862c3aa-9aef-4564-9abc-86e85357e34a\exports\bundle-final-draft-baseline-ablation\bundle-final-draft-baseline-ablation.md`。
- 人工抽查：正文包含 Abstract、Introduction、Research Questions、Contributions、Related Work、Method、Evidence Model、Experimental Setup、Results、Reproducibility、Discussion、Threats to Validity、Limitations、Conclusion 和附录；实验表格显示 proposed、baseline、ablation 均有 host/container 记录，final gate 通过。
- 验证：`node --check packages/preview/src/client.js` passed；`scripts/live-preview-browser-smoke.ps1` passed；`packages/preview test` 3 pass；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。

## 2026-05-28 论文主文论文感增强复审

- 新增 `Study Design And Evidence Flow` 主文段落，生成 Figure 1 和阶段表，串联 Materials、Code evidence、Protocol、Host/container execution 与 Manuscript gate。
- 将 `Evidence Model` 改为 `Evidence And Traceability`，主文使用“来源、断言、结构化记录”表达；`ClaimLedger`、`artifact`、`final export`、`PaperRun` 等内部词只允许出现在附录、manifest 或开发文档。
- `Method`、`Discussion`、`Threats`、`Limitations`、`Conclusion` 的措辞从工程审计口吻收敛为论文式证据、复现和限制描述。
- 最新协议场景 benchmark：`run-b7d06fb7-cff8-490e-ad14-6674a4848e83`，status=`succeeded`，14 个 stage 全通过，41 个 artifact，final export=`final`，failed checks 为空，Preview ready。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-b7d06fb7-cff8-490e-ad14-6674a4848e83\exports\bundle-final-draft-baseline-ablation\bundle-final-draft-baseline-ablation.md`。
- 人工抽查：主文包含 Abstract、Introduction、Research Questions、Contributions、Related Work、Study Design/Figure 1、Method、Evidence And Traceability、Experimental Setup、Results、Reproducibility、Discussion、Threats、Limitations、Conclusion；附录前未发现 `artifact`、`final export` 或 `PaperRun` 等内部词。
- 验证：`test/paper/authoring.test.ts` 7 pass；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。

## 2026-05-28 Related Work 文献图接入复审

- `LiteratureMap.v1` 已贯通 `orchestrator.ts`、`authoring.ts`、`run.ts` 和 `composeDraftPaper`，final export 刷新时会读取最新文献图。
- Related Work 现在区分 verified source 与未核验候选：verified source 写成“相关工作”并保留 DOI/arXiv/URL locator；未验证来源写成“候选文献”，明确不能作为领域共识、新颖性证明或实验结论支撑。
- 写作器只展示真实来源题名；没有真实来源时文献图保持为空并记录缺口，不再生成检索种子式论文题名。
- 写作器新增正文显示层清理：`source-range-grounded`、`source range`、`typecheck_pass`、`baseline:baseline-toy`、`succeeded` 等底层标识不再进入主文，分别显示为“基于源码范围的分析”“源码范围”“类型检查通过状态”、可读基线名称和“通过”。
- Results 与 Reproducibility 表格现在使用“本文方法/基线/消融”“通过/失败”“本机/容器复现环境”等可读字段；命令仍可保留在 Reproducibility 的运行明细中，作为复核入口。
- 新增 `References` 主文章节：只列入 verified 文献；未验证候选文献只会触发缺口提示，不会被列成正式引用。
- `checkReferences` 新增 `missing_verified_reference` warning：没有 verified paper source 时不会阻断 reviewable bundle，但会明确提示尚未达到投稿级引用准备度。
- protocol benchmark 现在只允许真实 verified source manifest；References 使用 arXiv 页面可核验的真实论文元数据，不允许伪造 arXiv、DOI 或 provider locator。
- 正文 citation 从内部 id 改成可读标签，例如 `[来源 1]`；完整 `cite:*`、`paper:*`、`material:code:*` 只保留在附录和 manifest。
- 最新协议场景 benchmark：`run-80e896a6-a7ca-4a02-a38e-bafbd58ac78c`，status=`succeeded`，14 个 stage 全通过，42 个 artifact，final export=`final`，failed checks 为空，Preview ready。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-80e896a6-a7ca-4a02-a38e-bafbd58ac78c\exports\bundle-final-draft-baseline-ablation\bundle-final-draft-baseline-ablation.md`。
- 人工抽查：Related Work 表格显示 verified source；References 位于 Appendix 前；附录前未发现旧检索种子标题、内部 provider id、`source-range-grounded`、`typecheck_pass`、`baseline:baseline-toy`、`succeeded`、`cite:*`、`material:code:*`、`ClaimLedger`、`artifact`、`final export` 或 `PaperRun`。
- 验证：`test/paper/authoring.test.ts` 9 pass / 148 assertions；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。

## 2026-05-29 真实引用与中文论文输出复审

- 移除默认文献发现中的合成 `open survey/search seed` 候选；没有真实来源或真实 source manifest 时，`LiteratureMap.v1` 保持空 sources 并写入 `insufficient_verified_literature` 缺口。
- protocol/final benchmark 的 source manifest 改为运行时 live arXiv search，再抓取对应 abs page 校验元数据；没有搜索结果或元数据缺失时直接失败，不写入固定或伪造 locator。最新 protocol 使用 5 条 live arXiv verified sources，manifest 记录 `live-arxiv-search+abs-page`、检索 query、abs URL 和抓取时间。
- 移除 final benchmark 中静态手写的本地 dataset、固定 accuracy 和本地 source manifest；benchmark 数据集现在由同一批 live arXiv source 生成 `LiveArxivRankingDataset.v1`，正文显示数据格式、来源、候选数和“不是人工相关性标注”的标签策略。
- 写作器主文标题改为中文：摘要、引言、研究问题、主要贡献、相关工作、研究设计与证据流、方法、证据与可追踪性、实验设置、结果、可复现性、讨论、效度威胁、限制与待修复项、结论、参考文献。
- 写作器增加中文显示层：验证状态、许可状态、实验角色、运行状态、复现清单和命令表均使用中文；命令 token 如 `baseline:toy`、`ablation:toy`、`repro:container` 不被误翻译。
- 最新协议场景 benchmark：`run-eae1c48b-4824-46f2-82a3-d71545d4ecb9`，status=`succeeded`，14 个 stage 全通过，42 个 artifact，final export=`final`，failed checks 为空，Preview ready。
- 最新 final 场景 benchmark：`run-9ce28f90-acb5-4902-94ce-a6ff5f8de695`，status=`succeeded`，14 个 stage 全通过，42 个 artifact，final export=`final`，failed checks 为空，source manifest 同样来自 `live-arxiv-search+abs-page`。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-9ce28f90-acb5-4902-94ce-a6ff5f8de695\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 人工抽查：主文为中文论文结构；Related Work 表格使用 live arXiv search 发现、abs page 校验的 locator 和页面发布日期；英文摘要不直接塞入中文主文，只显示“已核验英文摘要”和主题边界；数据与代码可用性写明 `LiveArxivRankingDataset.v1`、来源、候选数和标签策略；方法 claim 的来源绑定为 `material:code:*`，不再把代码方法断言绑定到 arXiv 文献；正文来源统计包含代码材料、已验证论文来源和数据集来源；参考文献位于附录前；未发现伪造 arXiv/DOI、固定 accuracy、检索种子式来源、`open survey`、`mock/fake/fixture`、伪容器镜像或伪 digest、`repro:容器`、英文旧章节标题或旧 `Prior work/Verification/Locator/Relevance` 表头。
- 验证：`test/paper/paperrun-execution.test.ts` 7 pass / 127 assertions；`test/paper/strict-acceptance.test.ts` 12 pass / 89 assertions；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` 和 `--scenario final` passed。

## 2026-05-30 no-mock 边界硬化

- Experiment runner 不再为容器复现自动填入伪镜像或伪 digest；只有真实 `container_image` / `container_digest` 传入时才写入运行记录。最新 protocol/final benchmark 的 `container-runs.json` 中 `environment.image`、`environment.digest`、`reproduction.image`、`reproduction.digest` 均为空，未出现 `paper-fucker/research-runner:fixture` 或 `sha256:fixture`。
- Hugging Face research probe 删除内置合成记录生成器；普通调用未授权网络时只返回 blocked diagnostic。测试数据只能通过 `test_records` 且显式 `allow_test_records=True` 注入，避免 product 调用误把测试记录当作真实 HF 来源。
- Crawler 的内存 HTML 路径从 fixture 语义改为 `provided_html`，表示用户/测试显式传入 HTML；没有提供 HTML 且未授权网络时仍然 blocked，不合成网页来源。
- 产品源码审计：`research-tools/src`、`packages/opencode/src/paper` 和 live benchmark 中未发现 `manual_fixture`、`local_fixture`、伪 HF job digest、伪容器镜像、固定 arXiv seed 或 benchmark 伪 locator。
- 验证：`python -m unittest research-tools.tests.test_huggingface_loop research-tools.tests.test_crawler` 13 pass；`test/paper/huggingface-loop.test.ts` + `test/paper/agent-team-capability-acceptance.test.ts` + `test/paper/strict-acceptance.test.ts` 17 pass / 118 assertions；`packages/opencode` typecheck passed。

## 2026-05-30 终稿导出 fallback 诊断复审

- Protocol benchmark 重新生成完整论文：`run-d8c6442c-7540-4f7b-93b7-9f5e393ee8d0`，14 个阶段全部成功，final export=`final`，failed checks 为空，Preview ready。
- 人工抽查最新 Markdown：包含摘要、引言、研究问题、贡献、相关工作、研究设计、方法、证据、数据与代码、实验设置、结果、可复现性、讨论、效度威胁、限制、结论、参考文献与附录；未发现 `mock/fake/fixture/placeholder`、机器 artifact/source id、`generic-preprint`、`typecheck_pass`、`PaperRun`、`ClaimLedger` 等正文残留。
- 修复导出语义：当 `latexmk` 失败但后续 LaTeX engine 成功生成有效 PDF 时，最终 PDF 和 manifest 不再把失败尝试写进 `tool_diagnostics`。最终失败的格式仍会返回结构化诊断。
- 最新 manifest 验证：`tool_diagnostics_count=0`，Markdown/LaTeX/PDF/DOCX 四种格式均为 `written`。
- 验证：`test/paper/export-pipeline.test.ts` 5 pass / 31 assertions；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。

## 2026-05-30 期刊工作台与中国计算机学报 profile

- 新增 `/journal` TUI 期刊工作台：内置期刊列表、当前期刊状态和未知期刊抓取草案分开显示。
- 首个中文内置期刊为《中国计算机学报》，profile id 为 `cjc-paper`，官方入口指向 `https://cjc.ict.ac.cn/`，模板策略为官方模板优先。
- 首页创建 PaperRun 时读取当前 TUI 期刊上下文；用户不需要在研究提示里手写期刊参数。
- 未知期刊只生成 `PaperGeneratedJournalProfile.v1` 草案，记录期刊名、官方入口和待确认动作；不会生成猜测格式规则。
- PaperRun HTTP payload 增加 `target_journal` / `target_journal_url`，intake、profile formatting、authoring appendix 和全局图 profile 都接入解析结果。
- 验证：`test/paper/profiles.test.ts`、`test/paper/intake.test.ts`、`test/cli/tui/paper-workbench.test.ts`、`test/paper/run-api.test.ts` 通过；`packages/opencode` typecheck 通过。

## 2026-05-30 导出真实性与 live benchmark 复审

- Export pipeline 增加二进制真实性校验：PDF 必须以 `%PDF-` 开头，DOCX 必须以 ZIP/OpenXML 的 `PK` 头开头，空文件或无效字节会被标记为 `failed` 且不落盘。
- 回归测试新增“无效 PDF/DOCX renderer 输出必须失败”，测试桩也改为真实 PDF/DOCX 文件头，避免测试本身继续使用占位导出。
- `exportPaperRun` 的用户消息不再把部分格式失败描述成完整成功；内容门禁通过但导出格式失败时会提示查看 `tool_diagnostics`。
- `getPaperRunSnapshot` 的 `export_state` 现在优先从最新 `ExportBundle.v1` artifact 恢复完整文件状态；恢复、Preview 和实时监控不会只看 written export facts 而漏掉 `pdf:failed` / `docx:failed`。
- 最新 protocol benchmark：`run-81e3d5dd-cdbc-4145-ad93-305bdefc029c`，status=`succeeded`，14 个 stage 全通过，final export=`final`，failed checks 为空，Preview ready。
- 最新 final benchmark：`run-8e9f8c83-7e88-43c3-898f-1896a0ee0a41`，status=`succeeded`，14 个 stage 全通过，final export=`final`，failed checks 为空，Preview ready。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-81e3d5dd-cdbc-4145-ad93-305bdefc029c\exports\bundle-final-draft-paper-final-export-aa79fc53-c637-4c21-9cdf-9603e5f4a085\bundle-final-draft-paper-final-export-aa79fc53-c637-4c21-9cdf-9603e5f4a085.md`。
- 人工抽查：protocol 与 final 的 source manifest 都来自 `live-arxiv-search+abs-page`，包含真实 arXiv abs URL、检索 query、抓取时间和页面发布日期；未发现 `paper-a`、`search-seed`、`mock/fake/fixture`、伪容器镜像或伪 digest。PDF 文件头为 `%PDF-1.5`，DOCX 文件头为 `PK`，不是占位文本。
- 验证：`test/paper/export-pipeline.test.ts` + `test/paper/authoring.test.ts` 15 pass / 209 assertions；`test/paper/paperrun-execution.test.ts -t "snapshot export state preserves failed formats"` 1 pass；`packages/opencode` typecheck passed；产品源码 no-mock `rg` 审计无匹配；`scripts/live-paper-quality-benchmark.ts --scenario protocol` 和 `--scenario final` passed。

## 2026-05-30 PaperRun 集成测试稳定性复审

- `test/paper/paperrun-execution.test.ts` 属于重型 PaperRun 集成测试，单个用例会真实跑 stage graph、实验协议、Preview snapshot 和导出链路；此前默认 60s per-test timeout 会在用例接近完成时中断，随后 `afterEach` 清理临时目录，后台异步任务继续访问已删除 run dir，产生 ENOENT/SQLite 连带错误。
- 已为该文件中的重型 PaperRun 用例设置显式 `PAPER_RUN_INTEGRATION_TIMEOUT=180000`，保留普通测试的默认 60s。这样 `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/paperrun-execution.test.ts --timeout 60000` 仍可运行完整文件，不再因为 CLI 默认 timeout 提前杀掉集成链路。
- 验证：单独慢用例 `-t "creation drives"` 在 60s CLI timeout 下通过，耗时 42.375s；完整 `test/paper/paperrun-execution.test.ts` 8 pass / 132 assertions，耗时 296.68s；`packages/opencode` typecheck passed。

## 2026-05-30 论文结果格式与表述复审

- 写作器的数值格式统一为四位小数，结果句从 `本文方法=1` / `最佳基线=0.8659` 改为“本文方法为 1.0000，最佳基线为 0.8659”，避免生成稿像临时日志或表格拼接。
- 实验运行记录中 `ratio` 单位不再直接拼到指标后，正文显示为 `排序 nDCG@3=1.0000`。
- 研究设计章节不再写“图 1”却只给表格，改为“下表展示研究设计与证据流”，避免虚构图号；实验运行记录保留独立“表 1”说明。
- 摘要不再写“当前状态为：通过终稿检查”这类运行日志式句子，改为“在当前证据边界内，终稿检查已通过”。
- 对英文 claim 进入中文主文的常见短语做定向中文化：`declared baseline`、`experiment runs`、`export gates`、`final paper generation`、`primary reproducibility metric` 不再被半翻译成 `declared 基线` 这类混合表达。
- 研究设计与证据流章节补充“材料不足”和“实验链路不足”的区别，保留完整稿长度保护，不用降低测试阈值换取通过。
- 最新 protocol benchmark：`run-57642a34-3a1c-4cec-bb2f-ad2e32cbefce`，status=`succeeded`，final export=`final`，failed checks 为空，Preview ready。
- 人工抽查：final Markdown 出现“本文方法为 1.0000”“下表展示研究设计与证据流”“在当前证据边界内，终稿检查已通过”“排序 nDCG@3=1.0000”，未出现旧式 `本文方法=...`、`当前状态为`、虚构 `图 1`、`mock/fake/fixture`、固定 arXiv seed 或伪容器 digest。
- 验证：`test/paper/authoring.test.ts` 10 pass / 190 assertions；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。

## 2026-05-30 benchmark arXiv 来源真实性闸门

- `scripts/live-paper-quality-benchmark.ts` 增加 `assertAuthenticVerifiedArxivSources` 和 `assertNoBenchmarkSourceResidue`：每条 benchmark arXiv 来源必须来自 live search 后抓取的 abs page，且 `source_id`、`arxiv_id`、canonical abs URL、verification method 和 `fetched:https://arxiv.org/abs/...` diagnostic 必须一致。
- Source manifest 和 live ranking dataset 写入前都会执行残留扫描；发现 `paper-a`、`search-seed`、伪 source discovery seed、mock/fake/fixture/pseudo/placeholder 等语义会直接中断 benchmark，不再允许进入 PaperRun。
- 最新 protocol benchmark：`run-9ee2abfe-2f55-415a-b665-752e7c4f21f2`，status=`succeeded`，14 个 stage 全通过，42 个 artifact，final export=`final`，failed checks 为空，Preview ready。
- 抽查：`source-evidence.json` 含 5 条真实 arXiv 来源，均记录 `live-arxiv-search+abs-page`、真实 `https://arxiv.org/abs/<id>`、检索 URL、抓取时间和页面发布日期；本次 run 的 Markdown exports 与 run 目录未发现伪 locator、mock/fake/fixture、固定 arXiv seed 或伪容器 digest。
- 验证：`test/paper/strict-acceptance.test.ts` 12 pass / 93 assertions；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。

## 2026-05-30 复现一致性结论修复

- 修复 `hostContainerConsistencySummary` 使用格式化差值字符串判断复现差异的问题；此前数值差值 `0.0000` 会被误判为非零，导致表格显示本机/容器完全一致时正文仍写“发现 3 个本机/容器差异”。
- 新逻辑使用原始状态和原始数值计算一致性，并用 `1e-9` 容差判断主指标差异；本机或容器记录缺失仍会被视为真实差异。
- 最新 protocol benchmark：`run-bb5edba0-4cd4-4535-8843-8d796a6bfd80`，status=`succeeded`，final export=`final`，failed checks 为空，Preview ready。
- 抽查：本次 final Markdown 在“可复现性”章节写入“本次运行没有发现本机/容器状态或主指标差异”，未再出现错误的“本机/容器差异”结论；同时未发现 `mock/fake/fixture`、`search-seed`、`paper-a` 或伪来源残留。
- 验证：`test/paper/authoring.test.ts` 10 pass / 192 assertions；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。

## 2026-05-30 终稿附录可读性复审

- 断言证据表和证据记录索引不再把完整 `artifact-*`、`material:code:*`、`claim:*` 或 `处理=none` 直接写进 Markdown；正文只展示“代码材料 3 个”“结构化证据 6 条”等审稿可读摘要。
- 完整机器标识、路径、哈希和导出状态仍保留在运行目录结构化 JSON、导出 manifest 和实时监控台中；论文正文只承担人工阅读与审稿摘要职责。
- 最新 protocol benchmark：`run-daa3af49-761b-47de-a74f-6db4760d059b`，status=`succeeded`，final export=`final`，failed checks 为空，Preview ready。
- 抽查：本次 final Markdown 的附录 A/E/F 只显示断言编号、章节、来源类型和证据数量；`rg` 未发现完整 `artifact-*`、`material:code:*`、`claim:method`、`处理=none`、伪来源或 mock/fixture 残留。
- 验证：`test/paper/authoring.test.ts` 10 pass / 196 assertions；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。

## 2026-05-30 数据与投稿准备度显示复审

- 投稿准备度附录不再显示 `generic-preprint` 或完整数据集机器 id；目标稿件配置显示为“通用预印本”，数据与代码可用性只显示数量和复核入口。
- 数据与代码可用性章节不再打印 `dataset:local:*`、`LiveArxivRankingDataset.v1` 或 `live-arxiv-search+abs-page`；改为“实时 arXiv 排名评测集”和“实时 arXiv 检索和摘要页核验”。
- 登记命令中的容器复现项不再显示 `container:repro container`，改为“容器复现”。
- 最新 protocol benchmark：`run-d4b3635e-b5c1-4ae0-892b-0187904fb05f`，status=`succeeded`，final export=`final`，failed checks 为空，Preview ready。
- 抽查：本次 final Markdown 未发现 `dataset:local`、`generic-preprint`、`container:repro container`、`LiveArxivRankingDataset.v1`、`live-arxiv-search+abs-page`、完整 artifact/source/claim id、伪来源或 mock/fixture 残留。
- 验证：`test/paper/authoring.test.ts` 10 pass / 203 assertions；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。

## 2026-05-30 结果表格标签复审

- 结果表、复现表和登记命令表不再出现“本文方法 | 本文方法”重复标签；实验编号显示为“证据驱动工作流”，角色显示为“本文方法”。
- 实验运行记录中的本机平台从 `本机 win32` 显示为“本机 Windows”，避免 Node 平台名进入论文正文。
- 实验设置句子改为“被评估方法为‘代码证据驱动工作流’，主观测指标为‘排序 nDCG@3’”，避免中文句中出现多余空格。
- 最新 protocol benchmark：`run-95a2c6a0-061f-45e9-a938-0e5800222dac`，status=`succeeded`，final export=`final`，failed checks 为空，Preview ready。
- 抽查：本次 final Markdown 未发现 `| 本文方法 | 本文方法`、`proposed`、`本机 win32`、机器数据集名、完整 artifact/source/claim id 或 mock/fixture 残留。
- 验证：`test/paper/authoring.test.ts` 10 pass / 207 assertions；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。

## 2026-05-30 benchmark locator 收口复审

- Related Work 的定位信息不再显示裸 arXiv 编号或裸 DOI；统一显示为 `arXiv:<id> (https://arxiv.org/abs/<id>)` 或 `doi:<id> (<url>)`，避免被误读为占位 locator。
- `scripts/live-paper-quality-benchmark.ts` 每次运行前会清空当前 scenario 输出目录，避免旧 `source-evidence.json`、实验数据或导出摘要继续被后续 benchmark 误读。
- final/protocol benchmark 在生成终稿 Markdown 后执行残留扫描；出现固定 seed、占位来源、测试来源语义或旧 strict-live 本地来源时直接失败，不写入通过报告。
- 最新 protocol benchmark：`run-8ce6e48b-e95f-4812-98e2-0ab527119750`，status=`succeeded`，final export=`final`，failed checks 为空，Preview ready。
- 抽查：`tmp/live-paper-quality-benchmark/protocol` 根目录仅保留最新 `paperrun-summary.json`；workspace 的 `source-evidence.json` 含 5 条 live arXiv abs page verified source；终稿 Related Work 显示真实 arXiv URL，未发现固定 arXiv seed、旧本地来源、伪容器镜像或测试来源残留。
- 验证：`test/paper/authoring.test.ts` 11 pass / 218 assertions；`test/paper/strict-acceptance.test.ts -t "fake locator"` 1 pass / 16 assertions；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。
