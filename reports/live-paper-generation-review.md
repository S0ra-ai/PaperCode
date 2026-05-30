# Paper Fucker 自生成论文包质量评审

- generated_at: 2026-05-27T14:15:00+08:00
- project_version: 0.13.0.59-dev
- live_provider_smoke: passed (`deep`, 2 models, chat passed)
- strict_acceptance: passed (`reports/strict-live-acceptance.md`)

## 2026-05-30 方法流程图复审

- 协议场景复跑 `run-ad13aef6-4ee0-4709-93fe-92792e561898`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-ad13aef6-4ee0-4709-93fe-92792e561898\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 方法章节的图 1 现在输出 Mermaid `flowchart LR`。
- 图 1 同时展示候选集、特征计算、scorePaper、rankAgentTeamPapers、排序 nDCG@3，以及词项匹配基线、无证据覆盖消融和容器复现分支。
- 质量判断：方法图从纯文本箭头推进到可渲染结构图，改善论文的图表呈现和读者扫描效率。

## 2026-05-30 作者与声明占位文案复审

- 协议场景复跑 `run-7f9755a5-7fae-4515-8ff3-4add5f9d79be`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-7f9755a5-7fae-4515-8ff3-4add5f9d79be\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 作者信息现在输出作者、机构和通信作者为 `待补充`。
- 声明章节现在输出基金项目、作者贡献、利益冲突和伦理审批为 `待补充`。
- 质量判断：成稿不再把作者与声明缺失信息写成内部台账式 `未登记`，更接近正式论文模板中的待填字段。

## 2026-05-30 代码包名元数据复审

- 协议场景复跑 `run-11b5ceea-736f-4ac4-89bf-689395b7ab8d`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-11b5ceea-736f-4ac4-89bf-689395b7ab8d\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 数据与代码可用性章节现在写出代码包 `paper-fucker-live-ranking-protocol`。
- 数据与代码可用性章节同时保留代码仓库、产品版本、修订号、工作区状态和许可证。
- 质量判断：代码可用性从只给仓库与版本，推进到明确相对路径所属代码包，降低多包仓库或临时实验 workspace 的复现歧义。

## 2026-05-30 产品版本元数据复审

- 协议场景复跑 `run-6a244ca0-0caf-414e-8ee0-be7c4de57012`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-6a244ca0-0caf-414e-8ee0-be7c4de57012\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 数据与代码可用性章节现在写出产品版本 `0.13.0.55-dev`，不再回退到临时 workspace package 版本 `0.1.0`。
- 数据与代码可用性章节同时写出代码修订 `31f522b1` 和工作区状态。
- 质量判断：代码可用性从 fixture package 版本推进到产品版本，避免临时实验工作区 package 版本误导复现实验读者。

## 2026-05-30 代码工作区状态复审

- 协议场景复跑 `run-fea9a177-212e-449d-a593-f2bb8972737d`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-fea9a177-212e-449d-a593-f2bb8972737d\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 数据与代码可用性章节现在写出代码修订 `b903eb4d`。
- 数据与代码可用性章节现在写出 `代码工作区状态：含未提交或未跟踪变更`。
- 质量判断：代码可用性从只定位提交，推进到同时说明工作区是否含未提交状态，避免读者误以为 commit 可以完全复原当前生成上下文。

## 2026-05-30 代码修订元数据复审

- 协议场景复跑 `run-ad87f84f-658d-4eb5-a5c4-bb4cd52cc531`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-ad87f84f-658d-4eb5-a5c4-bb4cd52cc531\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 数据与代码可用性章节现在写出代码修订 `b4c2d644`。
- 终稿同时保留代码仓库地址、代码版本和代码许可证。
- 质量判断：代码可用性从包级版本推进到可定位 git 修订，更接近可复现实验论文的代码归档要求。

## 2026-05-30 资源记录边界复审

- 协议场景复跑 `run-21e49559-ee4d-4f71-a0b5-bd71da985fd6`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-21e49559-ee4d-4f71-a0b5-bd71da985fd6\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 可复现性章节新增 `资源记录边界`。
- 终稿明确当前实验记录包含耗时。
- 终稿明确未登记峰值内存和 GPU 用量，不能把资源结论外推到未记录维度。
- 质量判断：可复现性章节从只列耗时表，推进到说明资源记录覆盖范围，更接近代码实验论文资源声明。

## 2026-05-30 代码可用性元数据复审

- 协议场景复跑 `run-2b119262-1cd8-4951-9d1e-f46db44971cd`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-2b119262-1cd8-4951-9d1e-f46db44971cd\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 数据与代码可用性章节现在写出代码仓库地址 `https://github.com/ZhuchenZhong/paper_fucker`。
- 数据与代码可用性章节现在写出代码版本 `0.1.0`。
- 数据与代码可用性章节现在写出代码许可证 `MPL-2.0`。
- 质量判断：代码可用性从“未登记”推进到可复核仓库、版本和许可证信息，更接近计算机类论文的可复现声明。

## 2026-05-30 摘要评测边界复审

