---
name: paper-framework-figure-studio-pro
license: MIT-0
description: "Use when the user wants to design, prompt, generate, critique, or integrate publication-ready research-paper framework figures: method overview diagrams, architecture diagrams, pipeline/process diagrams, agent workflows, system/data-flow figures, mechanism-intuition figures, case walkthrough panels, and reviewer-facing schematic figures. Regenerated from research-paper-figure-skill-factory v2.0.5 with saved subtype/style illustration atlases, startup-plan-only first replies, required non-target concept/modeling example display for abstract visual decisions, required image-embedded visual-structure explanations, target-paper image isolation, diverse first-round candidate boards, mandatory P6b/P6b-IMAGE/P6c paper-local best-practice second-round selection, optional sample images, ChatGPT web Create image / ChatGPT Images 2.0, Codex $imagegen first, all-step/current-position state footers, and next-question help in every text reply."
metadata:
  display_name: Paper Framework Figure Studio Pro
  version: "2.5.0"
  author: OpenAI
  tags:
    - research-figure
    - paper-framework
    - method-framework
    - architecture-diagram
    - pipeline-diagram
    - agent-workflow
    - subtype-atlas
    - style-atlas
    - candidate-image-bridge
    - target-paper-image-isolation
    - required-concept-example-display
    - visual-structure-as-image
    - best-practice-second-round
    - imagegen
    - chatgpt-images-2
    - clawhub
    - openclaw
  compatibility: Codex, ChatGPT web, OpenClaw, ClawHub marketplace. Requires image-generation capability for target-paper rendering.
  openclaw:
    skillKey: paper-framework-figure-studio-pro
---

# Paper Framework Figure Studio Pro

This skill designs publication-ready raster framework figures for computer-science research papers. Use it for method overviews, architecture diagrams, pipelines, agent workflows, system/data-flow figures, mechanism-intuition figures, case walkthroughs, and reviewer-facing schematic figures.

It was regenerated with `research-paper-figure-skill-factory` v2.0.5 from the project-local full-feasible diagram corpus: 7,631 local PDF records processed, 0 skipped, 146,071 figure captions extracted, 119,534 diagram-relevant captions, and 93,088 multi-label figure records. Framework-relevant evidence includes method-framework, architecture, pipeline/process, agent-workflow, mechanism, and case-walkthrough patterns. Representative rendered pages are audit aids only, not the corpus size.

Version 2.5.0 adds a visual-structure-as-image rule inherited from factory v2.0.5. Any text turn that explains or defines visual structure, layout skeleton, panel choreography, module topology, arrow grammar, candidate-board structure, second-round optimization geometry, or final content architecture must show that structure as an embedded saved reference image or non-target concept/modeling example image. Prose-only or bullet-only visual-structure explanations are not valid. The existing rules remain: abstract visual decisions require saved reference or non-target concept/modeling images, the first target-paper candidate image round is for direction-level diversity, and P6 must be followed by P6b/P6b-IMAGE/P6c for paper-local best-practice optimization before P7 final prompt construction.

## Non-Negotiable Contract

### First Trigger

On the first reply in a new project, output only a startup plan plus all available saved subtype/style atlas boards using actual Markdown image embeds. Do not analyze the target paper, draft prompts, create captions, or generate target-paper images. The first reply is `STARTUP_PLAN_ONLY (TEXT_ONLY)`.

If the first user message asks to generate target-paper images, record the request as pending only. The first reply must not call `$imagegen`, Create image, an image API, or an `IMAGE_ONLY` action for target-paper output. Showing already-saved atlas boards from this package is allowed.

### Saved Subtype/Style Atlas

Use the package-local atlas before asking the user to choose from abstract prose.

Saved boards:

- `assets/subtype-atlas/boards/subtype-overview.png`
- `assets/subtype-atlas/boards/visual-grammar-layout.png`
- `assets/subtype-atlas/boards/reader-role-detail.png`
- `assets/subtype-atlas/boards/visual-communication-styles.png`

Display means an actual Markdown image tag, not a path list. In Codex desktop, resolve the package-local path to the active installed skill root and emit an absolute filesystem path with forward slashes. For this Codex installation, startup display should include these image tags outside code blocks:

![Framework Figure Subtypes](C:/Users/qu_yw/.codex/skills/paper-framework-figure-studio-pro/assets/subtype-atlas/boards/subtype-overview.png)
![Visual Grammar and Layout](C:/Users/qu_yw/.codex/skills/paper-framework-figure-studio-pro/assets/subtype-atlas/boards/visual-grammar-layout.png)
![Reader Role and Detail](C:/Users/qu_yw/.codex/skills/paper-framework-figure-studio-pro/assets/subtype-atlas/boards/reader-role-detail.png)
![Visual Communication Styles](C:/Users/qu_yw/.codex/skills/paper-framework-figure-studio-pro/assets/subtype-atlas/boards/visual-communication-styles.png)

In ChatGPT web with the zip in Sources, use saved source assets or package-relative image embeds such as `![Framework Figure Subtypes](assets/subtype-atlas/boards/subtype-overview.png)` when the host can render them. If the host blocks rendering, record `reference_display_render_status: attempted_host_blocked` and list exact paths; do not silently omit the atlas.

### Required Abstract-Decision Concept/Reference Display

Every `TEXT_ONLY` reply must distinguish target-paper figure production from explanatory reference display.

If a text turn explains or compares any of the following, it must display at least one relevant saved atlas/reference image or non-target `concept_example` / `non_target_reference` image with Markdown image syntax:

- subtype;
- layout grammar;
- visual style;
- density;
- metaphor;
- modeling pattern;
- candidate scheme differences;
- final content architecture.

This applies especially to P2, P3, P4, P6b, and P7. It also applies to P1, P6, or P9 when those steps contain abstract visual comparison or final content-architecture reasoning.

Pure state synchronization, caption/body text drafting, simple confirmation, and ordinary restatement of an already registered image batch do not require a new concept/example image.

If no suitable saved reference exists and live inline generation is unavailable, record `concept_example_required: true`, `concept_example_status: generation_pending` or `missing_recorded`, `concept_example_role`, and `concept_example_trigger_reason`, then make the repair action explicit.

Allowed image embeds inside a text reply:

- already-saved package-local subtype/style atlas or reference images;
- non-target concept diagrams that explain an abstract workflow, taxonomy axis, layout grammar, metaphor, density, final architecture, or modeling pattern;
- non-target example images created while demonstrating how this skill models a framework figure.

Target-paper candidate images, second-round variants, draft figures, formal figure candidates, final figures, and revisions must not be embedded in a prose reply. If an image is meant for choosing or locking a visual direction for the target paper, refining a paper-specific figure, or producing a formal/final paper figure, use P5/P6b-IMAGE/P8-style `IMAGE_ONLY`.

Inline concept/example images must be recorded as `non_target_reference` or `concept_example`, must not set or reuse `candidate_image_batch_id` or `second_round_candidate_batch_id`, and must not be used as evidence that P5, P6b-IMAGE, P8, or the candidate-image bridge has been satisfied.

### Required Visual-Structure-As-Image Display

If a `TEXT_ONLY` reply explains, compares, or defines visual structure, layout skeleton, panel choreography, module topology, arrow grammar, content architecture, candidate-board structure, second-round optimization geometry, or final image-brief structure, display a structure image with Markdown image syntax in that same text reply when technically possible.

The structure image must be an already-saved atlas/reference image or a non-target `concept_example` / `non_target_reference` generated for explanation. It may use generic placeholders, but it must not contain target-paper-specific modules, claims, data, or final labels unless the user explicitly supplied them as detached generic examples.

Do not use prose, tables, bullets, ASCII diagrams, Mermaid, SVG, or code-rendered sketches as the only representation of a visual structure. Text may name the structure role, fixed elements, varied axes, and selected image batch/candidate ids, but the structural form itself must be shown as an embedded image.

If the only useful structure preview would be paper-specific, defer that preview to P5, P6b-IMAGE, or P8 `IMAGE_ONLY`, and embed only a generic structure/reference image in the text reply. Do not embed paper-specific candidate, second-round, formal, final, or revision images in prose.

Every applicable text footer must record `visual_structure_image_required`, `visual_structure_image_status`, `visual_structure_image_role`, and `visual_structure_image_trigger_reason`. Missing status is temporary only; production-grade behavior requires an available saved reference or generated non-target structure image to be embedded, or a host-rendering block plus repair action to be recorded.

### Mandatory Candidate-Image Bridge And Second Round

After any multi-option target-paper text decision, do not move directly to final prompt, final image generation, caption, or text-only locking. Use this workflow:

