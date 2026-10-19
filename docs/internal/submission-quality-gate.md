# 投稿质量闸门

最终导出前有两层检查。第一层是**证据完整性**（`verification/checks.ts`）：引用必须指向真实来源、claim 必须有证据、数据集许可清晰、容器复现通过。第二层是**稿件本身是否达到投稿水准**（`verification/manuscript.ts`），它检查的不是证据对不对，而是这篇稿子能不能投出去。

第二层只在调用方传入 `manuscript_requirements` 时运行。`runPaperAuthoringLoop` 会按 `target_profile` 自动传入：`cjc-paper` 用中文期刊基线，其余 profile（含 `international-q1`）用国际一区基线。

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
- **声明**：`runPaperAuthoringLoop` 接受 `declarations: { funding, author_contributions, competing_interests, ethics, llm_disclosure }`；不传就是"未声明"，闸门会拦。伦理声明有默认的"不涉及人类/动物受试者"文本，仍可覆盖。
- **代码可用性**：`code_metadata.repository_url` 或 `package_name` 至少有一个，稿件才会写出"代码可用性"小节；只有方法源码范围而没有任何定位信息不算可用。
- **统计**：结果章节必须出现 `0.910 ± 0.004`、`95% CI`、`p = 0.003` 或具体检验名（Wilcoxon/t-test/ANOVA 等）。
- **图表**：结果章节至少一张表；国际一区至少一张图。
- 国际一区稿件的导出 markdown 不再追加中文"投稿准备度"附录（该附录只用于中文期刊的自查）。

## 拦截之后

被拦下时不会丢东西：`runPaperAuthoringLoop` 会把稿件按 `forced_draft` 导出，未通过的检查逐条写在 manifest 与预览的 `tool_diagnostics`/blockers 里。补齐后重新运行即可转为 `final`。

需求定义集中在 `CJC_MANUSCRIPT_REQUIREMENTS` 与 `Q1_MANUSCRIPT_REQUIREMENTS`，新增期刊 profile 时在 `manuscriptRequirementsForProfile` 里补一条映射即可，不需要改检查逻辑。
