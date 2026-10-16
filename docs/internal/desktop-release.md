# 桌面端发布与自动更新

桌面端是 `packages/desktop` 的 Electron 应用，与 CLI 走不同的发布通道：CLI 由 `publish.yml` / `script/publish.ts` 发布，桌面端由 `.github/workflows/desktop.yml` 打包并（可选）上传到 GitHub Release。

## 渠道与产物命名

同一个版本会构建三种渠道，`PAPERCODE_CHANNEL` 决定 appId、产品名、更新通道和产物文件名：

| 渠道 | appId | 产品名 | 更新通道 | 产物名 |
| --- | --- | --- | --- | --- |
| `dev`（默认） | `ai.papercode.desktop.dev` | papercode Dev | 不更新（`UPDATER_ENABLED` 为 false） | `papercode-desktop-dev-<os>-<arch>.<ext>` |
| `beta` | `ai.papercode.desktop.beta` | papercode Beta | `beta` | `papercode-desktop-beta-<os>-<arch>.<ext>` |
| `prod` | `ai.papercode.desktop` | papercode | `latest` | `papercode-desktop-<os>-<arch>.<ext>` |

产物名必须带渠道：三种渠道的同一版本否则会生成同名文件，而 GitHub 发布器对同名资产是覆盖语义，后构建的渠道会顶掉前面的，并让各个渠道的更新元数据都指向它。`prod` 保持不带渠道的短名，因为它是用户按名下载的那个。

## 本地打包

```bash
cd packages/desktop
ELECTRON_DIST="$PWD/node_modules/electron/dist" bun run package:mac   # 或 package:win / package:linux
```

`ELECTRON_DIST` 让打包复用已解包的 Electron，避免在受限网络下重新下载。首次构建 dmg 会从 GitHub 拉 `dmgbuild` 工具包（约 20 MB），慢速网络下可能长时间停在 0% CPU，属正常现象；中断会丢弃已下载进度。产物在 `packages/desktop/dist/`。

## 签名与公证

- **无凭据**：electron-builder 退回 ad-hoc 签名，`spctl -a` 判 `rejected`。应用在构建它的机器上仍可运行（本地构建的包没有 `com.apple.quarantine`），但拷到其他机器会被 Gatekeeper 拦下。
- **可分发**：需要 Developer ID Application 证书（`MAC_CERTIFICATE` base64 p12 + `MAC_CERTIFICATE_PASSWORD`，对应 `CSC_LINK` / `CSC_KEY_PASSWORD`），以及公证凭据 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`。三者齐备时 `electron-builder.config.ts` 自动开启 `notarize` 与 dmg 签名。

## 自动更新

应用读取 electron-updater 的元数据：macOS 为 `<channel>-mac.yml`，Windows 为 `<channel>.yml`，其中 `prod` 通道的文件名是 `latest*`。因此：

- 只有 `beta` 与 `prod` 构建会生成更新元数据和 `Contents/Resources/app-update.yml`（`dev` 不生成，也不检查更新）。
- 更新源是 `publish` 配置指向的 GitHub Release（`S0ra-ai/PaperCode`），Release 必须已发布（非 draft）才能被更新器看到。
- 更新通道跟随构建渠道，且不允许降级：beta 构建之前会去查 `latest-mac.yml`，既看不到自己的更新，又可能被旧的 prod 版本顶替。
- 同一版本的两个架构（arm64/x64）必须在**一次** electron-builder 调用里构建，这样才会合并成一份同时列出两个架构的元数据；分成两个 job 会各写一份同名文件，后上传的覆盖前者，其中一个架构会拿到错误的包。

## 发布流程

1. 确认 `packages/desktop/package.json` 的 `version` 与要发布的版本一致（electron-builder 用 `v<version>` 作为 Release tag）。
2. `gh workflow run desktop.yml -f channel=prod -f platform=all -f publish=true`。
3. 检查 electron-builder 创建的 draft Release：安装包、`.blockmap`、`latest*.yml` 是否齐全。
4. 发布该 Release —— 更新器只认已发布的 Release。
