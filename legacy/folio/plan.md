# Folio — Implementation Plan

> Living document. Update at meaningful milestones.
> Authoritative for *what* to do and *why*; SQL `todos` table tracks
> *current state* of execution.

---

## 0. North star

Build a **TUI-native, single-user, agent-style engine** that turns a
fuzzy academic ask + a sample format into a fully formatted, fully
verified paper, with optional sandboxed code experiments.

MVP (M1) demo target:
> User drops a sample IEEE PDF + the topic *"transformer-based time
> series forecasting on energy load"* → Folio asks 3–5 clarifying
> questions → extracts the IEEE format spec → drafts an 8-page paper
> with verified references → exports `.tex` + `.pdf`.

## 1. Locked decisions

See `PROJECT_CONTEXT.md` § 2 for the original 6 Q&A. Below extends with
the second-round decisions made in this planning session.

| Item | Decision |
|---|---|
| Stack | Python **3.11** + Textual + Rich + Docker + MCP-client |
| Package manager | **uv only** (no pip fallback) |
| Verification | Full provenance |
| MVP focus | `format_to_paper` |
| Repo layout | See `PROJECT_CONTEXT.md` § 5 |
| Multi-user | **No.** Single-user, single profile at `~/.folio/profile.yml` |
| Storage root | `~/.folio/` (SQLite, cache, profile, trace JSONL) |
| Default citation style | **中国计算机学报 (CJC, GB/T 7714 variant)** when no venue inferred |
| MVP export formats | `.tex` + `.pdf` + `.docx` |
| PDF parsing | `pdfplumber` first; **Tesseract OCR fallback** for scanned/image-only PDFs |
| LaTeX → PDF | **tectonic in Docker** (minimal host deps) |
| Default LLM provider policy | **No mock fallback at runtime — real keys only.** User will supply ≥ 1 provider + key; provider layer is built generic so any can be slotted in. First concrete provider chosen when keys arrive. |
| Test provider policy | **No `MockProvider`. Tests use recorded real-LLM cassettes** (VCR-style record/replay via `pytest-recording` or `vcrpy`). One-time recording cost, deterministic CI replay. **This supersedes AGENTS.md § 1.4 — needs AGENTS.md update.** |
| License — code | **MPL-2.0** (Mozilla Public License 2.0) |
| License — generated papers | **MIT** (per user; flagged: MIT is unusual for prose, can revisit) |
| Telemetry | Off by default; **opt-in remote** via config wizard in M5 |

---

## 2. Milestones

### M0 — Bootstrap (current)

Goal: empty-but-valid project that lints, type-checks, and runs
"hello-folio" TUI. Sets up all guardrails before any feature work.

Todos: `m0-*`

### M1 — `format_to_paper` MVP (the demo)

Goal: end-to-end thin slice. Sample PDF in → formatted paper out, with
verified citations. No code experiments yet, no plagiarism check yet.

Todos: `m1-*`

### M2 — Clarification deepening + multi-provider routing

Goal: Real interview loop with entropy-based stopping. SAMA model
selection across ≥ 3 providers. Persistent user profile.

Todos: `m2-*`

### M3 — Sandboxed code experiments

Goal: When topic implies empirical results, Folio finds a dataset,
drafts code, runs in Docker, writes experiment section from the actual
output. Two control modes (autopilot vs ask).

Todos: `m3-*`

### M4 — Full provenance & honesty

Goal: Cited-fact round-trip verification, dataset license check,
plagiarism self-scan, audit trail export.

Todos: `m4-*`

### M5 — Polish & packaging

Goal: One-command install (`pipx install folio`), config wizard,
docs site, sample gallery.

Todos: `m5-*`

---

## 3. M0 todo breakdown (to seed SQL on session start)