- 协议场景复跑 `run-761eef8e-ee89-463d-b8cd-18374d9e9f95`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-761eef8e-ee89-463d-b8cd-18374d9e9f95\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 摘要现在写出 `评测集候选数 5`。
- 摘要现在说明标签由实时 arXiv 检索排序、主题匹配、元数据完整度和发表时间派生。
- 摘要明确这些标签不是人工相关性标注。
- 质量判断：摘要从只报告指标差异，推进到同步交代评测规模和标注边界，降低读者对结果外推能力的误读。

## 2026-05-30 结果统计解释复审

- 协议场景复跑 `run-04569369-d707-46c6-94ce-d299ff81fd37`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-04569369-d707-46c6-94ce-d299ff81fd37\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 结果章节新增 `统计解释` 段落。
- 终稿明确本文方法、基线和消融各在本机与容器环境执行一次。
- 终稿明确当前数值是确定性协议观测，不计算置信区间或显著性检验。
- 质量判断：结果章节从只报告差值，推进到同时说明统计解释边界，降低把单次协议观测误读为统计显著结论的风险。

## 2026-05-30 可复现性环境声明复审

- 协议场景复跑 `run-4754d433-f5e5-47e3-9d25-96e91074e454`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-4754d433-f5e5-47e3-9d25-96e91074e454\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 可复现性章节新增 `实验环境声明`。
- live 终稿写出 `本机平台：Windows，Node.js v24.3.0`，并标明容器隔离复现环境已登记。
- 作者链路测试覆盖容器镜像场景，确认 `paper-fucker/research-runner:test` 会进入环境声明。
- 质量判断：可复现性章节从只比较结果，推进到同时说明运行环境边界，更接近计算机类论文复现实验写法。

## 2026-05-30 ranking 方法图复审

- 协议场景复跑 `run-3d4325f0-74e9-47c0-81a5-bcc9512513d4`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-3d4325f0-74e9-47c0-81a5-bcc9512513d4\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 方法章节新增 `图 1 候选论文排序与复现实验流程`。
- 图 1 串联候选论文集合、特征计算、`scorePaper` 评分、`rankAgentTeamPapers` 排序和排序 nDCG@3 评测。
- 对照分支列出词项匹配基线、无证据覆盖消融和容器复现，不把主实验重复列为对照。
- 质量判断：方法章节从纯 prose 和公式推进到有流程图题的论文式方法说明。

## 2026-05-30 代码可用性复审

- 协议场景复跑 `run-cfecbbde-7ecc-45c8-a176-ce20754adf25`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-cfecbbde-7ecc-45c8-a176-ce20754adf25\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 数据与代码可用性章节现在包含代码可用性段落。
- 代码可用性段落写出方法实现 `rankAgentTeamPapers`、`scorePaper`、`claimLedgerCoverage`，以及排名测试、词项匹配基线、无证据覆盖消融和容器复现实验入口。
- 代码仓库地址、代码版本和代码许可证未登记时明确输出未登记状态，不使用“当前代码工作区”等内部口吻。
- 质量判断：可用性章节从只有数据集表，推进到数据、代码和复现实验入口同时可审查。

## 2026-05-30 ranking 公式符号复审

- 协议场景复跑 `run-889f01bc-2688-4079-a911-376cb55a9300`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-889f01bc-2688-4079-a911-376cb55a9300\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 方法章节的评分公式后现在说明 `p` 表示待排序候选论文。
- 方法章节同时说明 `relevance`、`claim_coverage` 和 `recency` 均按候选论文逐项计算。
- 质量判断：公式从可读表达推进到符号自洽表达，减少读者对变量含义的猜测。

## 2026-05-30 ranking 评分公式复审

- 协议场景复跑 `run-5a379d74-d0e0-42e3-b520-6efc60eda2ba`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-5a379d74-d0e0-42e3-b520-6efc60eda2ba\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 方法章节现在根据 `scorePaper` 代码证据输出 `score(p) = 0.62 * relevance(p) + 0.28 * claim_coverage(p) + 0.10 * recency(p)`。
- 方法章节同时说明三个权重来自 `scorePaper` 的当前实现。
- 质量判断：ranking 方法从 prose 描述推进到可复核公式表述，更接近算法论文方法章节。

## 2026-05-30 正式声明区块复审

- 协议场景复跑 `run-6b7c1898-a944-4198-a517-bc9d4f71d4eb`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-6b7c1898-a944-4198-a517-bc9d4f71d4eb\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 作者信息区只保留作者、机构和通信作者登记状态，不再输出“进入投稿前”或“系统不会”等产品说明。
- 结论后、参考文献前新增 `声明` 区块，包含基金项目、作者贡献、利益冲突和伦理审批状态。
- 本次 live benchmark 首次遇到真实 arXiv 候选集退化，已改为多组真实 arXiv 查询重试；仍退化时阻断并输出诊断，不生成替代数据。
- 质量判断：终稿从产品生成说明进一步收敛为正式稿件形态，同时 live 验收对真实外部数据波动更稳健。

## 2026-05-30 实验表号复审

- 协议场景复跑 `run-4f293653-3314-4659-a0d0-baa735e0be40`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-4f293653-3314-4659-a0d0-baa735e0be40\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 结果章节主结果表增加 `表 1` 说明。
- 可复现性章节的本机/容器主指标差异表增加 `表 2` 说明。
- 实验执行摘要改为 `表 3`，避免复现章节重复占用 `表 1`。
- 质量判断：核心结果表、复现对比表和执行摘要表现在具备连续表号，更接近正式论文排版。

