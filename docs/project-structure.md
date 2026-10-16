# PaperCode 项目结构

> 内部维护文档。对外项目介绍见根目录 `README.md`；release 和 TaskFlow 细节见 `docs/internal/README.md`。

这个仓库同时承担产品源码、release 准备、TaskFlow 审计证据和上游来源追溯。仓库里保留的文件不等于 release 会发布的文件；release artifact 只应携带安装、运行和用户验证所需内容。

## 活跃产品运行时

- `packages/opencode/`：硬分叉后的 PaperCode 产品核心。OpenCode provider/model、agent/session、MCP、skill、tool、permission、plugin 和 TUI substrate 仍在这里；PaperCode 论文领域代码位于 `packages/opencode/src/paper`。
- `packages/preview/`：token-protected 只读网页 Preview，提供 PaperRun snapshot 和 SSE 更新，用于实时查看写作、渲染、annotation、cost 和 agent 诊断。
- `research-tools/`：Python MCP/CLI bridge，负责文档转换、爬虫/数据辅助、外部工具发现和 Pydantic 侧校验。
- `schemas/`：研究运行、事件、artifact、source、tool trace、claim、draft、review、export 和 checkpoint 的 JSON Schema。
- `scripts/`：release readiness、strict acceptance、provider matrix smoke、版本同步和文件面审计脚本。

## 产品状态与配置

- `.papercode/papercode.jsonc`：tracked 的项目级配置模板和 MCP 默认配置。
- `.papercode/skills/`、`.papercode/agent/`、`.papercode/command/`、`.papercode/themes/`、`.papercode/glossary/`、`.papercode/tool/`：随产品维护的 first-party assets。
- `.papercode/local/`：ignored 的本地 secret、provider key、model 默认值和机器级 override。
- `.papercode/runs/`：ignored 的工作区 PaperRun 输出。
- `~/.papercode/`：用户全局配置、provider、secret、工具链接、备份和 fallback runs。

`papercode init reset` 只能在备份后清理 ignored 的本地/全局状态，不能删除 tracked 项目资产。

## 计划、历史与证据

- `.plan/`：TaskFlow project router 状态；`.plan/confirmed/` 是执行计划与任务证据。
- `CHANGELOG`：当前活跃 colon-history 文件，是 README 版本的唯一来源。
- `docs/changelog/v0/`：0.1.x 到 0.7.x 的历史 colon-history 归档。
- `reports/`：验收、审计、benchmark 和 release readiness 报告。旧报告可能保留迁移前路径作为证据。

这些目录会留在仓库中用于追溯，但会通过 `.gitattributes` 从 GitHub source archive 中排除。

## 上游与参考材料

- `legacy/`：用于架构分析的参考项目、bundle 和旧实验材料，不是活跃 runtime。
- `upstream/`：OpenCode 上游 README、来源和迁移参考，不是对外 PaperCode 文档。
- `NOTICE.md`、`LICENSE`：上游许可证/来源说明和当前 MPL-2.0 项目许可边界。

## 根目录治理

根目录只保留跨包入口和治理文件：

- 构建与配置：`package.json`、`bun.lock`、`bunfig.toml`、`tsconfig.json`、`turbo.json`、`.oxlintrc.json`、`.prettierignore`、`.editorconfig`。
- 基础设施与上游兼容：`flake.nix`、`flake.lock`、`nix/`、`infra/`、`github/`、`sdks/`、`patches/`。
- 产品文档与治理：`README.md`、`CHANGELOG`、`CONTRIBUTING.md`、`SECURITY.md`、`NOTICE.md`、`docs/`、`reports/`。

ignored 的本地目录，例如 `node_modules/`、`.turbo/`、`tmp/`、`.papercode/local/` 和 `.papercode/runs/`，可以出现在开发者工作区，但不是 release artifact。

## Release 文件面

- GitHub source archive：由 `.gitattributes` 的 `export-ignore` 排除 `.plan/`、`reports/`、`legacy/`、`upstream/`、历史 changelog 归档、测试树、本地 runtime 和上游营销素材。
- npm/pack：由 package-level `files` 白名单控制，避免测试、spec、fixture、报告和来源材料进入包。
- 二进制 release：发布脚本应只组装 `bin`、`postinstall.mjs`、`LICENSE` 和 `package.json`。
- 审计入口：`scripts/check-release-files.ps1` 会生成 `reports/release-file-audit.md` 并在发现阻断项时失败。