| id | title | depends on |
|---|---|---|
| `m0-agents-update` | Update `AGENTS.md` § 1.4: replace "MockProvider in tests" with "recorded LLM cassettes; runtime never mocks". Also add: code license = MPL-2.0, generated paper license = MIT. | — |
| `m0-pyproject` | `uv init` then `pyproject.toml` with deps (textual, rich, jinja2, pydantic, sqlalchemy, alembic, httpx, docker, pdfplumber, pytesseract, ruff, mypy, pytest, pytest-asyncio, **pytest-recording**, mcp). Set `requires-python = ">=3.11,<3.12"`. Pin via `uv lock`. | — |
| `m0-pkg-skeleton` | Create the full tree from `PROJECT_CONTEXT.md` § 5: `app/{tui, core/{contract,stages,clarify,orchestrator}, providers, tools, sandbox, verify, export, persistence, observability, config}` + `prompts/`, `templates/`, `tests/{unit,integration,e2e,fixtures,cassettes}/`, all with `__init__.py` where applicable | m0-pyproject |
| `m0-contract` | Implement `StageMessage`, `Capability`, `validate()` in `app/core/contract/` | m0-pkg-skeleton |
| `m0-provider-iface` | Provider abstract base + `ProviderRegistry`. **No MockProvider.** Concrete adapters added in M2 when user supplies keys. | m0-pkg-skeleton |
| `m0-cassette-harness` | `pytest-recording` config + `tests/cassettes/` policy: record-once with real key (env-gated), replay-only in CI. Document in `tests/README.md`. | m0-provider-iface |
| `m0-prompt-loader` | Jinja2 loader in `app/core/prompts.py` + `prompts/_base.j2` skeleton (per AGENTS.md § 2) | m0-pkg-skeleton |
| `m0-trace` | `app/observability/trace.py` writing JSONL audit records to `~/.folio/trace/` | m0-pkg-skeleton |
| `m0-tui-hello` | Minimal Textual app: title bar + log pane + input box, prints "hello-folio" | m0-pkg-skeleton |
| `m0-config` | `app/config/loader.py` — read `~/.folio/config.yml`, env override (provider keys, telemetry off-by-default) | m0-pkg-skeleton |
| `m0-sqlite` | SQLite via SQLAlchemy + Alembic init at `~/.folio/folio.db` (one table: `trace_events`) | m0-pyproject |
| `m0-pdf-smoke` | One pytest that loads a fixture IEEE PDF via `pdfplumber` (+ OCR fallback path stub) and asserts non-empty text. Fixture in `tests/fixtures/`. | m0-pyproject |
| `m0-ci-local` | Pre-commit hooks: ruff, mypy, pytest. Verify all pass. | all above |
| `m0-readme-quickstart` | Update README with "5-minute quickstart" once TUI runs; mention single-user scope, MPL-2.0 / MIT licenses | m0-tui-hello |

Definition-of-done for M0: `uv run pytest && uv run ruff check && uv run mypy app/core && uv run python -m folio` all succeed on a clean clone, and the `m0-pdf-smoke` test is green. (No e2e LLM smoke in M0 because no real provider exists yet — that test moves to first M2 provider todo.)

---

## 4. M1 todo breakdown (sketch — refined when M0 closes)