## 2026-05-30 作者信息区块复审

- 协议场景复跑 `run-e0d800c5-cc7e-4bf4-a9d7-1cfadf23362a`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-e0d800c5-cc7e-4bf4-a9d7-1cfadf23362a\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 终稿现在在题名后、摘要前输出作者信息区块。
- 未登记作者、机构和通信作者时输出未登记状态，不伪造作者或机构。
- 扫描未发现 `Paper Fucker` 或 `OpenCode` 品牌进入作者信息。
- 质量判断：题名页元数据缺口已显式化，后续可由 TUI 作者和期刊配置替换为真实信息。

## 2026-05-30 内部来源标记复审

- 协议场景复跑 `run-5e567e47-2155-4625-be20-7f9de4404108`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-5e567e47-2155-4625-be20-7f9de4404108\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 方法章节不再出现 `[来源 1]`、`[来源 2]` 或类似内部证据标记。
- 实现定位改为“具体实现位置见附录 A”，主文保留论文式方法说明。
- 质量判断：主文减少系统内部导出痕迹，证据定位留在附录，更接近正式论文排版。

## 2026-05-30 相关工作编号引用复审

- 协议场景复跑 `run-58eab6bf-39bc-4cc1-98a2-87890c66a79f`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-58eab6bf-39bc-4cc1-98a2-87890c66a79f\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 相关工作正文现在输出 `Explaining Rankings with Hidden Group Bonuses [1]`、`Discrimination Is Generation... [3]` 和 `Same Ranking, Different Winner... [2]`。
- 参考文献编号与正文编号一致：`[1]` 为 Hidden Group Bonuses，`[2]` 为 Same Ranking，`[3]` 为 Discrimination Is Generation。
- 质量判断：正文与参考文献之间建立了可追踪引用关系，更接近正式论文阅读体验。

## 2026-05-30 关键词章节复审

- 协议场景复跑 `run-208d29b9-a590-4244-99fe-fb10dffd3500`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-208d29b9-a590-4244-99fe-fb10dffd3500\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 终稿现在在 `摘要` 后、`引言` 前输出 `关键词` 章节。
- 关键词为 `候选论文排序；证据覆盖；排序 nDCG@3；词项匹配基线；容器复现`。
- 质量判断：生成稿补齐正式论文常见的主题索引信息，结构上更接近投稿稿件。

## 2026-05-30 参考文献作者复审

- 协议场景复跑 `run-98cdc549-2a3d-4386-b132-f70a9c210b70`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-98cdc549-2a3d-4386-b132-f70a9c210b70\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- `SourceEvidenceManifest.v1` 中 3 条 arXiv 来源均包含作者字段，作者数分别为 5、2、1。
- 参考文献改为作者、标题、arXiv 定位信息、发表时间和检索时间顺序；多作者使用分号分隔。
- 坏词扫描确认不再出现 `1. Explaining Rankings with Hidden Group Bonuses. arXiv...` 这种无作者引用开头。
- 质量判断：参考文献从检索清单更接近正式论文引用格式，便于读者识别来源责任主体。

## 2026-05-30 ranking 主文 gate 口吻复审

- 协议场景复跑 `run-b1ac9807-fe7b-4fd5-9b03-ed28c8fcc377`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-b1ac9807-fe7b-4fd5-9b03-ed28c8fcc377\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 方法章节补充 `relevance`、`claim_coverage` 和 `recency` 的语义，说明排序规则而不是只列接口名。
- 实验设置改为比较同一候选集上的排序规则表现；结果和可复现性章节改为环境一致性表述。
- 坏词扫描显示方法、实验设置、结果和可复现性章节未出现 `结论性表述`、`足以支撑`、`支撑证据`、`复核材料` 或 `复核完整排序`。
- 质量判断：主文更像论文方法与实验说明，减少了产品 gate 和审计报告口吻。

## 2026-05-30 ranking 研究问题复审

- 协议场景复跑 `run-de8331e2-fc53-4c31-b70c-cdf212b47ad4`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-de8331e2-fc53-4c31-b70c-cdf212b47ad4\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 研究问题改为排序机制、特征贡献和环境一致性三项问题，分别对应方法、结果和可复现性章节。
- 坏词扫描未发现 `结论性表述`、`完整复核材料`、`足以支撑`、`证据充分性检查` 或 `待验证状态`。
- 质量判断：研究问题章节从流程验收说明转为论文问题定义，读者能直接理解本文要回答什么。

## 2026-05-30 ranking 附录复审

- 协议场景复跑 `run-20512e64-1a0d-4eca-82f7-efe68a55b787`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-20512e64-1a0d-4eca-82f7-efe68a55b787\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 附录 A 改为材料与实现定位，包含材料类型、排序方法实现和复核材料。
- 附录 B 改为复现实验入口，列出本文方法、词项匹配基线、无证据覆盖消融和容器复现入口。
- 坏词扫描未发现 `## 附录 A：证据追踪`、`## 附录 B：复现清单`、`断言 1`、`断言状态`、`证据追踪表`、`研究简报`、`就绪`、`结论表述条件` 或 `项目声明的实验入口`。
- 质量判断：附录从产品审计清单收敛为论文复核材料和复现实验入口。

## 2026-05-30 ranking 限制章节复审

