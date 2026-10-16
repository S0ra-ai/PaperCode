# Example P4 Diverse First-Round Visual Board Setup Turn

This is P4. It follows P3 text candidates and must stop before target-paper image generation.

```markdown
## 当前执行计划

- 当前位置：P4 - 第一轮方向多样候选图板设置（TEXT_ONLY）
- 上一步 P3 已给出 6 个文字候选方案
- 本轮目标：设置 6 张方向差异尽量大的候选图/示意图生成规则

![Visual Grammar and Layout](assets/subtype-atlas/boards/visual-grammar-layout.png)

## Candidate-Board Brief

- board type: scheme / layout / metaphor / density
- candidate count: 6
- varied axis: broad direction-level diversity across layout grammar, metaphor, density, panel rhythm, and style family
- fixed elements: figure thesis, required modules, exact labels, sample-image hard constraints
- rendering route: ChatGPT web Create image / ChatGPT Images 2.0; Codex `$imagegen` first; fallback ChatGPT Images 2.0 API or approved image API
- compare: reading clarity, contribution prominence, label readability, paper-slot fit

## 默认推荐

生成 6 张第一轮候选图。第一轮不是局部微调，而是尽量拉开方向差异，帮助先确定 framework diagram 的大结构。

## 当前状态与产物

- **当前模式:** TEXT_ONLY
- **当前步骤:** P4
- **全部步骤与当前位置:** S0 -> P1 -> P2 -> P3 -> P4 [当前位置] -> P5(IMAGE_ONLY diverse first-round generation) -> P6(TEXT_ONLY first-round review/current-best selection) -> P6b(TEXT_ONLY paper-local best-practice setup) -> P6b-IMAGE(IMAGE_ONLY second-round variants) -> P6c(TEXT_ONLY final direction lock) -> P7 -> P8 -> P9
- **text_candidate_count:** 6
- **image_candidate_count:** 6
- **visual_candidate_board_status:** setup_ready
- **visual_board_type:** scheme/layout/metaphor/density
- **visual_board_axis_varied:** layout grammar + metaphor + density + panel rhythm + style family
- **first_round_diversity_goal:** direction_level_diversity
- **first_round_varied_axes:** [layout_grammar, metaphor, density, panel_rhythm, style_family]
- **candidate_image_batch_id:** not_created
- **concept_example_required:** true
- **concept_example_status:** displayed_saved_reference
- **concept_example_role:** saved_atlas
- **concept_example_trigger_reason:** layout_grammar
- **visual_structure_image_required:** true
- **visual_structure_image_status:** displayed_saved_reference
- **visual_structure_image_role:** saved_atlas
- **visual_structure_image_trigger_reason:** layout_skeleton
- **saved_reference_markdown_embeds_rendered:** [`![Visual Grammar and Layout](assets/subtype-atlas/boards/visual-grammar-layout.png)`]
- **target_paper_images_embedded_in_text_turn:** false
- **本轮产物:** first-round candidate-board brief
- **待产物:** P5 IMAGE_ONLY diverse first-round candidate image board

## 下一步你可以这样问

1. `请使用 **paper-framework-figure-studio-pro**，执行，根据当前状态，下一步执行：生成 6 张方向差异尽量大的第一轮候选图/示意图供我比较选择。`
2. `请使用 **paper-framework-figure-studio-pro**，根据当前状态，提供下一步提问建议。`
```
