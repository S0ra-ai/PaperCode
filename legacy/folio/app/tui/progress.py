# SPDX-License-Identifier: MPL-2.0
# ruff: noqa: RUF001
"""TUI progress panel — listens to orchestrator `StageEvent`s.

Designed to satisfy AGENTS.md § 1.1: the TUI only **renders** events
and forwards user input. Free-form prompt classification happens in
``app.core.stages.intent`` (an LLM call); the TUI calls that stage
and routes on its result. No business decisions live here.

Launch behaviour:
- Bare ``folio`` → opens directly into a chat-style prompt.
- ``:pdf <path> [topic...]`` → start ``format_to_paper`` pipeline.
- ``:survey <domain>`` → start ``survey`` pipeline.
- ``:resume [<uuid_prefix>]`` → list runs / continue from checkpoint.
- ``:endpoints`` / Ctrl+E → open the Endpoints settings screen.
- ``:quit`` / Ctrl+C → exit.
- Any other free-form text → routed via the ``intent`` stage.

Per AGENTS.md § 1.1, every LLM call (including the ``intent`` stage) is
issued from ``app/core/`` — the TUI only invokes the stage function and
switches on the typed result.
"""

from __future__ import annotations

import shlex
from pathlib import Path
from typing import ClassVar

from textual.app import App, ComposeResult
from textual.binding import BindingType
from textual.containers import Horizontal, Vertical
from textual.suggester import SuggestFromList
from textual.widgets import Footer, Header, Input, RichLog

from app.config.loader import load
from app.config.survey import load as load_survey_config
from app.core.contract import StageMessage
from app.core.formats import cache as format_cache
from app.core.orchestrator import StageEvent, run_sequential, run_survey
from app.core.stages import clarify
from app.core.stages import intent as intent_stage
from app.core.stages import refine as refine_stage
from app.persistence import snapshots
from app.persistence.snapshot_runner import snapshotted
from app.persistence.transcript import Transcript
from app.providers import build_registry
from app.tui.clarify_modal import ClarifyModal
from app.tui.commands import COMMANDS, complete, help_text
from app.tui.history import HistoryStack
from app.tui.save_modal import SaveModal
from app.tui.status_bar import StatusBar
from app.tui.task_panel import FORMAT_STAGES, SURVEY_STAGES, TaskPanel

_STYLE_TO_BUILTIN: dict[str, str] = {
    "ieee": "IEEE",
    "acm": "ACM",
    "cjc": "CJC",
    "springer-lncs": "Springer-LNCS",
    "springer": "Springer-LNCS",
    "lncs": "Springer-LNCS",
    "nature": "Nature",
}


def _resolve_builtin_spec(
    intent_payload: dict, clarify_payload: dict
) -> tuple[str, dict] | None:
    """Map intent.venue / clarify.style → builtin (label, format_spec dict).

    Returns ``None`` if no match (caller should ask for a sample PDF).
    """
    candidates: list[str] = []
    venue = (intent_payload.get("venue") or "").strip().lower()
    style = (clarify_payload.get("style") or "").strip().lower()
    for raw in (style, venue):
        if not raw:
            continue
        for key, label in _STYLE_TO_BUILTIN.items():
            if key in raw:
                candidates.append(label)
                break
    for label in candidates:
        hit = format_cache.get(venue_label=label)
        if hit is not None:
            spec, _tier = hit
            return label, spec.model_dump(mode="json")
    return None


