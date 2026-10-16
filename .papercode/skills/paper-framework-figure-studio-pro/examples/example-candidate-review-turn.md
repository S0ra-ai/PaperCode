# Example P6 First-Round Candidate Review Turn

This is P6. It must happen after P5. It records the first-round batch and selects the current best direction, but it does not enter final image brief construction.

```markdown
## 当前执行计划

- 当前位置：P6 - 第一轮候选图回看与当前最佳方向选择（TEXT_ONLY）
- 本轮目标：记录上一轮 IMAGE_ONLY 候选图 batch，比较候选图，选出当前最佳方向，并进入 P6b 二轮论文局部优化设置

## Candidate Review

默认推荐：选择 Candidate 3 作为当前最佳第一轮方向。它最清晰地突出 proposed framework，模块层级可读，箭头路径不拥挤。风险是右侧 evidence cards 信息密度略高，下一步应在 P6b 中围绕标签经济性、case anchor 和 callout 位置做局部优化。

## 默认推荐

不要直接进入 P7。先进入 P6b，围绕 Candidate 3 设置 6 个二轮优化方向：模块关系、证据/案例锚点、标签经济性、面板过渡、颜色语义、callout 位置。

## 当前状态与产物

- **当前模式:** TEXT_ONLY
- **当前步骤:** P6
- **全部步骤与当前位置:** S0 -> P1 -> P2 -> P3 -> P4 -> P5 -> P6 [当前位置] -> P6b -> P6b-IMAGE -> P6c -> P7 -> P8 -> P9
- **visual_candidate_board_status:** reviewed
- **candidate_image_batch_id:** candidate-board-r1-001
- **selected_visual_candidate:** Candidate 3 recommended as current best first-round direction
- **best_practice_divergence_status:** required_after_first_selection
- **best_practice_divergence_axes:** []
- **second_round_candidate_batch_id:** null
- **selected_second_round_candidate:** null
- **上一轮 IMAGE_ONLY 产物是否已登记:** recorded
- **本轮产物:** first-round candidate review and current-best recommendation
- **待产物:** P6b paper-local best-practice divergence setup

## 下一步你可以这样问

1. `请使用 **paper-framework-figure-studio-pro**，执行，根据当前状态，下一步执行：进入 P6b，从最佳实践和论文局部细节出发，设置 6 个二轮优化变体方向。`
2. `请使用 **paper-framework-figure-studio-pro**，根据当前状态，提供下一步提问建议。`
```