- 协议场景复跑 `run-c1acb453-3fb0-45ff-b14c-a41ad348b1d3`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-c1acb453-3fb0-45ff-b14c-a41ad348b1d3\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 终稿章节标题改为 `限制`，不再显示 `限制与待修复项`。
- 限制内容明确候选数 `5`、标签不是人工相关性标注、词项匹配基线偏弱，以及后续需要跨主题验证、更大候选池、人工相关性标注和更多随机种子重复。
- 坏词扫描未发现 `## 限制与待修复项`、`未发现阻断项` 或 `待修复`。
- 质量判断：限制章节从工程状态说明转为论文边界说明，读者能直接看到当前实验不能外推的原因。

## 2026-05-30 ranking 讨论与效度威胁复审

- 协议场景复跑 `run-876772fa-cf98-4b3f-9725-045d4902f376`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-876772fa-cf98-4b3f-9725-045d4902f376\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 讨论章节改为具体解释：完整排序相对词项匹配基线提升 `0.0371`，相对无证据覆盖消融提升 `0.0684`，并说明 `claim_coverage` 对前三位排序的影响。
- 效度威胁改为标注效度、指标效度、基线效度、消融效度和外部效度，明确候选数 `5`、标签不是人工相关性标注、词项匹配基线偏弱和后续需要 BM25/向量检索/学习排序等强基线。
- 坏词扫描未发现 `结果解释必须与证据边界保持一致`、`类型检查通过、单一数据集通过或单次脚本通过`、`流程完整性`、`复核材料需要保存命令` 或 `证据范围`。
- 质量判断：讨论与效度威胁从防御性安全声明转为结果解释和实验限制分析，更接近论文讨论章节。

## 2026-05-30 ranking 引言与贡献复审

- 协议场景复跑 `run-0d762879-9235-49f1-83d4-7e3a2a531f7e`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-0d762879-9235-49f1-83d4-7e3a2a531f7e\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 引言改为文献检索、综述准备和研究选题中的候选论文排序动机，说明仅依赖词项匹配的局限和证据覆盖特征的评价目标。
- 主要贡献改为三项论文贡献：`relevance`、`claim_coverage`、`recency` 评分，词项匹配基线/无证据覆盖消融，以及排序 nDCG@3 与本机/容器复现评价。
- 方法章节将实现位置和实验入口写成排序入口、评分入口、完整排序、词项基线、证据覆盖消融和环境一致性，不再使用审计式“源码证据记录”口吻。
- 坏词扫描未发现 `面向计算机类论文，正文完整性`、`结果部分需要解释的是`、`当前结果显示：以排序 nDCG@3 作为主指标`、`可审查链路`、`实验记录统一为可审查证据`、`源码证据记录`、`正文结论绑定` 或内部 gate 词残留。
- 质量判断：前置章节从产品生成说明转为任务动机、评分方法和实验贡献，更接近人工协作稿。

## 2026-05-30 ranking 主文结构复审

- 协议场景复跑 `run-821b9655-2772-492d-be46-c3b9ceeadbe0`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-821b9655-2772-492d-be46-c3b9ceeadbe0\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 主文章节收敛为摘要、引言、研究问题、贡献、相关工作、方法、数据与代码可用性、实验设置、结果、可复现性、讨论、效度威胁、限制、结论和参考文献。
- 坏词扫描未发现 `## 研究设计与证据流`、`## 证据与可追踪性`、`下表展示研究设计与证据流`、`证据链完整性`、`多智能体和工具调用研究`、`论文到代码执行研究`、`断言证据表`、`证据记录索引` 或英文 label policy 残留。
- 质量判断：ranking 终稿主文不再像系统审计报告，证据细节退回附录和复现清单，整体更接近常规计算机论文结构。

## 2026-05-30 ranking 相关工作三线索复审

- 协议场景复跑 `run-7c0e15f8-b78d-4e06-81fb-75722c8dac20`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-7c0e15f8-b78d-4e06-81fb-75722c8dac20\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 相关工作改为排序解释、检索与推荐评测、复现与验证三条线索，并分别引用 `Explaining Rankings with Hidden Group Bonuses`、`Discrimination Is Generation`、`Same Ranking, Different Winner`。
- 坏词扫描未发现 `多智能体和工具调用研究`、`工具调用与智能体协作研究`、`论文到代码执行研究`、`以 检索与推荐评测研究 为代表`、`以 复现与验证研究 为代表`、`断言证据表`、`证据记录索引`、`投稿准备度`、`通用预印本` 或英文 label policy 残留。
- 质量判断：相关工作从上一版泛化流程分类收敛为排序论文需要的领域脉络，更接近人工协作稿。

## 2026-05-30 数据可用性标签策略复审

- 协议场景复跑 `run-78ee2154-e27d-45f6-b02e-c56ceeb44637`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-78ee2154-e27d-45f6-b02e-c56ceeb44637\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 数据与代码可用性章节将 live ranking dataset 的标签策略写为中文：标签由实时 arXiv 检索排序、论文排序主题匹配、来源元数据完整度和发表时间确定，不是人工相关性标注。
- 坏词扫描未发现 `Deterministic validation labels`、`not human relevance ground truth`、`paper-ranking topic fit`、`source metadata completeness`、`publication recency`、`标签策略为`、`投稿准备度` 或 `通用预印本`。
- 质量判断：数据说明不再泄漏英文内部字段，更像论文里的数据来源与标注策略说明。

