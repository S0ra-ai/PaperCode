# Example Visual-Structure-As-Image Turn

This example shows a `TEXT_ONLY` P4 setup that explains the board structure with an embedded non-target/saved reference image. It does not generate or embed target-paper candidates.

```markdown
## Current Plan

Current step: P4 `TEXT_ONLY`. Set up the first-round candidate board and show the generic layout skeleton with a saved reference image before any target-paper generation.

![Generic layout skeleton reference](assets/subtype-atlas/boards/visual-grammar-layout.png)

## Candidate-Board Structure

- candidate count: 6
- first-round purpose: direction-level diversity
- fixed elements: target paper thesis, required module names, exact labels, sample-image hard constraints
- varied axes: subtype, layout grammar, metaphor, density, panel rhythm, style family
- next step: P5 `IMAGE_ONLY`

## State

- **current_step:** P4
- **concept_example_required:** true
- **concept_example_status:** displayed_saved_reference
- **concept_example_role:** saved_atlas
- **concept_example_trigger_reason:** layout_grammar
- **visual_structure_image_required:** true
- **visual_structure_image_status:** displayed_saved_reference
- **visual_structure_image_role:** saved_atlas
- **visual_structure_image_trigger_reason:** layout_skeleton
- **candidate_image_batch_id:** null
- **second_round_candidate_batch_id:** null
- **target_paper_images_embedded_in_text_turn:** false

## Next Prompt

`请使用 **paper-framework-figure-studio-pro**，执行，根据当前状态，下一步执行：生成 6 张方向差异尽量大的第一轮目标论文候选图，供我比较选择。`
```