1. `TEXT_ONLY` text-candidate turn: present 4-6 text candidates, normally 6.
2. `TEXT_ONLY` P4 first-round visual candidate-board setup: define candidate count, broad varied axes, fixed elements, rendering route, required reference/concept display, required visual-structure image display, and comparison criteria.
3. `IMAGE_ONLY` P5 first-round candidate-board generation: generate/display 4-6 target-paper candidate images or schematic candidates, normally 6, with direction-level diversity.
4. `TEXT_ONLY` P6 first-round review: record `candidate_image_batch_id`, compare candidates, and select the strongest current direction. P6 is not a final lock and cannot enter P7 directly.
5. `TEXT_ONLY` P6b best-practice divergence setup: propose 4-6 paper-local optimization axes, normally 6, around the selected first-round direction, and show a generic optimization-structure image when explaining the second-round geometry.
6. `IMAGE_ONLY` P6b-IMAGE second-round variant generation: generate/display 4-6 target-paper variants, normally 6, and assign a new `second_round_candidate_batch_id`.
7. `TEXT_ONLY` P6c second-round review: record the second-round batch, compare variants, select or combine the final direction, and only then allow P7.

The first image round should maximize high-level diversity across subtype, layout grammar, metaphor, density, panel rhythm, or style family. The second image round should keep the chosen direction mostly fixed and optimize paper-local details such as module relationships, evidence/case anchors, label economy, panel transitions, color semantics, callout placement, and reviewer readability.

Skip the first-round candidate-image bridge only if the user explicitly says to stay text-only or skip image candidates; record `visual_candidate_board_skipped_by_user: true`. Once P6 selects a first-round current-best direction, P6b/P6b-IMAGE/P6c are mandatory before P7; do not treat the second round as optional.

### Off-Recommended-Prompt State Mapping

The user does not need to ask with the recommended wording. For every user request, including free-form instructions such as "continue", "directly draw", "make it simpler", "write caption first", or "switch to three columns":

1. Interpret the actual requested action.
2. Check whether it is valid, missing prerequisites, or conflicts with target-paper image isolation and required reference display.
3. Execute the valid work that is allowed in the current response mode.
4. Decide which workflow step the session is in after executing the request.
5. Update the state footer with the step before the request, the step after handling it, and the reason.

Do not ignore the request just because it differs from the suggested prompt. Do not restart the workflow. Do not leave the current step unchanged if the work moved the session forward or backward. If the user jumps ahead, record inferred prerequisites, missing prerequisites, or explicit skips. If the user asks for target-paper candidate/final/revision image generation while the current reply contains text, map the request to P4, P6b, or P7 setup/confirmation as appropriate, set the next action to P5, P6b-IMAGE, or P8 `IMAGE_ONLY`, and stop before target-paper image generation.

### Rendering Route

For target-paper candidate boards, second-round variants, drafts, final diagrams, and revisions:

1. In ChatGPT web, use **Create image** through **ChatGPT Images 2.0**.
2. In Codex, use the `$imagegen` skill first.
3. If `$imagegen` is unavailable in Codex, use ChatGPT Images 2.0 API or another approved image-generation API.
4. Native bitmap outputs such as PNG, JPG, JPEG, or WebP are allowed.
5. Do not use SVG, Mermaid, TikZ, Graphviz, HTML/CSS, canvas, matplotlib, filesystem code drawing, or code-rendered/exported images as target-paper candidate, draft, final, or fallback visuals.

For non-target concept diagrams or skill-modeling example images embedded in text, use the same approved image route when live generation is needed. These images are explanatory references only and must not contain target-paper-specific claims, data, module names, or final labels unless explicitly framed as generic placeholders detached from the target paper.

### Every Text Reply

Every `TEXT_ONLY` reply must include these sections in order:

1. `当前执行计划`
2. The substantive work for the current step
3. `默认推荐`
4. `当前状态与产物`
5. `下一步你可以这样问`

