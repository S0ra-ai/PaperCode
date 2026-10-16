# 导出工具链与字体

论文包的四类产物（Markdown / LaTeX / PDF / DOCX）由 `packages/opencode/src/paper/export-pipeline.ts` 生成：Markdown 由 runtime 直接产出，LaTeX 与 DOCX 走 pandoc，PDF 用 LaTeX 引擎编译上一步的 `.tex`。工具路径来自 `papercode init` 写入的 `~/.papercode/tools.json`，也可用 `PAPERCODE_TOOL_*` 覆盖。

## 中文字体

含中日韩文字（Han、假名、谚文、CJK 标点、全角形式）的稿件会以 `documentclass=ctexart` 交给 xelatex，由 **ctex 自行按平台挑选字体集**：macOS 用 STSong/Songti SC，Windows 用 SimSun/SinHei，Linux 用 TeX Live 自带的 Fandol。这些字体随系统或 TeX 发行版提供，因此默认路径不需要用户装任何字体。

不要写死字体名。一旦指定，xelatex 只会用这个名字，机器上没有就整份 PDF 编译失败——曾经的 `CJKmainfont=SimSun` 就是如此：SimSun 是 Windows 专有字体，macOS 上 xelatex 会先去 `mktextfm` 找 `SimSun/OT`，失败后在 `missfont.log` 里堆满 `mktextfm` 记录，最终退出码 1、不产出 PDF。

确实需要指定字体时（例如统一成宋体或思源系列），用环境变量：

```bash
PAPERCODE_EXPORT_CJK_FONT="Songti SC" PAPERCODE_EXPORT_LATIN_FONT="Times New Roman" \
  papercode runs export --run <run-id> --forced
```

`mainfont` 同理默认为空：`Times New Roman` 在精简的 Linux TeX 环境里同样可能缺失。

## 失败诊断

TeX 引擎把真正的原因以 `!` 开头的行写在 **stdout**，而 kpathsea 的 `mktextfm` 噪声灌在 **stderr**。诊断因此先给出第一个 `!` 行，再附上截断后的 stderr 摘要；字体类错误额外提示可用 `PAPERCODE_EXPORT_CJK_FONT` / `PAPERCODE_EXPORT_LATIN_FONT` 指定字体。排查现场时优先看导出目录里的 `<bundle>.log`，`missfont.log` 只记录缺字体的位图回退请求。

## 验收命令

```bash
cd packages/opencode
bun run --conditions=browser ./src/index.ts runs export --run <run-id> --forced
```

中文稿件应看到 pdf 一行是 `✓`，并且导出目录里的 `.log` 不出现 `Missing character` 警告。同一个 run 可以重复导出：产物文件按 `bundle-<mode>-<draft>` 覆盖，事实文件追加，索引重建时以最后一次为准。