## 2026-05-30 live ranking benchmark 贴题性复审

- 协议场景复跑 `run-42d78688-fae5-4c6c-9e09-f215375a2e1b`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-42d78688-fae5-4c6c-9e09-f215375a2e1b\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- live benchmark 查询改为 `paper recommendation ranking`，SourceEvidenceManifest 只保留 ranking/retrieval 相关 arXiv 文献。
- 参考文献集中为 ranking/retrieval：`Explaining Rankings with Hidden Group Bonuses`、`Same Ranking, Different Winner`、`Discrimination Is Generation`。
- 结果恢复为非退化排序对比：本文方法 `1.0000`，词项匹配基线 `0.9629`，无证据覆盖消融 `0.9316`。
- 坏词扫描未发现 `Treatment Effect Estimation`、`Unoptimised Prompts`、`Industrial Inspection`、`Notification Composition`、`断言证据表`、`证据记录索引`、`投稿准备度` 或 `通用预印本`。
- 质量判断：真实验收样本更贴合候选论文排序主题，并且能检验本文方法相对基线/消融的可比较差异。

## 2026-05-30 内部附录收口复审

- 协议场景复跑 `run-5074dbc0-7753-4eb7-b158-62b690b2d3c8`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-5074dbc0-7753-4eb7-b158-62b690b2d3c8\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- ranking 终稿只保留附录 A 证据追踪和附录 B 复现清单；不再输出附录 E 断言证据表、附录 F 证据记录索引和附录 G 投稿准备度。
- 坏词扫描未发现 `断言证据表`、`证据记录索引`、`结构化证据`、`处理 | 来源类型`、`导出条件`、`投稿准备度` 或 `通用预印本`。
- 质量判断：终稿附录从系统审计清单收敛为读者需要的证据追踪和复现说明，更接近人工协作稿。

## 2026-05-30 可复现性表格复审

- 协议场景复跑 `run-72485cb1-7d12-4d05-9f48-b44d7c278ec3`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-72485cb1-7d12-4d05-9f48-b44d7c278ec3\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 可复现性章节的本机/容器比较表只保留实验、状态、主指标和差值，不再显示容器命令。
- 实验执行摘要只保留环境、实验、角色、状态、指标和耗时，不再显示命令、输出或“见运行日志”。
- 坏词扫描未发现 `见运行日志`、`审查材料`、`容器命令`、命令/输出宽表、`mock/fake/fixture/placeholder` 或旧工程审计词残留。
- 质量判断：可复现性章节更像论文中的复现实验比较，而不是运行日志索引。

## 2026-05-30 相关工作叙事化复审

- 协议场景复跑 `run-4278e1cb-39db-43cb-a0a2-0381826e0d3b`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-4278e1cb-39db-43cb-a0a2-0381826e0d3b\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 相关工作改为三段综述：工具调用与智能体协作研究、复现与验证研究、论文到代码执行研究。
- 相关工作不再输出文献验证表、定位信息、已核验英文摘要、阻断缺口清单或 `| 相关工作 |` 表格。
- 数据可用性将“验证状态”改为“核验结果”，减少表格式审计字段口吻。
- 坏词扫描未发现 `本文纳入`、`这些文献形成`、`验证状态`、`定位信息`、`已核验英文摘要；作用`、`代码论文`、`mock/fake/fixture/placeholder` 或旧工程审计词残留。
- 质量判断：相关工作从来源清单转为围绕候选论文排序任务的论文式综述，主文更接近人工协作稿。

## 2026-05-30 题名摘要具体化复审

- 协议场景复跑 `run-092c3e2e-b216-40ff-ab15-5b02346da40d`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-092c3e2e-b216-40ff-ab15-5b02346da40d\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 题名改为“证据约束的候选论文排序方法：显式基线、消融与容器复现”，不再沿用“带显式基线、消融与容器复现脚本的代码论文”。
- 摘要直接描述 `rankAgentTeamPapers`、`scorePaper`、`排序 nDCG@3`、词项匹配基线、无证据覆盖消融和容器复现；结论聚焦排序方法、0.1341 差值和 `claim_coverage` 贡献。
- 坏词扫描未发现 `代码论文`、`缺少可追踪代码证据`、`过程记录`、旧标题、`mock/fake/fixture/placeholder` 或旧工程审计词残留。
- 质量判断：终稿开头和结尾从元论文叙述转向具体候选论文排序方法，更接近人工协作稿的论文焦点。

## 2026-05-30 实验证据措辞复审

- 协议场景复跑 `run-b9ca2413-9b6b-47e6-9799-e294b845b986`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-b9ca2413-9b6b-47e6-9799-e294b845b986\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 坏词扫描未发现 `package.json 脚本`、`可追踪来源`、`提交代码库`、`登记命令`、`仓库提供`、`mock/fake/fixture/placeholder` 或内部运行路径残留。
- 来源表述改为“可核验材料来源”，实验来源改为“项目声明的实验入口”，附录命令区改为“复现实验入口”。
- 质量判断：终稿进一步脱离工程审计报告形态，实验协议和复现附录更接近论文中的可复核实验说明。

## 2026-05-30 研究问题领域化复审