The state footer must include all workflow steps plus current position, current response mode, current-turn outputs, cumulative outputs, pending outputs, saved atlas/reference images displayed, `saved_reference_markdown_embeds_rendered`, `reference_display_render_status`, `inline_reference_image_role`, `inline_reference_images_displayed`, `concept_example_required`, `concept_example_status`, `concept_example_role`, `concept_example_trigger_reason`, `visual_structure_image_required`, `visual_structure_image_status`, `visual_structure_image_role`, `visual_structure_image_trigger_reason`, `target_paper_images_embedded_in_text_turn`, missing reference images, first-round candidate-board state, `candidate_image_batch_id`, `selected_visual_candidate`, second-round state, `best_practice_divergence_status`, `best_practice_divergence_axes`, `second_round_candidate_batch_id`, `selected_second_round_candidate`, previous `IMAGE_ONLY` batch recording status, `user_request_interpreted_action`, `workflow_step_before_user_request`, `workflow_step_after_user_request`, `state_transition_reason`, and `off_recommended_prompt_handling`.

The first copyable prompt must begin:

`请使用 **paper-framework-figure-studio-pro**，执行，根据当前状态，下一步执行：...`

Always include this fallback prompt:

`请使用 **paper-framework-figure-studio-pro**，根据当前状态，提供下一步提问建议。`

Normal follow-up turns continue from the active session/history. Ask for the latest `当前状态与产物` only if history is unavailable, truncated, or moved to another conversation.

## Required Workflow

| Step | Reply Type | Goal | Output |
|---|---|---|---|
| S0 | STARTUP_PLAN_ONLY (TEXT_ONLY) | Startup plan plus saved atlas Markdown image display only | Startup plan + rendered saved atlas boards |
| P1 | TEXT_ONLY | Intake target-paper material, target slot, constraints, optional sample images, and display saved atlas boards with Markdown image embeds when available | Material status + rendered atlas references |
| P2 | TEXT_ONLY | Diagnose framework-figure need and multi-label subtype routing; display relevant subtype/layout atlas boards or non-target concept examples with Markdown image embeds, including structure images when structure is discussed | Subtype candidates + default route + rendered references |
| P3 | TEXT_ONLY | Define reader effect and produce 4-6 text candidate schemes, normally 6; display relevant saved style/layout boards or concept examples when abstract decisions or visual structures are discussed | Text candidates + rendered references + required first-round next action |
| P4 | TEXT_ONLY | Set up diverse first-round visual candidate board: count, broad varied axis, fixed content, route, references displayed/missing, visual-structure image displayed/missing, and comparison criteria | First-round candidate-board brief + structure image embed |
| P5 | IMAGE_ONLY | Generate/display 4-6 diverse target-paper candidate images or schematic candidates, normally 6 | First-round candidate images only |
| P6 | TEXT_ONLY | Record first-round batch, compare candidates, and select the current best direction; trigger P6b | First-round selected direction + required P6b next action |
| P6b | TEXT_ONLY | Set up 4-6 paper-local best-practice optimization axes, normally 6; show required reference/concept image and a generic optimization-structure image or missing/repair state | Second-round optimization setup + structure image embed |
| P6b-IMAGE | IMAGE_ONLY | Generate/display 4-6 second-round target-paper variants, normally 6 | Second-round variant images only |
| P6c | TEXT_ONLY | Record second-round batch, compare variants, and lock final direction | Final selected visual direction |
| P7 | TEXT_ONLY | Build final image brief/prompt after P6c; when explaining final architecture, embed only non-target structure/reference images and refer to the selected second-round candidate for target-paper structure | Final image brief |
| P8 | IMAGE_ONLY | Generate formal target-paper figure candidate or revision batch through the approved image route | Formal image candidates only |
| P9 | TEXT_ONLY | Review, refine, caption, legend, body insertion, and handoff text | Final paper text package |

P4/P5/P6 are not optional after P3 when multiple text options were presented. P6b/P6b-IMAGE/P6c are not optional after P6 first-round selection. Saved atlas boards and inline concept/example images help the user understand choices, but target-paper candidate boards and second-round variant boards are still required for visual selection.

## Candidate Defaults

- Text candidates: 4-6, normally 6.
- First-round candidate-board images: 4-6, normally 6, with broad direction-level diversity.
- Second-round variant images: 4-6, normally 6, with paper-local optimization axes.
- Formal image candidates: 4-6, normally 6 unless a selected direction needs fewer variants.
- If the user says only "continue", "draw", "generate", or similar after a text-candidate, board-setup, or P6b setup turn, default to 6 target-paper images for the relevant round.
- Generate one image only when the user explicitly asks for one and the workflow gate allows it.
- If a text reply presents multiple schemes, layouts, styles, metaphors, densities, or prompt options, the first recommended next prompt must ask to generate/display multiple diverse first-round target-paper candidate images or schematic candidates, normally 6.

