# Folio Quickstart

Folio is a TUI-native, vendor-agnostic academic paper generator. It
talks to any **OpenAI-compatible** chat endpoint (OpenAI, Azure
OpenAI, DeepSeek, Mistral, Together, OpenRouter, Ollama, vLLM, ...)
and bakes in fail-closed checks for citations, plagiarism, dataset
licenses, and reproducible experiments.

This guide gets you from zero to a generated paper draft.

## 1. Install

```bash
git clone https://github.com/<you>/Folio.git
cd Folio
uv sync          # or: pip install -e .
```

Python 3.11+ required.

## 2. Configure one endpoint

Either run the wizard:

```bash
folio init
```

…or do it headless (good for CI):

```bash
folio init --headless \
  --label dev \
  --base-url https://api.deepseek.com/v1 \
  --default-model deepseek-chat \
  --api-key "$DEEPSEEK_API_KEY"
```

This writes `~/.folio/config.yml` (non-secret) and stores the API key
in your OS keyring (or an encrypted file fallback gated by
`FOLIO_MASTER_PASSPHRASE`).

You can manage endpoints later from inside the TUI:
**Settings → Endpoints** (`Ctrl+E`).

## 3. Launch the TUI

```bash
folio
```

You land directly in a chat-style prompt — no flags, no PDF needed.
Just type what you want:

```
write me an IEEE survey on diffusion models, 18000 words
```

…and the **intent** stage classifies your prose into a route and
seeds the clarify loop. Or use slash commands:

| Command | Effect |
|---|---|
| `:pdf <path> [topic]` | Format-to-paper from a sample PDF |
| `:survey <domain>` | Domain → corpus → ~18k-word survey |
| `:resume [<uuid>]` | Resume a previous run (no prefix → pick from list) |
| `:endpoints` | Open the **Settings → Endpoints** screen |
| `:quit` | Exit |

After every stage, Folio writes a checkpoint to
`~/.folio/runs/<run_id>/checkpoints/`. If a run is interrupted (Ctrl-C,
network blip, machine reboot), pick it up where it stopped:

```bash
folio resume --list      # table of recent runs
folio resume 7f3a        # resume by uuid prefix (Copilot-style)
```

The orchestrator skips already-finished stages — no re-billing for
LLM calls that already succeeded.

The pipeline walks you through:

1. **Topic & format** — pick a venue (IEEE, ACM, generic, …) or
   import a custom `FormatSpec` JSON.
2. **Clarification** — Folio asks only the questions whose answers
   actually shift the draft (entropy-gated, threshold τ\_e = 0.7).
3. **Outline → Draft → Cite** — each stage is routed by SAMA to the
   cheapest endpoint that can do the job.
4. **Experiments (optional)** — if Docker is available and
   `experiments.enabled = true`, the *Code* stage emits a Python
   script that runs in a hermetic sandbox
   (`--network=none --read-only --cap-drop=ALL`) and the *Experiment
   Write* stage prose-ifies the real metrics.
5. **Verify → Export** — fact-roundtrip + n-gram plagiarism + SPDX
   license check, then DOCX / LaTeX / PDF.

Every LLM call is traced; every run can be re-packaged as
`audit.zip` containing the manifest, full message, trace, sources,
and flags.

## 4. CLI reference

```text
folio                      launch the TUI (chat-style prompt)
folio init [--headless]    register or update an endpoint
folio resume [<prefix>]    resume a previous run by uuid prefix
folio resume --list        list the most recent runs
folio survey <domain>      run a domain-driven survey from CLI
folio format list          list cached FormatSpec entries
folio format show KEY      print one spec as JSON
folio format refresh KEY   re-extract a venue / custom spec
folio format import PATH   import a hand-authored spec JSON
```

## 4a. Optional: PDF compile

`export_pdf` 会按以下优先级自动尝试本机已装的 LaTeX 引擎，第一个能跑
通的就用；都没装时该 stage 标记 `skipped`，不阻塞其他产出
（`paper.tex` / `paper.docx` 仍然生成）：