| id | title | depends on |
|---|---|---|
| `m1-pdf-ingest` | Accept sample PDF, extract text + structure (`pdfplumber` first; Tesseract OCR fallback for scanned PDFs) | m0-pdf-smoke |
| `m1-format-stage` | `FormatStage`: LLM-driven extraction of margins, font, citation style, section order, figure caption rules → typed `FormatSpec` | m1-pdf-ingest, m0-prompt-loader, m1-format-cache |
| `m1-format-cache` | `FormatSpec` 三层缓存 in `app/core/formats/`：(1) `builtin/` 仓库内 ship 的常见期刊模板（IEEE/ACM/Nature/CJC/Springer LNCS）；(2) `~/.folio/formats/venue/<venue_label>.json` 由 LLM 推断期刊后的全局复用层；(3) `~/.folio/formats/custom/<sha256>.json` 用户自定义模板/要求文档专属，**永不与他人/他源共享**。每条带 `source: builtin|venue|custom`、`extracted_at`、`schema_version`、`prev_version` 元数据。 | m1-format-stage 之前先建好接口，二者 PR 内合并 |
| `m1-format-refresh` | 刷新策略：(a) `--refresh-format` CLI/TUI 标志强制重抽；(b) `venue` 层条目 > 30 天且本次会用到时，TUI 提示一次"是否刷新"；(c) `custom` 层条目永不自动过期（用户自己的东西不替他做主），只在 `--refresh-format` 时重抽；(d) `builtin` 层只能用 `folio format update` 整体刷新（拉取仓库新版）。重抽后旧版重命名为 `<name>.v<N>.json`，调用 LLM 生成人话 diff 写入新版 `meta.json`。 | m1-format-cache |
| `m1-format-cli` | `folio format list / show <key> / refresh <key> / forget <key> / import <file>` 子命令暴露三层缓存管理；M1 内最小集，M5 在 TUI 加面板。 | m1-format-cache |
| `m1-clarify-stage-min` | Minimal clarify loop: 5 hard-coded fields (topic, venue, length, language, author) — entropy logic deferred to M2 | m0-prompt-loader |
| `m1-outline-stage` | Outline generation conditioned on topic + FormatSpec | m1-format-stage, m1-clarify-stage-min |
| `m1-draft-stage` | Section-by-section drafting, streaming to TUI | m1-outline-stage |
| `m1-cite-fetch` | Fetch references via MCP arxiv + Crossref; build BibTeX | m1-draft-stage |
| `m1-verify-refs` | `RefVerifier`: validate every BibTeX entry exists (DOI / arXiv lookup) — **fail closed**, blocks export | m1-cite-fetch |
| `m1-export-latex` | LaTeX export using extracted FormatSpec (or fallback CJC / IEEE template) — gated on verify success | m1-verify-refs |
| `m1-export-pdf` | Compile to PDF via **tectonic in Docker** | m1-export-latex |
| `m1-export-docx` | Pandoc-based `.tex` → `.docx` conversion (run in same Docker image as tectonic) | m1-export-latex |
| `m1-cite-style-cjc` | CJC (GB/T 7714) BibTeX style + `.bst` or biblatex config; default when no venue inferred | m1-cite-fetch |
| `m1-orchestrator-seq` | Sequential orchestrator: format → clarify → outline → draft → cite → verify → export | m1-format-stage, m1-clarify-stage-min |
| `m1-tui-progress` | TUI shows per-stage progress, streaming partials, costs | m1-orchestrator-seq |
| `m1-e2e-test` | One end-to-end test using recorded LLM cassettes: sample PDF → output `.tex`/`.docx`. Includes a second run that asserts the `FormatStage` is **skipped** thanks to cache hit. | all above |

### 4a. FormatSpec 缓存设计（三层 + 刷新）

> 期刊模板理应可复用以省 token，但偶尔会改版，必须能刷新；用户自己的模板与公共模板要分开管，避免互污染。

**三层来源（按查找优先级从高到低）**

| 层 | 路径 | 内容 | 谁可见 | 更新方式 |
|---|---|---|---|---|
| `custom` | `~/.folio/formats/custom/<sha256>.json` | 用户上传的样本 PDF / 模板 / 投稿要求文档抽出来的 spec | 仅本机本用户 | 永不自动过期；仅 `--refresh-format` |
| `venue` | `~/.folio/formats/venue/<venue_label>.json` | LLM 从样本 PDF 推断期刊后抽的 spec（如 `IEEE_Access`、`CJC`） | 本机用户全局复用 | 30 天过期 → TUI 提示；`--refresh-format` 强制 |
| `builtin` | 仓库内 `templates/<venue>.json` | Folio 自带的常见期刊兜底模板 | 所有人，随版本走 | `folio format update` 拉取仓库新版 |

**查找链**：当前任务声明的 custom 文件 → 用户在 clarify 阶段给的 venue → builtin → 都没有则跑 `FormatStage` 抽取（结果落到 `venue` 或 `custom` 层）。

**刷新触发**
1. `--refresh-format` 显式强制（任何层）。
2. `venue` 层 `extracted_at` 超过 30 天且本次会用到时，TUI 弹一次"是否刷新？[Y/n]"。
3. `custom` 层永不自动过期（用户自己的东西，不替他做主）。
4. `builtin` 仅靠 `folio format update`。

**版本与 diff**：旧版本不删，重命名为 `<key>.v<N>.json`；新版 `meta.json` 里写 `prev_version` 指针 + LLM 生成的人话 diff（"section 顺序变了 / 引用样式从 numeric 改成 author-year"），方便复现旧论文时手动选用旧版。

