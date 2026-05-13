# Example Startup Turn

## 当前执行计划

当前位置：S0 - 启动确认（STARTUP_PLAN_ONLY / TEXT_ONLY）。本轮只展示流程和已保存的子类型/风格示意图谱，不做实质论文分析，不调用 Create image、`$imagegen` 或任何图像 API。

即使用户第一句话要求“直接出图”或“生成 6 张候选图”，首次回复也只展示启动计划和已保存 atlas。出图请求应记录为 pending image request；下一轮确认后才能进入后续步骤。

## 已保存子类型/风格示意图谱

![Framework Figure Subtypes](C:/Users/qu_yw/.codex/skills/paper-framework-figure-studio-pro/assets/subtype-atlas/boards/subtype-overview.png)

![Visual Grammar and Layout](C:/Users/qu_yw/.codex/skills/paper-framework-figure-studio-pro/assets/subtype-atlas/boards/visual-grammar-layout.png)

![Reader Role and Detail](C:/Users/qu_yw/.codex/skills/paper-framework-figure-studio-pro/assets/subtype-atlas/boards/reader-role-detail.png)

![Visual Communication Styles](C:/Users/qu_yw/.codex/skills/paper-framework-figure-studio-pro/assets/subtype-atlas/boards/visual-communication-styles.png)

| 步骤 | 回复类型 | 做什么 | 本步产物 |
|---|---|---|---|
| S0 | STARTUP_PLAN_ONLY (TEXT_ONLY) | 启动确认 + 已保存 atlas 展示 | 流程预览 + atlas boards |
| P1 | TEXT_ONLY | 材料收集 | material status |
| P2 | TEXT_ONLY | 图需求诊断与 routing，展示相关 atlas | subtype candidates |
| P3 | TEXT_ONLY | 读者效果与 4-6 个文字候选，必要时展示风格/布局 atlas | text candidate schemes |
| P4 | TEXT_ONLY | 设置视觉候选图板 | candidate-board brief |
| P5 | IMAGE_ONLY | 生成多张候选图/示意图 | image candidates only |
| P6 | TEXT_ONLY | 回看候选图并锁定/修正方向 | selected direction |
| P7 | TEXT_ONLY | 构建正式 image brief | final image brief |
| P8 | IMAGE_ONLY | 生成正式候选图/修订图 | formal images only |
| P9 | TEXT_ONLY | 诊断、caption、legend、正文衔接 | final text package |

## 默认推荐

确认开始，先提供论文摘要和方法说明。后续一旦出现多个文字方案，默认下一步会进入 P4/P5/P6 候选图桥接流程，而不是只从文字方案里定稿。

## 当前状态与产物

- **当前模式：** STARTUP_PLAN_ONLY (TEXT_ONLY)
- **当前步骤：** S0
- **全部步骤与当前位置：** S0 [当前位置] -> P1 -> P2 -> P3 -> P4 -> P5 -> P6 -> P7 -> P8 -> P9
- **用户本轮实际请求解析：** 首次触发；若用户请求直接出图，记录为 pending，不在首轮执行
- **用户请求前所在步骤：** S0
- **按用户请求执行后的对应步骤：** S0
- **状态转移理由：** 首次触发必须保持启动计划，不做实质分析或现场生图
- **非推荐提问处理：** not_needed / mapped_to_text_setup_before_image_only
- **已推断或缺失的前置条件：** 目标论文材料、P1-P4 仍未完成
- **材料状态：** not_provided
- **subtype_atlas_status：** displayed
- **subtype_atlas_manifest_path：** assets/subtype-atlas/manifest.json
- **saved_reference_images_displayed：**
  - assets/subtype-atlas/boards/subtype-overview.png
  - assets/subtype-atlas/boards/visual-grammar-layout.png
  - assets/subtype-atlas/boards/reader-role-detail.png
  - assets/subtype-atlas/boards/visual-communication-styles.png
- **saved_reference_markdown_embeds_rendered：**
  - `![Framework Figure Subtypes](C:/Users/qu_yw/.codex/skills/paper-framework-figure-studio-pro/assets/subtype-atlas/boards/subtype-overview.png)`
  - `![Visual Grammar and Layout](C:/Users/qu_yw/.codex/skills/paper-framework-figure-studio-pro/assets/subtype-atlas/boards/visual-grammar-layout.png)`
  - `![Reader Role and Detail](C:/Users/qu_yw/.codex/skills/paper-framework-figure-studio-pro/assets/subtype-atlas/boards/reader-role-detail.png)`
  - `![Visual Communication Styles](C:/Users/qu_yw/.codex/skills/paper-framework-figure-studio-pro/assets/subtype-atlas/boards/visual-communication-styles.png)`
- **missing_reference_images：** []
- **reference_display_mode：** startup_atlas
- **reference_display_render_status：** rendered
- **visual_candidate_board_status：** not_started
- **live_image_generation_in_current_turn：** false
- **target_paper_image_generation_in_current_turn：** false
- **target_paper_images_embedded_in_text_turn：** false
- **inline_reference_image_role：** saved_atlas
- **本轮产物：** startup plan + saved atlas display
- **待产物：** 材料收集、routing、文字候选、候选图板
- **上一轮 IMAGE_ONLY 产物是否已登记：** not_applicable

## 下一步你可以这样问

1. `请使用**paper-framework-figure-studio-pro**，执行，根据当前状态，下一步执行：确认开始，我会提供论文摘要和方法说明。`
2. `请使用**paper-framework-figure-studio-pro**，根据当前状态，提供下一步提问建议。`
