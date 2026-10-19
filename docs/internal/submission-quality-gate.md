# 投稿质量闸门

最终导出前有两层检查。第一层是**证据完整性**（`verification/checks.ts`）：引用必须指向真实来源、claim 必须有证据、数据集许可清晰、容器复现通过。第二层是**稿件本身是否达到投稿水准**（`verification/manuscript.ts`），它检查的不是证据对不对，而是这篇稿子能不能投出去。

第二层只在调用方传入 `manuscript_requirements` 时运行。`runPaperAuthoringLoop` 会按 `target_profile` 自动传入：`cjc-paper` 与未指定 profile 时用中文期刊基线，其余 profile（含 `international-q1`）用国际一区基线。

## 检查项

| 类别 | 判定 | 说明 |
| --- | --- | --- |
| `missing_section_content` | blocker | 必需章节的实际字数不足 20（只有标题或一句占位） |
| `abstract_length` | warning | 摘要词数超出目标区间（中文按字计，英文按词计） |
| `missing_keywords` | warning | 关键词数量不足 |
| `placeholder_text` | blocker | 稿件残留 TODO/TBD/待补充/占位/`[citation needed]` 等标记 |
| `missing_statement` | blocker 或 warning | 缺少数据可用性、代码可用性、伦理、利益冲突、基金、作者贡献、生成式 AI 使用声明 |
| `insufficient_references` | blocker | 正式参考文献条目少于下限（中文 20 / 国际一区 40） |
| `stale_references` | warning | 有年份的参考文献中，近五年占比低于 50% |
| `missing_statistics` | blocker 或 warning | 论文与基线比较，但没有报告离散度（±/置信区间）或显著性检验（p 值/检验名） |
| `missing_table` | blocker | 结果章节的表格数不足 |
| `missing_figure` | blocker | 图数不足（国际一区要求至少 1 张） |
| `manuscript_language` | blocker | 稿件语言与目标期刊不符（国际一区要求英文，CJK 占比 >5% 即拦截） |

统计检查读的是**数字形态**而不是词语：脚手架里那句"当前数值是确定性协议观测，不计算置信区间或显著性检验"不会被当成已报告统计量。

## 如何满足

- **参考文献**：`literature_map` 里放足量的 `verification.status = "verified"` 且非占位 URL 的来源。生成稿最多渲染 60 条（`MAX_FORMAL_REFERENCES`）；中文期刊要求 20 条，国际一区要求 40 条。
- **正文语言**：脚手架的所有生成器都写中文，国际一区要求英文，所以必须由作者/agent 提供正文。两条入口：
  - HTTP `POST` 创建 PaperRun 时传 `draft_sections: [{ section_id, markdown }]`；
  - 直接调用 `runPaperAuthoringLoop` 时传 `section_overrides`。
  覆盖发生在生成之后、闸门之前，`section_id` 用脚手架已有的 id（`abstract`、`introduction`、`related_work`、`method`、`experimental_setup`、`results`、`discussion`、`conclusion`、`keywords` 等）。语言检查只采样目标 profile 的叙事章节，不把内部审计附录和参考文献算进去。
- **声明**：`runPaperAuthoringLoop` 接受 `declarations: { funding, author_contributions, competing_interests, ethics, llm_disclosure }`，HTTP 创建 PaperRun 时传同名的 `declarations` 字段；不传就是"未声明"，闸门会拦。伦理声明有默认的"不涉及人类/动物受试者"文本，仍可覆盖。
- **代码可用性**：`code_metadata.repository_url` 或 `package_name` 至少有一个，稿件才会写出"代码可用性"小节。闸门要求该节同时出现代码主题与定位信息——URL、GitHub/GitLab/Zenodo/DOI，或生成表格里的"代码包"行都算定位。
- **统计**：结果章节必须同时出现离散度（`0.910 ± 0.004`、`0.910 (0.004)`、`95% CI` 或"标准差："）和显著性依据（`p = 0.003` 或 Wilcoxon/t-test/ANOVA 等具体检验名），只有其一仍会被拦。
  - 离散度可以由工具生成：调用实验协议执行时传 `repetitions: N`（HTTP payload 同名字段，1–20），每次执行会注入 `PAPERCODE_SEED`/`PYTHONHASHSEED`，运行结果保留每个指标的样本，`ResultReport.statistics` 给出 `n/mean/std`，结果表渲染为 `0.910 ± 0.004 (n=5)`。
  - 显著性检验仍需要实验脚本或作者提供 p 值/检验名；工具不会替作者选择检验方法。
- **图表**：统计只算结果章节。中文期刊要求至少 1 张表；国际一区要求至少 2 张表、1 张图。
- 非 `cjc-paper` 的稿件不再追加中文"投稿准备度"附录（该附录是给中文期刊自查用的）。

## 拦截之后

被拦下时不会丢东西：`runPaperAuthoringLoop` 会把稿件按 `forced_draft` 导出。未通过的检查逐条记在 `verification/blocking-report.json` artifact 与预览快照的 blockers 里；导出 manifest 的 `tool_diagnostics` 记录的是导出工具链自身的诊断，两者不要混读。补齐后重新运行即可转为 `final`。

需求定义集中在 `CJC_MANUSCRIPT_REQUIREMENTS` 与 `Q1_MANUSCRIPT_REQUIREMENTS`，新增期刊 profile 时在 `manuscriptRequirementsForProfile` 里补一条映射即可，不需要改检查逻辑。
