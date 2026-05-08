# SPDX-License-Identifier: MPL-2.0
# ruff: noqa: RUF001
"""Copilot-style "save outputs to..." modal shown after a run completes.

Lets the user copy the generated ``paper.tex`` and ``paper.pdf`` (and
the ``refs.bib`` companion when present) out of the run directory in
``~/.folio/runs/<run_id>/`` to a destination of their choice — typical
target is the project they're writing in.

Returns the chosen destination directory via ``dismiss(Path)``, or
``None`` when the user skips. The actual file copy lives in
:meth:`progress.ProgressApp._save_outputs` so this widget stays
side-effect-free and easy to test.
"""

from __future__ import annotations

from pathlib import Path
from typing import ClassVar

from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.screen import ModalScreen
from textual.widgets import Button, Input, Label, Static


class SaveModal(ModalScreen[Path | None]):
    """Ask the user where to copy the run's exported files.

    The form has:
    - source dir line (read-only, dim) so they know what's being copied
    - destination input prefilled with the suggested path (Enter to
      confirm)
    - [保存] / [跳过] buttons; Esc also skips
    """

    DEFAULT_CSS = """
    SaveModal {
        align: center middle;
    }
    SaveModal > Vertical {
        width: 78;
        max-width: 90%;
        height: auto;
        padding: 1 2;
        background: $surface;
        border: thick $primary 60%;
    }
    SaveModal #title {
        color: $accent;
        text-style: bold;
    }
    SaveModal #source {
        color: $text-muted;
    }
    SaveModal #files {
        color: $text-muted;
        margin-bottom: 1;
    }
    SaveModal Input {
        margin-bottom: 1;
    }
    SaveModal Horizontal {
        height: 3;
        align: right middle;
    }
    SaveModal Button {
        margin-left: 1;
    }
    SaveModal #footer {
        color: $text-muted;
        margin-top: 1;
    }
    """

    BINDINGS: ClassVar = [
        Binding("escape", "skip", "Skip", show=False),
        Binding("ctrl+s", "confirm", "Save", show=False),
    ]

    def __init__(
        self,
        *,
        source_dir: Path,
        suggested_dest: Path,
        files: list[str],
    ) -> None:
        super().__init__()
        self._source = source_dir
        self._suggested = suggested_dest
        self._files = files

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Static("📦  保存论文产物到…", id="title")
            yield Static(f"来源：{self._source}", id="source")
            yield Static(
                "包含：" + (", ".join(self._files) if self._files else "(无)"),
                id="files",
            )
            yield Label("目标目录（Enter 确认，Esc 跳过）：")
            yield Input(value=str(self._suggested), id="dest")
            with Horizontal():
                yield Button("跳过", id="skip", variant="default")
                yield Button("保存", id="save", variant="primary")
            yield Static(
                "[dim]Tab 切焦点 · Enter / Ctrl+S 保存 · Esc 跳过[/]", id="footer"
            )

    def on_mount(self) -> None:
        self.query_one("#dest", Input).focus()

    # -- handlers -------------------------------------------------------

    def on_input_submitted(self, event: Input.Submitted) -> None:
        if event.input.id == "dest":
            self.action_confirm()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "save":
            self.action_confirm()
        elif event.button.id == "skip":
            self.action_skip()

    def action_confirm(self) -> None:
        raw = self.query_one("#dest", Input).value.strip()
        if not raw:
            self.action_skip()
            return
        try:
            dest = Path(raw).expanduser().resolve()
        except (OSError, RuntimeError):
            # Bad path — keep the modal open so the user can fix it.
            return
        self.dismiss(dest)

    def action_skip(self) -> None:
        self.dismiss(None)