class FolioApp(App[None]):
    CSS = """
    Screen {
        layout: vertical;
        background: $surface;
    }
    Header {
        background: $surface-darken-1;
        color: $text;
    }
    #main {
        height: 1fr;
        padding: 1 1 0 1;
    }
    #chat {
        height: 1fr;
        border: tall $primary 30%;
        background: $surface;
        padding: 0 1;
        scrollbar-size: 1 1;
    }
    #chat:focus {
        border: tall $primary;
    }
    TaskPanel {
        height: 1fr;
        margin-left: 1;
    }
    Input {
        dock: bottom;
        margin: 0 1 0 1;
        border: tall $accent 40%;
        background: $surface;
    }
    Input:focus {
        border: tall $accent;
    }
    Footer {
        background: $surface-darken-1;
    }
    """

    BINDINGS: ClassVar[list[BindingType]] = [
        ("ctrl+c", "abort_or_quit", "Abort/Quit"),
        ("ctrl+e", "endpoints", "Endpoints"),
        ("question_mark", "help", "Help"),
    ]

    def __init__(
        self,
        *,
        pdf_path: Path | None = None,
        survey_domain: str | None = None,
        survey_keywords: tuple[str, ...] = (),
        survey_words: int = 18000,
        survey_author: str = "Anonymous",
        survey_output_dir: Path | None = None,
        resume_run_id: str | None = None,
    ) -> None:
        super().__init__()
        self._pdf_path = pdf_path
        self._survey_domain = survey_domain
        self._survey_keywords = survey_keywords
        self._survey_words = survey_words
        self._survey_author = survey_author
        self._survey_output_dir = survey_output_dir
        self._resume_run_id = resume_run_id
        self._msg = StageMessage()
        self._stage = "idle"
        self._busy = False
        self._pending_answer: tuple[str, str] | None = None
        self._history = HistoryStack()
        self._transcript: Transcript | None = None
        self._current_worker = None  # type: ignore[var-annotated]

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with Vertical(id="main"), Horizontal():
            self.log_view = RichLog(highlight=True, markup=True, id="chat")
            yield self.log_view
            self.task_panel = TaskPanel()
            yield self.task_panel
        self.status_bar = StatusBar()
        yield self.status_bar
        yield Input(
            placeholder="› 描述你的论文 / :pdf · :survey · :resume · :help · :quit",
            suggester=SuggestFromList(
                [f":{c.name}" for c in COMMANDS], case_sensitive=False
            ),
        )
        yield Footer()

    def on_mount(self) -> None:
        self.title = "Folio"
        self.sub_title = "ready"
        self._render_welcome()

        # Onboarding: zero endpoints → guide the user, do NOT die.
        config = load()
        registry = build_registry(config)
        if len(registry) == 0:
            self.log_view.write("")
            self.log_view.write(
                "[yellow]⚠  还没有配置任何 LLM 端点。[/]\n"
                "  • 退出后运行 [b cyan]folio init[/] 进入向导，或\n"
                "  • 按 [b cyan]Ctrl+E[/] / 输入 [b cyan]:endpoints[/] 现在打开设置面板。"
            )
            self.log_view.write("[dim]配置好端点后再开始对话。[/]")
            return

        if self._resume_run_id is not None:
            self.run_worker(self._resume_pipeline(self._resume_run_id), exclusive=True)
            return
        if self._survey_domain is not None:
            self.sub_title = f"survey: {self._survey_domain}"
            self.log_view.write(f"[dim]Survey domain:[/] [b]{self._survey_domain}[/]")
            self._start_survey_from_args()
            return
        if self._pdf_path is not None:
            self.sub_title = "format_to_paper"
            self.log_view.write(f"[dim]Sample PDF:[/] [b]{self._pdf_path}[/]")
            self.run_worker(self._clarify_then_pipeline(), exclusive=True)
            return

    def _render_welcome(self) -> None:
        """opencode-style centered banner + subtle hints."""
        banner = (
            "[bold cyan]"
            "  ███████╗ ██████╗ ██╗     ██╗ ██████╗ \n"
            "  ██╔════╝██╔═══██╗██║     ██║██╔═══██╗\n"
            "  █████╗  ██║   ██║██║     ██║██║   ██║\n"
            "  ██╔══╝  ██║   ██║██║     ██║██║   ██║\n"
            "  ██║     ╚██████╔╝███████╗██║╚██████╔╝\n"
            "  ╚═╝      ╚═════╝ ╚══════╝╚═╝ ╚═════╝ "
            "[/]"
        )
        self.log_view.write("")
        self.log_view.write(banner)
        self.log_view.write(
            "[dim italic]            TUI-native academic paper generator[/]"
        )
        self.log_view.write("")
        self.log_view.write(
            "  [bold green]›[/] 告诉我要写什么，"
            "例如 [i cyan]'帮我写一篇大语言模型综述，8000 字，IEEE 格式'[/]"
        )
        self.log_view.write(
            "  [bold green]›[/] 输入 [b cyan]:help[/] 或 [b cyan]?[/] 查看命令与键位"
        )
        self.log_view.write(
            "  [bold green]›[/] [b cyan]:pdf <文件>[/] 用样张启动 · "
            "[b cyan]:survey <领域>[/] 综述 · "
            "[b cyan]:resume[/] 续跑"
        )
        self.log_view.write("")

    # ------------------------------------------------------------------ input

    def on_input_submitted(self, event: Input.Submitted) -> None:
        value = event.value.strip()
        event.input.value = ""
        if not value:
            return

        # Persist non-answer input to history.
        self._history.add(value)
        if self._transcript is not None:
            self._transcript.user(value)

        if value.startswith(":"):
            self._handle_command(value)
            return

        if self._busy:
            self.log_view.write("[dim](busy — wait for current stage to finish)[/]")
            return

        self.log_view.write(f"[blue]→[/] {value}")
        # Post-run refinement: if the pipeline already finished and we
        # have a draft, treat free text as a refine instruction.
        if self._msg.payload.get("draft") and self._msg.payload.get("exports"):
            self.run_worker(self._refine(value), exclusive=True)
            return
        self.run_worker(self._intent_route(value), exclusive=True)

    def on_key(self, event) -> None:
        # ↑ / ↓ recall input history when the input is focused.
        if not isinstance(self.focused, Input):
            return
        inp: Input = self.focused  # type: ignore[assignment]
        if event.key == "up":
            new = self._history.up(inp.value)
            if new is not None:
                inp.value = new
                inp.cursor_position = len(new)
                event.stop()
        elif event.key == "down":
            new = self._history.down(inp.value)
            if new is not None:
                inp.value = new
                inp.cursor_position = len(new)
                event.stop()

    def _handle_command(self, line: str) -> None:
        try:
            parts = shlex.split(line[1:])
        except ValueError as exc:
            self.log_view.write(f"[red]bad command:[/] {exc}")
            return
        if not parts:
            return
        cmd, rest = parts[0], parts[1:]

        if cmd == "quit":
            self.exit()
            return
        if cmd == "help":
            self.action_help()
            return
        if cmd == "endpoints":
            self.action_endpoints()
            return
        if cmd == "abort":
            self._do_abort()
            return
        if cmd == "open":
            self._open_section(rest)
            return
        if cmd == "refine":
            instruction = " ".join(rest).strip()
            if not instruction:
                self.log_view.write("[red]usage:[/] :refine <instruction>")
                return
            if not self._msg.payload.get("draft"):
                self.log_view.write(
                    "[red]nothing to refine yet — finish a run first.[/]"
                )
                return
            self.run_worker(self._refine(instruction), exclusive=True)
            return
        if cmd == "pdf":
            if not rest:
                self.log_view.write("[red]usage:[/] :pdf <path> [topic...]")
                return
            self._pdf_path = Path(rest[0]).expanduser()
            if len(rest) > 1:
                topic = " ".join(rest[1:])
                self._msg.payload.setdefault("clarify", {})["topic"] = topic
            self.log_view.write(f"[cyan]format_to_paper[/] PDF={self._pdf_path}")
            self.run_worker(self._clarify_then_pipeline(), exclusive=True)
            return
        if cmd == "survey":
            if not rest:
                self.log_view.write("[red]usage:[/] :survey <domain>")
                return
            self._survey_domain = " ".join(rest)
            self.log_view.write(f"[cyan]survey[/] domain={self._survey_domain}")
            self._start_survey_from_args()
            return
        if cmd == "resume":
            self._handle_resume(rest)
            return
        if cmd == "retry":
            self._handle_retry()
            return

        # Suggest near-matches using the command catalogue.
        candidates = complete(line.split()[0])
        suggestion = f" — try {candidates[0]}" if candidates else ""
        self.log_view.write(f"[red]unknown command:[/] :{cmd}{suggestion}")

    def _open_section(self, rest: list[str]) -> None:
        if not rest:
            self.log_view.write("[red]usage:[/] :open <section>")
            return
        needle = " ".join(rest).lower()
        draft = str(self._msg.payload.get("draft") or "")
        if not draft:
            self.log_view.write("[dim](no draft loaded)[/]")
            return
        # naive section split on '\section{' / '## ' / lines starting with '#'.
        lines = draft.splitlines()
        hits: list[tuple[int, str]] = []
        for i, line in enumerate(lines):
            if needle in line.lower() and (
                line.lstrip().startswith("\\section") or line.lstrip().startswith("#")
            ):
                hits.append((i, line))
        if not hits:
            self.log_view.write(f"[yellow]no section matches[/] {needle!r}")
            return
        i = hits[0][0]
        end = min(len(lines), i + 25)
        self.log_view.write(f"[bold]section preview[/] (lines {i}–{end}):")
        for line in lines[i:end]:
            self.log_view.write(f"  {line}")

    def _handle_resume(self, rest: list[str]) -> None:
        if not rest:
            rows = snapshots.list_runs(limit=10)
            if not rows:
                self.log_view.write("[dim](no runs found)[/]")
                return
            self.log_view.write("[bold]recent runs[/] (use [b]:resume <prefix>[/]):")
            for r in rows:
                when = r.last_at.strftime("%Y-%m-%d %H:%M")
                self.log_view.write(
                    f"  [cyan]{r.run_id[:8]}[/]  {r.kind:<16} "
                    f"last={r.last_stage:<14} {r.status:<11} {when}  "
                    f"{r.topic[:40]}"
                )
            return
        prefix = rest[0]
        matches = snapshots.find_by_prefix(prefix)
        if not matches:
            self.log_view.write(f"[red]no run matches[/] {prefix!r}")
            return
        if len(matches) > 1:
            self.log_view.write(
                f"[yellow]ambiguous prefix[/] {prefix!r} ({len(matches)} matches)"
            )
            return
        self.run_worker(self._resume_pipeline(matches[0].run_id), exclusive=True)

    def _handle_retry(self) -> None:
        """Re-run the pipeline starting after the last successfully-completed stage.

        Differs from ``:resume`` in that it operates on the *current* in-memory
        run (no snapshot lookup needed). Useful when a stage failed despite the
        orchestrator's built-in retry+repair (e.g. user wants another attempt
        after fixing a network issue).
        """
        if self._busy:
            self.log_view.write("[yellow]still running — wait or :abort first.[/]")
            return
        rows = self.task_panel.snapshot()
        last_done = None
        for r in rows:
            if r.status == "done":
                last_done = r.name
            elif r.status in {"failed", "running"}:
                break
        if self._pdf_path is None and last_done is None:
            self.log_view.write("[red]nothing to retry — no prior stage completed.[/]")
            return
        self.log_view.write(
            f"[yellow]🔁 retrying[/] from after [b]{last_done or '(start)'}[/]…"
        )
        self.run_worker(
            self._clarify_then_pipeline(start_after=last_done), exclusive=True
        )

    # ------------------------------------------------------------------ flows

    def _registry_or_warn(self):
        config = load()
        registry = build_registry(config)
        if len(registry) == 0:
            self.log_view.write(
                "[red]No LLM endpoint configured.[/] "
                "Run [b]folio init[/] (or use Ctrl+E) and try again."
            )
            return None
        return registry

    async def _intent_route(self, raw_text: str) -> None:
        self._busy = True
        try:
            registry = self._registry_or_warn()
            if registry is None:
                return
            self.log_view.write("[dim]classifying intent…[/]")
            try:
                self._msg = await intent_stage.run(
                    self._msg, raw_text=raw_text, registry=registry
                )
            except Exception as exc:
                self.log_view.write(f"[red]intent failed:[/] {exc!r}")
                return
            intent = self._msg.payload.get("intent", {})
            kind = intent.get("intent", "chat")
            self.log_view.write(
                f"[green]intent[/] = {kind}  "
                f"topic={intent.get('topic', '')!r:<40} "
                f"venue={intent.get('venue', '') or '-'}  "
                f"words={intent.get('length_words', 0)}"
            )
            if kind == "survey":
                self._survey_domain = intent.get("topic") or raw_text
                self._survey_words = intent.get("length_words") or self._survey_words
                self._start_survey_from_args()
                return

            # `format_to_paper` and `chat` both end up as a paper-writing pipeline.
            # Copilot-style: never silently default. If the user gave us a PDF,
            # use it. Otherwise let `clarify` ask conversationally for venue,
            # length, language, etc., and resolve the format spec once they
            # have answered.
            pdf_str = intent.get("pdf_path") or ""
            if pdf_str:
                self._pdf_path = Path(pdf_str).expanduser()
                self.log_view.write(f"[cyan]paper[/] using sample PDF {self._pdf_path}")
                self.run_worker(self._clarify_then_pipeline(), exclusive=True)
                return

            # Seed topic from the user's free-form prompt so the clarify loop
            # doesn't ask for it again — but leave venue/length/language open
            # if the intent stage didn't pick them up, so clarify will ask.
            seeded = self._msg.model_copy(deep=True)
            sc = dict(seeded.payload.get("clarify") or {})
            if not sc.get("topic"):
                sc["topic"] = raw_text.strip()[:200] or "untitled"
            seeded.payload["clarify"] = sc
            self._msg = seeded
            self._pdf_path = None
            self.log_view.write(
                "[cyan]paper[/] gathering details — I'll ask for anything I still need."
            )
            self.run_worker(
                self._clarify_then_resolve_format(),
                exclusive=True,
            )
        finally:
            self._busy = False

    def _start_survey_from_args(self) -> None:
        assert self._survey_domain is not None
        seed = StageMessage(
            payload={
                "domain_inputs": {
                    "domain": self._survey_domain,
                    "keywords": self._survey_keywords,
                    "time_window": None,
                    "language": (
                        self._msg.payload.get("intent", {}).get("language") or "en"
                    ),
                    "length_words": self._survey_words,
                    "author": self._survey_author,
                    "ieee_variant": "journal",
                }
            }
        )
        self._msg = seed
        self.run_worker(self._survey_pipeline(), exclusive=True)

    async def _clarify_then_pipeline(self, *, start_after: str | None = None) -> None:
        self._busy = True
        try:
            await self._run_clarify_loop()
            await self._pipeline(start_after=start_after)
        finally:
            self._busy = False

    async def _clarify_then_resolve_format(self) -> None:
        """Clarify first, then map the user's venue answer to a builtin spec.

        If the venue isn't a builtin, ask one more conversational question:
        sample-PDF path. The pipeline then runs with that PDF (full format
        stage) or with the seeded builtin (format stage skipped).
        """
        self._busy = True
        try:
            await self._run_clarify_loop()
            clarify_data = self._msg.payload.get("clarify") or {}
            venue = str(clarify_data.get("venue") or "").strip()
            style = str(clarify_data.get("style") or "").strip()
            builtin = _resolve_builtin_spec(
                {"venue": venue}, {"style": style or venue.lower()}
            )
            if builtin is not None:
                label, spec_dict = builtin
                new = self._msg.model_copy(deep=True)
                new.payload["format_spec"] = spec_dict
                sc = dict(new.payload.get("clarify") or {})
                sc.setdefault("style", label.lower())
                new.payload["clarify"] = sc
                self._msg = new
                self.log_view.write(
                    f"[green]matched venue[/] '{venue or label}' → "
                    f"using builtin [b]{label}[/] format."
                )
                await self._pipeline(start_after="format")
                return

            # Unknown venue — Copilot-style follow-up modal.
            self.log_view.write(
                f"[yellow]我没有内置 '{venue}' 的格式。[/] "
                "请选择一个内置 venue，或在「其他」里粘贴示例 PDF 路径。"
            )
            response = (
                await self.push_screen_wait(
                    ClarifyModal(
                        {
                            "field": "format",
                            "question": "PDF 路径或内置 venue？",
                            "description": (
                                "选择一个内置样式，或在下方输入框中粘贴示例 PDF 路径"
                            ),
                            "options": [
                                {
                                    "value": "ieee",
                                    "label": "IEEE",
                                    "description": "工科顶刊 / 会议通用",
                                },
                                {
                                    "value": "acm",
                                    "label": "ACM acmart",
                                    "description": "SIG / TOG / TOSEM",
                                },
                                {
                                    "value": "cjc",
                                    "label": "CJC（计算机学报）",
                                    "description": "中文期刊样式",
                                },
                                {
                                    "value": "springer-lncs",
                                    "label": "Springer LNCS",
                                    "description": "ECCV / CAV 等",
                                },
                                {
                                    "value": "nature",
                                    "label": "Nature",
                                    "description": "Nature/Science 风格",
                                },
                            ],
                            "allow_other": True,
                        }
                    )
                )
            ) or ""
            response = response.strip()
            if not response:
                self.log_view.write("[red]no answer — aborting.[/]")
                return
            # Builtin name?
            retry = _resolve_builtin_spec({"venue": response}, {"style": response})
            if retry is not None:
                label, spec_dict = retry
                new = self._msg.model_copy(deep=True)
                new.payload["format_spec"] = spec_dict
                sc = dict(new.payload.get("clarify") or {})
                sc["venue"] = label
                sc["style"] = label.lower()
                new.payload["clarify"] = sc
                self._msg = new
                self.log_view.write(f"[green]using builtin[/] {label}.")
                await self._pipeline(start_after="format")
                return
            # Treat as PDF path.
            pdf = Path(response).expanduser()
            if not pdf.is_file():
                self.log_view.write(
                    f"[red]not a file:[/] {pdf} — aborting. "
                    "Try again with a valid PDF path or builtin venue."
                )
                return
            self._pdf_path = pdf
            self.log_view.write(f"[green]extracting format from[/] {pdf}")
            await self._pipeline(start_after=None)
        finally:
            self._busy = False

    async def _run_clarify_loop(self) -> None:
        registry = self._registry_or_warn()
        while True:
            self._msg = await clarify.run(
                self._msg, answer=self._pending_answer, registry=registry
            )
            self._pending_answer = None
            if self._msg.payload.get("clarify_status") == "complete":
                self.log_view.write("[green]澄清完成。[/]")
                break
            pending = self._msg.payload["clarify_pending"]
            field = str(pending.get("field", "?"))
            question = str(pending.get("question", ""))
            # Echo to chat log so transcript shows context, then pop modal.
            self.log_view.write(f"[bold yellow]?[/] [b]{field}[/] — {question}")
            if self._transcript is not None:
                self._transcript.question(
                    field, question, list(pending.get("options") or [])
                )
            answer = await self.push_screen_wait(ClarifyModal(pending))
            shown = answer if answer else "(默认)"
            self.log_view.write(f"  [blue]→[/] {shown}")
            if self._transcript is not None:
                self._transcript.user(answer or "(默认)")
            if not field.startswith("__"):
                self._pending_answer = (field, answer)
            else:
                self._pending_answer = (field, answer)

    async def _pipeline(self, *, start_after: str | None = None) -> None:
        registry = self._registry_or_warn()
        if registry is None:
            return
        if start_after is None:
            assert self._pdf_path is not None
        topic = self._msg.payload.get("clarify", {}).get("topic", "")
        self.task_panel.set_stages(FORMAT_STAGES)
        self.status_bar.reset(self._msg.run_id or None)
        self._transcript = Transcript(self._msg.run_id)
        try:
            stream = run_sequential(
                self._msg,
                pdf_path=self._pdf_path,
                registry=registry,
                start_after=start_after,
            )
            async for msg, event in snapshotted(
                stream, kind="format_to_paper", topic=topic
            ):
                self._msg = msg
                self._render_event(event)
        except Exception as exc:
            self.log_view.write(f"[red bold]pipeline failed:[/] {exc!r}")
            if self._transcript is not None:
                self._transcript.footer("failed", repr(exc))
            return
        exports = self._msg.payload.get("exports", {})
        self.log_view.write(
            f"[bold green]done[/] — outputs in {exports.get('dir', '?')}  "
            f"(run id [cyan]{self._msg.run_id[:8]}[/])"
        )
        self.log_view.write(
            "[dim]输入自由文本可继续修改（refine），或 :open <章节> 预览。[/]"
        )
        if self._transcript is not None:
            self._transcript.footer("completed", f"outputs: {exports.get('dir', '?')}")
        await self._offer_save(exports)

    async def _survey_pipeline(self) -> None:
        self._busy = True
        try:
            registry = self._registry_or_warn()
            if registry is None:
                return
            assert self._survey_domain is not None
            self.task_panel.set_stages(SURVEY_STAGES)
            self.status_bar.reset(self._msg.run_id or None)
            self._transcript = Transcript(self._msg.run_id)
            try:
                stream = run_survey(
                    self._msg,
                    registry=registry,
                    config=load_survey_config(),
                    output_dir=self._survey_output_dir,
                )
                async for upd, event in snapshotted(
                    stream, kind="survey", topic=self._survey_domain
                ):
                    self._msg = upd
                    self._render_event(event)
            except Exception as exc:
                self.log_view.write(f"[red bold]survey failed:[/] {exc!r}")
                if self._transcript is not None:
                    self._transcript.footer("failed", repr(exc))
                return
            exports = self._msg.payload.get("exports", {})
            self.log_view.write(
                f"[bold green]done[/] — outputs in {exports.get('dir', '?')}  "
                f"(run id [cyan]{self._msg.run_id[:8]}[/])"
            )
            if self._transcript is not None:
                self._transcript.footer(
                    "completed", f"outputs: {exports.get('dir', '?')}"
                )
            await self._offer_save(exports)
        finally:
            self._busy = False

    async def _resume_pipeline(self, run_id_or_prefix: str) -> None:
        self._busy = True
        try:
            matches = snapshots.find_by_prefix(run_id_or_prefix)
            if not matches:
                self.log_view.write(f"[red]no run matches[/] {run_id_or_prefix!r}")
                return
            if len(matches) > 1:
                self.log_view.write(f"[yellow]ambiguous prefix[/] {run_id_or_prefix!r}")
                return
            summary = matches[0]
            registry = self._registry_or_warn()
            if registry is None:
                return
            self._msg = snapshots.load_message(summary.run_id)
            self.task_panel.set_stages(
                FORMAT_STAGES if summary.kind == "format_to_paper" else SURVEY_STAGES
            )
            self.status_bar.reset(self._msg.run_id or None)
            self._transcript = Transcript(self._msg.run_id)
            self.log_view.write(
                f"[cyan]resuming[/] {summary.run_id[:8]} ({summary.kind}) — "
                f"continuing after [b]{summary.last_stage}[/]"
            )
            try:
                if summary.kind == "format_to_paper":
                    stream = run_sequential(
                        self._msg,
                        pdf_path=self._pdf_path,
                        registry=registry,
                        start_after=summary.last_stage,
                    )
                else:
                    stream = run_survey(
                        self._msg,
                        registry=registry,
                        config=load_survey_config(),
                        start_after=summary.last_stage,
                    )
                async for upd, event in snapshotted(
                    stream, kind=summary.kind, topic=summary.topic
                ):
                    self._msg = upd
                    self._render_event(event)
            except Exception as exc:
                self.log_view.write(f"[red bold]resume failed:[/] {exc!r}")
                return
            exports = self._msg.payload.get("exports", {})
            self.log_view.write(
                f"[bold green]done[/] — outputs in {exports.get('dir', '?')}"
            )
            await self._offer_save(exports)
        finally:
            self._busy = False

    # ------------------------------------------------------------------ save

    async def _offer_save(self, exports: dict) -> None:
        """Push a SaveModal so the user can copy outputs to a project dir.

        No-op when the run did not produce a directory or when running in
        a non-interactive test environment (no screen stack).
        """
        src_dir = exports.get("dir")
        if not src_dir:
            return
        source = Path(str(src_dir))
        if not source.exists():
            return
        files = [
            p.name
            for p in source.iterdir()
            if p.is_file() and p.suffix.lower() in {".tex", ".pdf", ".bib", ".docx"}
        ]
        if not files:
            return
        try:
            cwd = Path.cwd().resolve()
        except OSError:
            cwd = Path.home()
        suggested = cwd / f"folio-{self._msg.run_id[:8]}"
        try:
            dest: Path | None = await self.push_screen_wait(
                SaveModal(source_dir=source, suggested_dest=suggested, files=files)
            )
        except Exception as exc:  # screen stack not available in tests
            self.log_view.write(f"[dim](save modal unavailable: {exc})[/]")
            return
        if dest is None:
            self.log_view.write("[dim]已跳过保存。产物仍在原目录。[/]")
            return
        copied = await self._copy_outputs(source, dest, files)
        if copied:
            self.log_view.write(
                f"[bold green]✓ 已保存[/] {len(copied)} 个文件到 [cyan]{dest}[/]"
            )
            for name in copied:
                self.log_view.write(f"  • {name}")

    async def _copy_outputs(
        self, source: Path, dest: Path, files: list[str]
    ) -> list[str]:
        import shutil

        try:
            dest.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            self.log_view.write(f"[red]无法创建目录 {dest}: {exc}[/]")
            return []
        copied: list[str] = []
        for name in files:
            src = source / name
            if not src.is_file():
                continue
            try:
                shutil.copy2(src, dest / name)
                copied.append(name)
            except OSError as exc:
                self.log_view.write(f"[red]复制 {name} 失败:[/] {exc}")
        return copied

    # ------------------------------------------------------------------ misc

    def _render_event(self, event: StageEvent) -> None:
        colour = {
            "started": "cyan",
            "finished": "green",
            "failed": "red",
            "retrying": "yellow",
            "repairing": "magenta",
            "repaired": "green",
        }.get(event.status, "white")
        glyph = {
            "retrying": "🔁 ",
            "repairing": "🤖 ",
            "repaired": "✓ ",
        }.get(event.status, "")
        line = f"[{colour}]{glyph}{event.stage:<16}[/] {event.status}"
        if event.detail:
            line += f" — {event.detail}"
        self.log_view.write(line)

        # Mirror to TaskPanel + StatusBar + Transcript.
        panel_status = {
            "started": "running",
            "finished": "done",
            "failed": "failed",
            "retrying": "retrying",
            "repairing": "repairing",
            "repaired": "repaired",
        }.get(event.status, "pending")
        self.task_panel.mark(event.stage, panel_status, event.detail)
        if event.status == "started":
            self.status_bar.stage = event.stage
            # Bind status bar to current run for live token aggregation.
            self.status_bar.reset(self._msg.run_id) if self._msg.run_id else None
        if self._transcript is not None:
            self._transcript.stage(event.stage, event.status, event.detail)

    def _render_clarify_prompt(self, pending: dict) -> None:
        """Deprecated — kept for backward compat callers; now a no-op echo."""
        field = pending.get("field", "?")
        question = pending.get("question", "")
        self.log_view.write(f"[bold yellow]?[/] [b]{field}[/] — {question}")
        if self._transcript is not None:
            self._transcript.question(field, question, pending.get("options") or [])

    async def _refine(self, instruction: str) -> None:
        self._busy = True
        try:
            registry = self._registry_or_warn()
            if registry is None:
                return
            self.task_panel.mark("refine", "running")
            self.status_bar.stage = "refine"
            try:
                self._msg = await refine_stage.run(
                    self._msg, instruction=instruction, registry=registry
                )
            except Exception as exc:
                self.task_panel.mark("refine", "failed", str(exc)[:60])
                self.log_view.write(f"[red]refine failed:[/] {exc!r}")
                return
            self.task_panel.mark("refine", "done")
            self.log_view.write("[green]refine[/] done — draft updated.")
            if self._transcript is not None:
                self._transcript.assistant(f"refine applied: {instruction}")
            # Re-export so artifacts on disk reflect the new draft.
            try:
                from app.core.stages import export_latex

                self.task_panel.mark("export_latex", "running")
                self._msg = await export_latex.run(self._msg)
                self.task_panel.mark("export_latex", "done")
            except Exception as exc:
                self.task_panel.mark("export_latex", "failed", str(exc)[:60])
                self.log_view.write(f"[red]export_latex failed:[/] {exc!r}")
        finally:
            self._busy = False

    def _do_abort(self) -> None:
        if not self._busy:
            self.log_view.write("[dim](nothing to abort)[/]")
            return
        try:
            self.workers.cancel_all()
        except Exception as exc:
            self.log_view.write(f"[red]abort error:[/] {exc!r}")
            return
        self.log_view.write("[yellow]aborted current stage.[/]")
        self.task_panel.mark(self.status_bar.stage, "failed", "aborted")
        if self._transcript is not None:
            self._transcript.stage(self.status_bar.stage, "aborted")
        self._busy = False

    def action_abort_or_quit(self) -> None:
        if self._busy:
            self._do_abort()
        else:
            self.exit()

    def action_help(self) -> None:
        self.log_view.write(help_text())

    def action_endpoints(self) -> None:
        from app.tui.endpoints import EndpointsScreen

        self.push_screen(EndpointsScreen())


def main(
    *,
    pdf_path: Path | None = None,
    survey_domain: str | None = None,
    survey_keywords: tuple[str, ...] = (),
    survey_words: int = 18000,
    survey_author: str = "Anonymous",
    survey_output_dir: Path | None = None,
    resume_run_id: str | None = None,
) -> None:
    FolioApp(
        pdf_path=pdf_path,
        survey_domain=survey_domain,
        survey_keywords=survey_keywords,
        survey_words=survey_words,
        survey_author=survey_author,
        survey_output_dir=survey_output_dir,
        resume_run_id=resume_run_id,
    ).run()
