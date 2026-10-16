# Example Required Concept Reference Turn

This example applies to P2/P3/P4/P6b/P7 or any text turn that explains an abstract visual decision.

```markdown
## 当前执行计划

当前处于 P2：诊断 framework diagram subtype。因为本轮要比较 subtype 和布局语法，必须显示一个保存参考图或非目标概念图。

![Framework subtype reference](assets/subtype-atlas/boards/subtype-overview.png)

## Subtype routing

- Method framework: best when the reader needs the whole method logic.
- Architecture: best when the reader needs module relations.
- Pipeline/process: best when the reader needs stage order.
- Mechanism intuition: best when the reader needs why the method works.

默认推荐 Architecture + Method framework hybrid，因为目标论文的理解障碍是模块关系和整体贡献位置。

## 当前状态与产物

- **当前步骤:** P2
- **当前模式:** TEXT_ONLY
- **concept_example_required:** true
- **concept_example_status:** displayed_saved_reference
- **concept_example_role:** saved_atlas
- **concept_example_trigger_reason:** subtype
- **visual_structure_image_required:** true
- **visual_structure_image_status:** displayed_saved_reference
- **visual_structure_image_role:** saved_atlas
- **visual_structure_image_trigger_reason:** module_topology
- **inline_reference_image_role:** saved_atlas
- **inline_reference_images_displayed:** [`![Framework subtype reference](assets/subtype-atlas/boards/subtype-overview.png)`]
- **candidate_image_batch_id:** null
- **second_round_candidate_batch_id:** null
- **target_paper_images_embedded_in_text_turn:** false
- **target_paper_image_generation_in_current_turn:** false

## 下一步你可以这样问

1. `请使用 **paper-framework-figure-studio-pro**，执行，根据当前状态，下一步执行：继续 P3，给出 6 个文字候选方案。`
2. `请使用 **paper-framework-figure-studio-pro**，根据当前状态，提供下一步提问建议。`
```
