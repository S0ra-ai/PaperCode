# Example Required Inline Non-Target Concept Reference Turn - v2.5.0

This example shows a `TEXT_ONLY` reply that embeds an explanatory concept/modeling image because an abstract-decision trigger is active. The image is not based on the user's target paper, is not a candidate board, and does not satisfy P5/P6b-IMAGE/P8.

```markdown
## Current Plan

I am explaining a layered pipeline modeling pattern before setting the target-paper candidate board. The image below is a non-target concept example for the modeling grammar only; it is not a candidate figure for your paper.

![Non-target concept example](assets/subtype-atlas/boards/non-target-pipeline-concept-example.png)

## Recommended Next Step

Continue to P4 and set up the 6 first-round target-paper candidate images. The next P5 turn must be `IMAGE_ONLY`.

## State And Outputs

- current_response_mode: TEXT_ONLY
- inline_reference_image_role: concept_example
- inline_reference_images_displayed:
  - `![Non-target concept example](assets/subtype-atlas/boards/non-target-pipeline-concept-example.png)`
- concept_example_required: true
- concept_example_status: displayed_saved_reference
- concept_example_role: concept_example
- concept_example_trigger_reason: modeling_pattern
- visual_structure_image_required: true
- visual_structure_image_status: displayed_saved_reference
- visual_structure_image_role: concept_example
- visual_structure_image_trigger_reason: modeling_pattern
- target_paper_images_embedded_in_text_turn: false
- target_paper_image_generation_in_current_turn: false
- candidate_image_batch_id: null
- second_round_candidate_batch_id: null
- visual_candidate_board_status: setup_ready
- note: The embedded image only explains the modeling pattern and cannot be used as a direction-lock candidate.
```