1. `tectonic` — 单二进制、自动下载缺失字体，最省事
2. `latexmk -xelatex` — TeX Live / MiKTeX 自带，自动多遍编译，处理
   交叉引用最稳
3. `xelatex` — Unicode/CJK 友好，适合中文论文（CJC 模板）
4. `pdflatex` — 经典选择，MiKTeX / TeX Live 默认装好
5. `lualatex` — 现代替代
6. Docker `tectonictypesetting/tectonic` — 上述都没装时的兜底

可通过 `FOLIO_LATEX_ENGINE=xelatex` 之类的环境变量强制把某个引擎置
首（其余仍作 fallback）。

| Platform | 推荐安装命令 |
|---|---|
| Windows | `scoop install tectonic` 或装 [MiKTeX](https://miktex.org/)（自带 latexmk/xelatex/pdflatex） |
| macOS | `brew install tectonic` 或 `brew install --cask mactex` |
| Linux  | `apt install texlive-xetex latexmk` / `cargo install tectonic` / 发行版 `tectonic` 包 |
| Any    | 启动 Docker，Folio 自动回落到 `tectonictypesetting/tectonic` 镜像 |

## 5. Where things live

| Path                                | What                                   |
| ----------------------------------- | -------------------------------------- |
| `~/.folio/config.yml`               | endpoints (no secrets), defaults       |
| `~/.folio/folio.db`                 | runs, traces, formats (SQLite)         |
| `~/.folio/runs/<run_id>/`           | per-run artefacts and `audit.zip`      |
| `~/.folio/formats/`                 | extracted FormatSpec cache             |
| OS keyring or `~/.folio/secrets.enc`| API keys                               |

## 6. Licensing

- **Folio source**: MPL-2.0.
- **Generated papers**: MIT by default (override per-run in TUI).
- Datasets you cite are checked against the paper license via SPDX.

## 7. Troubleshooting

- *"endpoint already exists"* — `folio init --force` to overwrite.
- *"unknown dataset license"* — Folio fails closed; pin a known SPDX
  ID or replace the dataset.
- *experiments skipped* — Docker daemon not reachable, or
  `experiments.enabled` is `false`. Set it via TUI or
  `FOLIO_EXPERIMENTS_ENABLED=1`.
- *secrets unreadable* — set `FOLIO_MASTER_PASSPHRASE` if you fall
  back to the encrypted store.
- *PDF export skipped* — install [tectonic](#8-optional-pdf-compilation).

## 8. Optional: PDF compilation

`export_pdf` 会按 `tectonic → latexmk → xelatex → pdflatex → lualatex
→ docker tectonic` 的顺序尝试本机的 LaTeX 引擎，第一个跑通的就用。
都没有时 stage 标记 `skipped`：`paper.tex` / `paper.docx` / trace /
`audit.zip` 仍然产出，只少一份 `paper.pdf`。

最省事的一条路是 **tectonic**（单二进制，自动下载缺失包）：

```bash
# Windows (Scoop)
scoop install tectonic

# macOS (Homebrew)
brew install tectonic

# Linux (cargo)
cargo install tectonic
# or distro package; see https://tectonic-typesetting.github.io
```

如果你已经装了完整的 TeX 发行版（**MiKTeX** on Windows、**MacTeX**
on macOS、**TeX Live** on Linux），`latexmk` / `xelatex` / `pdflatex`
都可以直接用，无需额外装东西。中文论文（CJC 等）建议优先 xelatex：

```bash
export FOLIO_LATEX_ENGINE=xelatex   # 把 xelatex 置为首选
```

最后还有 Docker 兜底——只要 daemon 在跑，Folio 会自动用
`tectonictypesetting/tectonic` 镜像（首次拉镜像稍慢，无需任何本地
TeX）。

## 9. Sample gallery

Three frozen, cassette-backed reference outputs ship in the
repository's `examples/` directory — one per builtin venue
(IEEE / CJC / Springer-LNCS). Re-run them without an API key:

```bash
uv run python scripts/build_sample_gallery.py
```

See `docs/testing.md` for the cassette policy and `AGENTS.md` for the
hard architectural rules.
