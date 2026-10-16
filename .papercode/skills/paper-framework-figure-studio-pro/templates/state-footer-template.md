# State Footer Template

Every `TEXT_ONLY` reply must include this footer immediately before `下一步你可以这样问`.

```markdown
## 当前状态与产物

- **当前模式:** TEXT_ONLY / STARTUP_PLAN_ONLY (TEXT_ONLY)
- **当前步骤:** S0 / P1 / P2 / P3 / P4 / P5 / P6 / P6b / P6b-IMAGE / P6c / P7 / P8 / P9
- **全部步骤与当前位置:** S0(STARTUP_PLAN_ONLY/TEXT_ONLY atlas display) -> P1(TEXT_ONLY material intake) -> P2(TEXT_ONLY routing + required reference/concept display) -> P3(TEXT_ONLY text candidates + required abstract-decision reference display) -> P4(TEXT_ONLY diverse first-round candidate-board setup) -> P5(IMAGE_ONLY diverse first-round target-paper candidate-board generation) -> P6(TEXT_ONLY first-round review/current-best selection) -> P6b(TEXT_ONLY paper-local best-practice divergence setup) -> P6b-IMAGE(IMAGE_ONLY second-round target-paper variant generation) -> P6c(TEXT_ONLY second-round review/final direction lock) -> P7(TEXT_ONLY final image brief) -> P8(IMAGE_ONLY target-paper formal generation) -> P9(TEXT_ONLY review/final text); 当前=...
- **用户本轮实际请求解析:** ...
- **用户请求前所在步骤:** S0 / P1 / P2 / P3 / P4 / P5 / P6 / P6b / P6b-IMAGE / P6c / P7 / P8 / P9
- **按用户请求执行后的对应步骤:** S0 / P1 / P2 / P3 / P4 / P5 / P6 / P6b / P6b-IMAGE / P6c / P7 / P8 / P9
- **状态转移理由:** ...
- **非推荐提问处理:** not_needed / handled_and_mapped / blocked_missing_prerequisites / mapped_to_text_setup_before_image_only
- **已推断或缺失的前置条件:** []
- **材料状态:** not_provided / partial / sufficient
- **paper thesis / figure thesis:** ...
- **reader-effect contract:** ...
- **required modules / labels / constraints:** ...
- **diagram labels:** ...
- **primary production subtype:** ...
- **样例/参考图状态:** none / requested / provided / analyzed
- **subtype_atlas_status:** packaged / displayed / missing / repair_needed
- **subtype_atlas_manifest_path:** assets/subtype-atlas/manifest.json
- **saved_reference_images_displayed:** []
- **saved_reference_markdown_embeds_rendered:** []
- **inline_reference_image_role:** none / saved_atlas / non_target_reference / concept_example
- **inline_reference_images_displayed:** []
- **concept_example_required:** false / true
- **concept_example_status:** not_needed / displayed_saved_reference / generated_inline / generation_pending / missing_recorded
- **concept_example_role:** none / saved_atlas / non_target_reference / concept_example
- **concept_example_trigger_reason:** none / subtype / layout_grammar / visual_style / density / metaphor / modeling_pattern / candidate_scheme_differences / final_content_architecture
- **visual_structure_image_required:** false / true
- **visual_structure_image_status:** not_needed / displayed_saved_reference / generated_inline / generation_pending / missing_recorded
- **visual_structure_image_role:** none / saved_atlas / non_target_reference / concept_example
- **visual_structure_image_trigger_reason:** none / visual_structure / layout_skeleton / panel_choreography / module_topology / arrow_grammar / candidate_board_structure / second_round_optimization_geometry / final_content_architecture
- **target_paper_images_embedded_in_text_turn:** false / true
- **missing_reference_images:** []
- **reference_display_mode:** none / startup_atlas / relevant_subtype / relevant_layout / relevant_style / concept_example / missing_recorded
- **reference_display_render_status:** none / rendered / attempted_host_blocked / missing_recorded
- **text_candidate_count:** 0 / 4 / 5 / 6
- **image_candidate_count:** 0 / 4 / 5 / 6
- **candidate_generation_mode:** none / multi_scheme_multi_image / single_scheme_multi_image
- **candidate_scheme_ids:** []
- **candidate_comparison_focus:** ...
- **visual_candidate_board_status:** not_started / setup_ready / confirmed / generated / reviewed / skipped_by_user
- **visual_board_type:** subtype / scheme / layout / style / metaphor / density / prompt / final_candidate
- **visual_board_axis_varied:** ...
- **visual_board_fixed_elements:** []
- **first_round_diversity_goal:** direction_level_diversity / not_applicable
- **first_round_varied_axes:** []
- **candidate_image_batch_id:** ...
- **selected_visual_candidate:** ...
- **visual_candidate_board_skipped_by_user:** false / true
- **best_practice_divergence_status:** not_started / required_after_first_selection / setup_ready / generated / reviewed / final_locked / overridden_by_user
- **best_practice_divergence_axes:** []
- **best_practice_fixed_elements_from_first_round:** []
- **best_practice_local_details_to_vary:** []
- **second_round_candidate_batch_id:** ...
- **second_round_candidate_history:** []
- **selected_second_round_candidate:** ...
- **final_image_brief_status:** not_started / drafted / confirmed / revised
- **rendering route:** ChatGPT web Create image / ChatGPT Images 2.0; Codex `$imagegen` first; fallback ChatGPT Images 2.0 API or approved image API
- **target_paper_image_generation_in_current_turn:** false / true
- **live_image_generation_in_current_turn:** false / true
- **本轮产物:** ...
- **累计产物:** ...
- **待产物:** ...
- **上一轮 IMAGE_ONLY 产物是否已登记:** not_applicable / recorded / pending_record
- **多方案下一步提醒:** 如果本轮给了多个方案/布局/风格/prompt，第一条下一步必须要求生成/展示 4-6 张方向差异尽量大的第一轮候选图，通常 6 张；不要只建议从文字方案里定稿。
- **P6 后下一步提醒:** 如果 P6 已选出第一轮当前最佳图，第一条下一步必须进入 P6b，从最佳实践和论文局部细节设置二轮优化轴，不能直接进 P7。
- **P6b 后下一步提醒:** 如果 P6b 已完成，第一条下一步必须生成/展示 4-6 张二轮论文局部优化变体图，通常 6 张。
- **session 状态延续提醒:** 默认根据当前 session/history 自动延续状态；如果历史不可用、被截断或跨会话迁移，再提供最近的 `当前状态与产物`。
```

When this footer is shown, the response is text-only and must stop before target-paper image generation. It may display already-saved package-local atlas images and must embed non-target concept/modeling example images when an abstract-decision trigger applies and no sufficient saved reference is available. It must also embed saved reference or non-target visual-structure images when the text explains layout skeleton, panel choreography, module topology, arrow grammar, candidate-board structure, second-round optimization geometry, or content architecture; prose-only structure descriptions are not enough. If relevant saved atlas or reference images exist, record the exact `![alt](...)` tags in `saved_reference_markdown_embeds_rendered` or `inline_reference_images_displayed`; a plain path list is not enough. Target-paper candidate, second-round variant, draft, final, or revision images must never be embedded in this text footer turn.