- 协议场景复跑 `run-f5092197-2707-482f-9770-da46235e0159`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-f5092197-2707-482f-9770-da46235e0159\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 研究问题改为候选论文排序任务三问：排序接口是否可追踪、特征贡献是否可比较、复现结果是否一致。
- RQ1 聚焦 `rankAgentTeamPapers` 与 `scorePaper`；RQ2 聚焦相对词项匹配基线和无证据覆盖消融的 `排序 nDCG@3` 差异；RQ3 聚焦本机与容器复现一致性。
- 质量判断：研究问题从通用证据边界收敛到具体任务和实验变量，更接近人工协作稿的论文问题设定。

## 2026-05-30 基线消融语义复审

- 协议场景复跑 `run-97ef4162-3306-4e2c-b27f-56e6c622f1c8`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-97ef4162-3306-4e2c-b27f-56e6c622f1c8\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 实验设置把词项匹配基线解释为只依赖查询词重合的排序对照，把无证据覆盖消融解释为移除 `claim_coverage` 对排序得分的贡献。
- 结果章节新增消融分析：无证据覆盖消融低于本文方法 `0.2682`，说明 `claim_coverage` 特征在当前候选集上提供了可观测贡献。
- 讨论章节补充词项匹配基线和无证据覆盖消融分别约束词项匹配与证据覆盖特征。
- 质量判断：实验设置和结果解释更接近论文中的对照实验叙述，不再只是运行入口清单。

## 2026-05-30 方法章节排序实现复审

- 协议场景复跑 `run-3781b1c7-9486-4532-847c-4a122a375256`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-3781b1c7-9486-4532-847c-4a122a375256\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 方法章节现在说明 `rankAgentTeamPapers` 接收候选论文集合并按 `scorePaper` 得分降序排列，`scorePaper` 将 `relevance`、`claim_coverage` 和 `recency` 压缩为可比较分数。
- 方法章节说明排名测试、词项匹配基线、无证据覆盖消融和容器复现分别约束本文方法、词项基线、证据覆盖贡献和环境可重复性。
- 源码证据记录只保留真实 source range，例如 `rankAgentTeamPapers(src/agent-team-paper.ts:3)`、`scorePaper(src/agent-team-paper.ts:7)`；未再出现 `scorePaper(right)`、`toSorted((left` 或 `并登记 排名测试`。
- 质量判断：方法章节已经从代码审计摘要转为可读的算法接口说明，距离人工协作稿又近一步。

## 2026-05-30 具体排序方法焦点复审

- 协议场景复跑 `run-72de0657-e141-4ca8-925a-87fe8ff926f5`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-72de0657-e141-4ca8-925a-87fe8ff926f5\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 摘要和引言直接说明 `rankAgentTeamPapers` 与 `scorePaper` 构成候选论文排序接口，并以排名测试、词项匹配基线、无证据覆盖消融和容器复现约束排序结果。
- 相关工作把差异点落到候选论文排序任务，不再复述“对提交代码库的 3 个文件进行基于源码范围的分析”。
- 主要贡献改为“把 rankAgentTeamPapers 和 scorePaper 构成的候选论文排序接口、来源和实验记录统一为可审查证据”，不再出现 `把rank`、`bun run 排名测试` 或泛泛源码范围开头。
- 质量判断：这一轮提升了前置章节的方法对象可读性，协议样本更像围绕具体算法接口和实验协议写出的计算机论文。

## 2026-05-30 排序实验领域特异性复审

- 协议场景复跑 `run-613fef31-eb05-45b5-9995-072c6246ac02`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-613fef31-eb05-45b5-9995-072c6246ac02\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 实验设置和结果表把本文方法显示为“证据约束的论文排序方法”，不再显示“代码证据驱动工作流/证据驱动工作流”。
- 主要贡献抽取 `rankAgentTeamPapers`、`scorePaper` 等排序接口，讨论说明 `排序 nDCG@3` 在候选论文排序任务和前三位排序中的含义。
- 质量判断：这一轮从清理禁用词转向领域特异叙述，当前协议样本更接近围绕具体实验对象写出的论文。

## 2026-05-30 证据与附录审计口吻复审

- 协议场景复跑 `run-51193f4e-bd0a-4dd2-b76b-6b86608ddebf`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-51193f4e-bd0a-4dd2-b76b-6b86608ddebf\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 研究设计改为读者复核路径，不再输出“人工审查”“审稿人”等过程词。
- 方法、证据链和附录改为“复核记录”“证据清单”“实验执行摘要”等论文式表述，不再暴露本地审查材料、系统动作、运行目录或导出格式细节。
- 坏词扫描未发现 `人工审查`、`审稿人`、`本地审查材料`、`审稿记录`、`审稿可追踪性`、`进入运行记录`、`系统只把`、`导出记录`、`Markdown/LaTeX/PDF/DOCX`、`运行目录`、`完整复核材料`、`结构化证据记录`、`mock/fake/fixture/placeholder` 或内部证据 ID 残留。
- 质量判断：终稿的主文和附录进一步脱离运行审计报告形态；下一轮重点应转向提高实验对象、贡献和讨论的领域特异性，而不是继续只做禁用词收敛。

## 2026-05-30 相关工作与附录机械措辞复审