**单用户**：当前不实现跨用户共享，仅预留 `folio format export/import <file>` 入口（M1 不必实现，M2 再加）。

**失效保护**：所有缓存条目带 `schema_version`；FormatSpec 数据结构升级时自动判 invalid 并回退到重抽，带 warning，不静默成功。

---

## 5. M2–M5 (sketch — to be refined when prior milestone closes)

### M2 — Clarification deepening + multi-provider routing

- `m2-entropy-clarify` — replace hard-coded 5-field loop with entropy/threshold gating (τ_e=0.7, τ_f, τ_c per CoPaper).
- `m2-question-gen` — LLM-driven next-question generator conditioned on missing-field uncertainty.
- `m2-profile-store` — `~/.folio/profile.yml` (author, affiliation, ORCID, default citation style).
- `m2-provider-openai-compat` — **唯一的 `OpenAICompatibleProvider` 适配器**。完全通用：任何实现下列协议的 endpoint 都能挂进来，不为任何具体厂商写代码。
  - **要求的协议**：OpenAI Chat Completions v1（`POST {base_url}/chat/completions`，`Authorization: Bearer <key>`，请求/响应字段遵循 OpenAI 官方 schema：`messages[]`、`model`、`temperature`、`max_tokens`、`stream`、`tools`、`response_format`）。
  - **可选的协议扩展**：`/embeddings`（用于检索增强）、SSE `stream=true`（用于 TUI 流式输出）。两者都可探测，缺失则降级。
  - **配置方式**：用户在 `~/.folio/config.yml` 或环境变量里定义任意多个 endpoint 实例，每个实例只填 `base_url + api_key + 默认 model`，Folio 不关心背后是谁。
  - **已知兼容的 endpoint 形态**（仅作为文档示例，**不写成代码 todo**）：OpenAI 官方、Azure OpenAI（含路径变体）、DeepSeek 官方、Moonshot Kimi、智谱 GLM `/api/paas/v4`、阿里 DashScope `/compatible-mode/v1`、字节豆包 `/api/v3`、OpenRouter、UniAPI / API2D / 各类聚合代理、本地 Ollama / vLLM / LM Studio / llama.cpp server。
- `m2-provider-probe` — 启动时对每个已配置 endpoint 做一次能力探测（`/models` 列表 + 一次 1-token chat 调用），生成本地 capability profile（chat/stream/tools/embeddings/上下文长度），存入 `~/.folio/providers.cache.json`。SAMA 路由用此表，避免硬编码任何厂商。
- `m2-tui-provider-panel` — TUI 内 `Settings → Endpoints` 面板，让用户**完全在界面里**增删改 endpoint，无需手编 `.env`/`config.yml`：
  - 列表视图：每条显示标签、`base_url`、默认 model、最近一次探测的能力徽章（chat/stream/tools/embeddings）、状态灯（绿=已探测可用 / 黄=未探测 / 红=最近失败）。
  - 表单视图：标签、`base_url`、`api_key`（密文输入，可粘贴）、默认 model、可选 model 白名单、可选自定义 headers。
  - "Test" 按钮当场调 `m2-provider-probe` 的探测路径，把结果写回 capability cache。
  - 写回到 `~/.folio/config.yml`（**不写 `.env`**——`.env` 仅供开发期/CI 注入），key 段加密存储（OS keyring 优先；不可用时落 `~/.folio/secrets.enc`，密码来自首次进入面板时设的 master pass）。
  - `.env` 里已有的 endpoint 在 TUI 里只读显示并标记"来源：env"，避免把开发期凭据写穿到用户配置文件。
  - 删除 endpoint 时同步清掉它在 capability cache 与 SAMA 历史里的条目。
- `m2-cassette-record-first` — 用最便宜的已配置 endpoint 跑一次 trivial stage，把响应录成 cassette，固化"运行期不 mock + 测试用回放"约定。
- `m2-sama` — Stage-Aware Model Assignment：5-d capability vector dot-product − λ·cost，权重表来自 `m2-provider-probe` 的探测结果 + 用户在 config 里的覆盖项（如手动标 "qwen-coder-plus → code=0.9"）。
- `m2-failover` — provider failover + budget ceiling per task.
- `m2-cost-meter` — surface cumulative/per-stage token cost in TUI（按 endpoint 聚合，不按厂商品牌）。