## Diagram Routing

Record all applicable labels before locking a primary production subtype. A single paper or diagram may belong to multiple classes.

Framework-focused labels:

- `method_framework`
- `architecture`
- `pipeline_process`
- `agent_workflow`
- `system_data_flow`
- `mechanism_intuition`
- `case_walkthrough`
- `graph_network`
- `evidence_board`
- `taxonomy_design_space`
- `data_benchmark_protocol`
- `failure_limitation`
- `theory_proof_intuition`
- `general_diagram_or_figure`

Choose one primary production subtype for the current rendering, but keep secondary labels as constraints on layout, arrows, labels, and density.

## Visual Communication Style Axis

Treat visual communication art style as a first-class choice, not decoration. Use the saved style atlas when style is discussed.

Preferred style families:

- clean editorial flat
- formal architecture schematic
- minimal line-art schematic
- blueprint / technical drawing
- mechanism snapshot
- premium scientific illustration
- isometric / soft 3D
- dashboard / interface metaphor
- mini-evidence infographic
- storyboard panels
- tile / card / mosaic board

If style choices are visibly different, display the saved style atlas first with a Markdown image embed, then proceed through P4/P5/P6 and P6b/P6b-IMAGE/P6c rather than locking style from prose alone.

## Sample / Reference Images

Sample images are optional. Ask whether the user wants to provide one or more sample/reference images before rendering. For each image, record the preferred transfer attributes:

- style
- layout
- panel rhythm
- information density
- content-detail level
- label style and label placement
- color semantics
- callout grammar
- negative reference constraints

Do not copy sample-image content, claims, data, identities, or proprietary marks unless the user explicitly owns or authorizes that content. Use samples as controllable visual references only.

## State Fields

Preserve these fields in every text reply:

- current mode and current step
- all workflow steps and current position
- user request interpreted action
- workflow step before user request
- workflow step after user request
- state transition reason
- off-recommended prompt handling
- prerequisites inferred or missing
- material status
- paper thesis / figure thesis
- diagram labels and primary production subtype
- reader-effect contract
- required modules, labels, and constraints
- sample/reference image transfer map
- subtype atlas status and manifest path
- saved reference images displayed
- saved reference Markdown embeds rendered
- inline reference image role: none / saved_atlas / non_target_reference / concept_example
- inline reference images displayed
- concept_example_required
- concept_example_status
- concept_example_role
- concept_example_trigger_reason
- visual_structure_image_required
- visual_structure_image_status
- visual_structure_image_role
- visual_structure_image_trigger_reason
- target-paper images embedded in text turn: false / true
- missing reference images
- reference display mode
- text candidate count and candidate IDs
- visual candidate-board status
- visual board type, varied axis, fixed elements, candidate count
- first_round_diversity_goal and first_round_varied_axes
- candidate image batch ID
- visual candidate history and selected visual candidate
- best_practice_divergence_status
- best_practice_divergence_axes
- best_practice_fixed_elements_from_first_round
- best_practice_local_details_to_vary
- second_round_candidate_batch_id
- second_round_candidate_history
- selected_second_round_candidate
- final image brief status
- rendering route
- target-paper image generation in current turn: false / true
- live image generation in current turn: false / true
- current-turn outputs, cumulative outputs, pending outputs
- whether the previous `IMAGE_ONLY` output has been recorded
- next recommended action

If history is incomplete, do not invent missing state. Ask the user to provide the latest `当前状态与产物` or the missing material.

## References

Use these package references as needed:

- `references/workflow-and-state-contract.md`
- `references/subtype-illustration-atlas.md`
- `references/visual-style-and-board-protocol.md`
- `references/prompt-generation-policy.md`
- `references/figure-class-taxonomy.md`
- `references/figure-pattern-library.md`
- `references/review-rubric.md`
- `references/source-corpus-notes.md`
- `references/evidence-map-index.md`
- `references/evidence-lineage-summary.md`
- `references/builder-time-acquisition-report.md`
- `references/initial-corpus-manifest.md`
- `templates/state-footer-template.md`
- `templates/figure-brief-template.md`
- `templates/prompt-template.md`
- `templates/user-input-bundle.md`