- 协议场景复跑 `run-02674a61-5645-415b-a414-f5b37e06e13b`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-02674a61-5645-415b-a414-f5b37e06e13b\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 相关工作分类从“工具使用或智能体自动化”改为“工具调用与智能体协作”，主题线索不再输出 `多智能体研究自动化（多智能体研究自动化...）` 这类重复括注。
- 证据与可追踪性、限制、复现清单和投稿准备度附录不再使用“正式结果”“在本次证据边界内”“本次运行登记”“终稿检查”等运行日志口吻。
- 坏词扫描未发现 `工具使用或智能体自动化`、`多智能体研究自动化（多智能体研究自动化`、`正式结果`、`复现清单汇总正式结果`、`在本次证据边界内`、`本次运行登记`、`终稿检查`、`mock/fake/fixture/placeholder` 或内部证据 ID 残留。
- 质量判断：终稿的相关工作和附录更接近论文式复核材料；下一轮可继续处理附录中“系统只把”“运行记录”等剩余审计词，并提高真实仓库实验叙述的领域特异性。

## 2026-05-30 前置章节论文式表达复审

- 协议场景复跑 `run-df7d2d38-b766-483c-b4b5-3810f3c26ff6`：status=`succeeded`，final export=`final`，Markdown/LaTeX/PDF/DOCX 均生成，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-df7d2d38-b766-483c-b4b5-3810f3c26ff6\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 摘要、引言、研究问题与相关工作不再使用“自动写作”“流程产物”“证据充分性检查”“正式结论”“包装成正式结论”等产品流程口吻。
- 主文统一改为“结果表述”“结论性表述”和“证据链完整性约束”，更接近论文中的证据边界和复现约束表述。
- 坏词扫描未发现 `流程产物`、`证据充分性检查`、`正式结论`、`自动写作`、`mock/fake/fixture/placeholder`、`PaperRun` 或内部证据 ID 残留。
- 质量判断：当前协议样本的前置章节已更接近直接由 Codex 写作的论文口吻；下一轮重点应放在相关工作深度、实验对象抽象和真实用户仓库的泛化叙述。

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

## 2026-05-30 主文工程审计词收敛复审

- 协议场景复跑 `run-b41719dd-749d-4c89-ab8d-ea794ede17ac`：status=`succeeded`，final export=`final`，Preview=`ready`，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-b41719dd-749d-4c89-ab8d-ea794ede17ac\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 摘要、引言、研究问题、研究设计、结果、可复现性和结论改用“证据充分性检查”“正式结论”“本地审查材料”等表达，不再把主文写成导出或运行审计报告。
- 主文扫描未发现 `终稿检查`、`终稿导出`、`导出包`、`导出清单`、`写作器`、`系统应`、`本文产物`、`主要包括`、`mock/fake/fixture/placeholder` 或内部证据 ID 残留；附录仍保留必要审计字段。
- 质量判断：主文现在更接近期刊论文的证据边界叙述；下一轮应继续减少“本次运行”频率，并把实验设置、效度威胁和结论改得更像面向真实研究对象的论文。

## 2026-05-30 主文运行日志口吻复审

- 协议场景复跑 `run-5fa6d4c5-c63d-49fc-9ad8-1f786908132d`：status=`succeeded`，final export=`final`，Preview=`ready`，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-5fa6d4c5-c63d-49fc-9ad8-1f786908132d\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 来源概述、证据模型、实验运行表、可复现性和效度威胁主文改为“本研究”“本机与容器比较”“当前实验环境”等表达，不再用“本次运行”描述论文正文。
- 主文扫描未发现 `本次运行`、`终稿检查`、`终稿导出`、`导出包`、`导出清单`、`写作器`、`系统应`、`本文产物`、`mock/fake/fixture/placeholder` 或内部证据 ID 残留。
- 质量判断：主文的日志感进一步降低；下一轮建议继续处理“本文报告的是一组...”和“本节比较...”等模板句，把摘要和引言改得更像真实研究论文的问题驱动叙述。

## 2026-05-30 摘要与引言问题驱动复审

- 协议场景复跑 `run-72bc2f7c-4c21-469b-a624-c23a829f7c39`：status=`succeeded`，final export=`final`，Preview=`ready`，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-72bc2f7c-4c21-469b-a624-c23a829f7c39\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 摘要开头改为“计算机类论文若缺少可追踪代码证据、显式对照和隔离复现，容易把流程产物误写成研究结论”，先给研究风险，再说明对象和证据链。
- 引言结尾改为“本文只讨论已绑定证据的结论”，不再使用“本文报告的是一组...”模板句。
- 主文扫描未发现 `目标是在写作前`、`研究流程将材料索引`、`本文报告的是一组`、`本次运行`、工程审计词、mock/fixture 词或内部证据 ID 残留。
- 质量判断：摘要和引言更接近问题驱动论文；下一轮应继续处理相关工作段里的“本次相关工作”和方法段里的流程口吻，让正文更像真实研究叙述。

## 2026-05-30 相关工作论文式表达复审