### M3 — Sandboxed code experiments

- `m3-docker-runner` — `app/sandbox/` exec wrapper, time/CPU/mem limits, network off by default.
- `m3-dataset-finder` — HuggingFace + Kaggle MCP search, return candidates with license tag.
- `m3-code-stage` — `CodeStage`: drafts experiment code conditioned on topic + dataset + outline.
- `m3-experiment-loop` — run → capture stdout/figures/metrics → write `ExperimentResult` into StageMessage.
- `m3-experiment-section` — `ExperimentWriteStage`: turns results into prose + tables + figures.
- `m3-control-modes` — `autopilot` vs `interactive`; interactive pauses orchestrator on risky decisions (dataset choice, retry-on-failure, cost spike).

### M4 — Full provenance & honesty

- `m4-fact-roundtrip` — `FactVerifier`: re-asks an independent provider "does source X support claim Y?", flags mismatches.
- `m4-dataset-license` — verify dataset license is compatible with paper's declared license.
- `m4-plagiarism` — n-gram self-scan vs cited sources + a small web sample; flag overlapping spans.
- `m4-audit-export` — bundle traces + sources + verifier reports into a single `audit.zip` for reviewers.

### M5 — Polish & packaging

- `m5-pipx-package` — entry point, console script, cross-platform smoke.
- `m5-config-wizard` — first-run `folio init` interactive setup (provider keys, default style, profile).
- `m5-sample-gallery` — curated `examples/` (IEEE, ACM, Nature) with expected outputs as regression goldens.
- `m5-docs-site` — MkDocs site covering install / quickstart / 8 stages / MCP / troubleshooting.

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Format extraction unreliable on weird PDFs | Ship a `templates/` library (IEEE, ACM, Springer LNCS, Nature) as fallback; LLM picks closest |
| LLM hallucinated citations | Verifier fails closed — paper not exported until every ref resolves |
| Docker not installed on user box | M3 only; degrade gracefully to "code generated, please run manually" |
| MCP server availability/network | Cache aggressively in `~/.folio/cache/`, allow offline mode with sane errors |
| Costs blow up | Token budget per task in config, SAMA optimises cost, hard ceiling stops the run |

## 6b. Decisions resolved this session

`PROJECT_CONTEXT.md` § 8 的 5 个开放问题全部收敛（见 § 1）。Provider 策略已定为 **协议适配，不绑厂商**：唯一适配器 `OpenAICompatibleProvider` 只认 OpenAI Chat Completions v1 协议；用户在 config/env 里挂任意多个 endpoint。本机 `.env` 已从 AC_FS32 / IntelliGen 接入了三个 endpoint 实例（UniAPI / OpenRouter / DeepSeek）作为开发期默认配置，但**代码里不出现这三个名字**。模板见 `.env.example`。

**Endpoint 配置入口**：用户首选路径是 **TUI 内 `Settings → Endpoints` 面板**（见 `m2-tui-provider-panel`），写入 `~/.folio/config.yml` + OS keyring。`.env` 仅用于开发期/CI 注入，对最终用户隐藏；两条来源在 TUI 内并存但区分显示。

## 7. Definition of Done (project-level)

Folio is "done" (v1.0) when:

- `pipx install folio` works on Win/macOS/Linux.
- A new user can go from `folio init` to a verified IEEE-format PDF in
  under 10 minutes for a topic in their domain.
- Every claim in a generated paper traces back to a verifiable source.
- Test suite ≥ 80% coverage on `app/core/`, ≥ 60% overall.
- Docs cover: install, quickstart, configuration, all 8 stages, MCP
  integration, troubleshooting.

---

## 8. Hand-off note for the next Copilot session

The user will start a fresh Copilot session inside this directory.
On first turn:

1. Read `README.md`, `PROJECT_CONTEXT.md`, `AGENTS.md`, `plan.md`
   (in that order).
2. Insert M0 todos (§ 3) into the SQL `todos` table.
3. Confirm with the user: "Start M0 with `m0-pyproject`?" — then go.
4. After M0 closes, refine M1 todos (§ 4) with the user before coding.
