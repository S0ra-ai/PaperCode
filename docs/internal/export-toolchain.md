# 导出工具链与字体

论文包的四类产物（Markdown / LaTeX / PDF / DOCX）由 `packages/opencode/src/paper/export-pipeline.ts` 生成：Markdown 由 runtime 直接产出，LaTeX 与 DOCX 走 pandoc，PDF 用 LaTeX 引擎编译上一步的 `.tex`。工具路径按 `~/.papercode/tools.json` 里 `papercode init` 写入的链接 → `PAPERCODE_TOOL_*` 环境变量 → PATH → 常见安装位置的顺序解析，配置里的链接优先（环境变量是缺失或失效时的回退，不是覆盖）。

## 中文字体

含中日韩文字（Han、假名、谚文、CJK 标点、全角形式）的稿件会以 `documentclass=ctexart` 交给 xelatex，由 **ctex 自行按平台挑选字体集**：macOS 用 STSong/Songti SC，Windows 用 SimSun/SinHei，Linux 用 TeX Live 自带的 Fandol。这些字体随系统或 TeX 发行版提供，因此默认路径不需要用户装任何字体。

不要写死字体名。一旦指定，xelatex 只会用这个名字，机器上没有就整份 PDF 编译失败——曾经的 `CJKmainfont=SimSun` 就是如此：SimSun 是 Windows 专有字体，macOS 上 xelatex 会先去 `mktextfm` 找 `SimSun/OT`，失败后在 `missfont.log` 里堆满 `mktextfm` 记录，最终退出码 1、不产出 PDF。

确实需要指定字体时（例如统一成宋体或思源系列），用环境变量：

```bash
PAPERCODE_EXPORT_CJK_FONT="Songti SC" PAPERCODE_EXPORT_LATIN_FONT="Times New Roman" \
  papercode runs export --run <run-id> --forced
```

`mainfont` 同理默认为空：`Times New Roman` 在精简的 Linux TeX 环境里同样可能缺失。环境变量是**唯一**的用户入口：CLI、HTTP 接口和 TUI 的导出按钮都只接受 `forced`，程序化调用可以用 `renderPaperExportPipeline` 的 `fonts` 输入。桌面端把登录 shell 的环境合并给 sidecar（Windows 上不探测 shell），所以在 Windows 上要把变量设成系统或用户级环境变量。

## 失败诊断

TeX 引擎把真正的原因以 `!` 开头的行写在 **stdout**，而 kpathsea 的 `mktextfm` 噪声灌在 **stderr**。诊断因此先给出第一个 `!` 行，再附上截断后的 stderr 摘要；字体类错误额外提示可用 `PAPERCODE_EXPORT_CJK_FONT` / `PAPERCODE_EXPORT_LATIN_FONT` 指定字体。排查现场时优先看导出目录里的 `<bundle>.log`，`missfont.log` 只记录缺字体的位图回退请求。

编译成功但**缺字**是另一回事：TeX 遇到没有字形的字符会照常退出 0，只把 `Missing character: There is no X in font Y` 写进日志，PDF 里那个字是空白。ctex 解析的是中文字体集，所以引用韩文、日文或生僻汉字的稿件可能整段变空白——导出会照常显示成功。现在 PDF 写出后会扫描该日志，把缺失的字符与字体作为诊断挂到产物与 manifest 上（不再静默），要消除它们就得给对应语种指定字体。

## 验收命令

```bash
cd packages/opencode
bun run --conditions=browser ./src/index.ts runs export --run <run-id> --forced
```

中文稿件应看到 pdf 一行是 `✓`，并且导出目录里的 `.log` 不出现 `Missing character` 警告。同一个 run 可以重复导出：产物文件按 `bundle-<mode>-<draft>` 覆盖，事实文件追加，索引重建时以最后一次为准。