- 协议场景复跑 `run-a2d9e7b4-7670-4cc1-a2d5-1fc4d0e1fd00`：status=`succeeded`，final export=`final`，Preview=`ready`，failed checks 为空。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-a2d9e7b4-7670-4cc1-a2d5-1fc4d0e1fd00\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 相关工作开头改为 `本文纳入 ... 条相关文献记录`，聚类说明改为 `主题线索`，不再把内部文献图结构暴露到主文。
- 主文扫描未发现 `本次相关工作`、`文献图`、`目标是在写作前`、`本文报告的是一组`、`本次运行`、工程审计词、mock/fixture 词或内部证据 ID 残留。
- 质量判断：相关工作段更像论文背景综述；下一轮可继续改“本节比较”“本文采用证据优先流程”等方法/可复现性模板句。

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

## 2026-05-30 方法与可复现性论文式表达复审

- 写作器的方法段不再输出“证据优先流程”“每个运行”“阶段图驱动”等运行说明，改为材料边界定义、代码证据抽取和可复现实验约束三部分。
- 可复现性段落不再以“本节比较”开场，改为“可复现性分析比较本机与容器结果”；实验运行记录标题收敛为“实验执行摘要”。
- 最新 protocol benchmark：`run-77d3b102-38d0-4dc4-92af-651cc46d6126`，status=`succeeded`，14 个 stage 全通过，final export=`final`，failed checks 为空，Preview ready。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-77d3b102-38d0-4dc4-92af-651cc46d6126\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 抽查：主文未发现“本文采用证据优先流程”“每个运行”“本节比较”“实验运行记录”、旧摘要/引言模板句、工程审计词、完整机器 id、`mock/fake/fixture/placeholder`、伪来源或伪容器残留。
- 验证：`test/paper/authoring.test.ts` 12 pass / 282 assertions；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。

## 2026-05-30 证据链与实验设置论文式表达复审

- 证据与可追踪性章节改为“证据链约束实验结论”，不再输出“写作阶段只把”“正式正文的候选内容”“能写出段落”等产品说明句。
- 数据与代码可用性从键值日志改为数据集表格，字段显示为访问、许可、验证和说明；不再出现 `访问=开放`、`验证=已验证`、`数据格式=` 这类拼接文本。
- 实验设置章节改为评价对象、主指标、基线和消融协议；不再出现“本节定义评价问题”“目标是：”“被评估方法为”“主观测指标为”等模板化表述。
- 最新 protocol benchmark：`run-f855d24a-5a69-425b-b360-cb0535d3d6d7`，status=`succeeded`，14 个 stage 全通过，final export=`final`，failed checks 为空，Preview ready。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-f855d24a-5a69-425b-b360-cb0535d3d6d7\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 抽查：主文未发现新增禁用词、旧方法/可复现性模板句、工程审计词、完整机器 id、`mock/fake/fixture/placeholder`、伪来源或伪容器残留。
- 验证：`test/paper/authoring.test.ts` 12 pass / 301 assertions；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。

## 2026-05-30 讨论、效度与结论论文式收束复审

- 讨论段改为解释结果与证据边界之间的关系，保留“代码证据、显式对照和容器复现”三类支撑，不再输出“自动化系统”“不能替”“后续投稿前”等产品报告句。
- 效度威胁改为构念效度、内部效度、外部效度、复现效度和解释效度；移除“自动化效度”“自动写作链路”“真实投稿任务”等表述。
- 限制与结论改为证据边界、材料范围和后续实验范围，不再把终稿写成“正式审查对象”或“替换示例协议”的任务说明。
- 最新 protocol benchmark：`run-843b4f2a-826e-4df2-9b1f-4a19b2553ff3`，status=`succeeded`，14 个 stage 全通过，final export=`final`，failed checks 为空，Preview ready。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-843b4f2a-826e-4df2-9b1f-4a19b2553ff3\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 抽查：主文未发现本轮新增禁用词、旧数据/实验设置模板句、工程审计词、完整机器 id、`mock/fake/fixture/placeholder`、伪来源或伪容器残留。
- 验证：`test/paper/authoring.test.ts` 12 pass / 322 assertions；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。

## 2026-05-30 研究设计与附录论文式复核材料复审

- 研究设计章节改为“五类证据约束”，不再输出“生成流畅正文”“写作阶段”“在实际使用中”“用户”“格式完整误判”等流程或产品说明口吻。
- 附录 A 证据追踪改为来源、断言和复核记录的关系说明，不再提“实现层面”“内部运行日志”“结构化产物”。
- 附录 B 复现清单改为正式结果所需的最小证据条件，不再提用户、可交付论文、界面、TUI 或实时预览。
- 附录 F 证据记录索引改为复核材料定位说明，不再提导出清单、实时监控台、机器可追踪性或完整标识。
- 最新 protocol benchmark：`run-dbff03a1-5590-4616-bd01-911d704d2fc9`，status=`succeeded`，14 个 stage 全通过，final export=`final`，failed checks 为空，Preview ready。
- 最新 final Markdown：`C:\Users\13750\.paper_fucker\runs\run-dbff03a1-5590-4616-bd01-911d704d2fc9\exports\bundle-final-draft-paper\bundle-final-draft-paper.md`。
- 抽查：全文未发现本轮新增禁用词、旧讨论/效度/结论模板句、工程审计词、完整机器 id、`mock/fake/fixture/placeholder`、伪来源或伪容器残留。
- 验证：`test/paper/authoring.test.ts` 12 pass / 346 assertions；`packages/opencode` typecheck passed；`scripts/live-paper-quality-benchmark.ts --scenario protocol` passed。
