# SPDX-License-Identifier: MPL-2.0
# ruff: noqa: RUF001
"""Copilot/codex-style clarify modal.

A `ModalScreen` that asks **one** clarify question with:

- A title row showing the field name and Chinese question text.
- An optional dim description line.
- An `OptionList` for choices (arrow keys to navigate, Enter to confirm).
- An `Input` field for free-text / "其他" answers when ``allow_other`` is
  set. Tab toggles focus between the option list and the input.
- A footer with key hints.

Returns the resolved string answer via `dismiss(result)`. Returns an
empty string if the user pressed Esc (skip → use default).
"""

from __future__ import annotations

from typing import Any, ClassVar

from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual.widgets import Input, Label, OptionList, Static
from textual.widgets.option_list import Option


class ClarifyModal(ModalScreen[str]):
    """One-shot question modal. Resolves to the answer string."""

    DEFAULT_CSS = """
    ClarifyModal {
        align: center middle;
    }

    ClarifyModal > Vertical {
        width: 72;
        max-width: 90%;
        height: auto;
        max-height: 80%;
        padding: 1 2;
        background: $surface;
        border: thick $primary 60%;
    }

    ClarifyModal #title {
        color: $accent;
        text-style: bold;
        padding-bottom: 0;
    }

    ClarifyModal #question {
        text-style: bold;
        padding-bottom: 1;
    }

    ClarifyModal #description {
        color: $text-muted;
        text-style: italic;
        padding-bottom: 1;
    }

    ClarifyModal OptionList {
        height: auto;
        max-height: 14;
        background: $surface;
        border: tall $primary 30%;
        padding: 0 1;
    }

    ClarifyModal #other-label {
        color: $text-muted;
        padding-top: 1;
    }

    ClarifyModal Input {
        border: tall $accent 40%;
    }

    ClarifyModal Input:focus {
        border: tall $accent;
    }

    ClarifyModal #hints {
        color: $text-muted;
        padding-top: 1;
        text-align: center;
    }
    """

    BINDINGS: ClassVar = [
        Binding("escape", "skip", "跳过", show=True),
        Binding("tab", "toggle_focus", "切换", show=True),
        Binding("shift+tab", "toggle_focus", "切换", show=False),
    ]

    def __init__(self, pending: dict[str, Any]) -> None:
        super().__init__()
        self._field = str(pending.get("field", "?"))
        self._question = str(pending.get("question", ""))
        self._description = str(pending.get("description") or "")
        self._options: list[dict[str, Any]] = list(pending.get("options") or [])
        self._allow_other = bool(pending.get("allow_other", True))

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label(f"问题 · {self._field}", id="title")
            yield Label(self._question, id="question")
            if self._description:
                yield Static(self._description, id="description")
            if self._options:
                opts: list[Option] = []
                for o in self._options:
                    label = str(o.get("label") or o.get("value") or "")
                    desc = str(o.get("description") or "")
                    text = f"[bold]{label}[/]"
                    if desc:
                        text += f"  [dim]— {desc}[/]"
                    opts.append(Option(text, id=str(o.get("value") or label)))
                yield OptionList(*opts, id="options")
            if self._allow_other:
                yield Label("其他（自定义答案，回车提交）", id="other-label")
                yield Input(
                    placeholder="› 输入自定义值，留空回车 = 跳过用默认",
                    id="other-input",
                )
            hint_parts = []
            if self._options:
                hint_parts.append("[b]↑↓[/] 选择")
                hint_parts.append("[b]Enter[/] 确认")
            if self._allow_other and self._options:
                hint_parts.append("[b]Tab[/] 切到输入")
            elif self._allow_other:
                hint_parts.append("[b]Enter[/] 提交")
            hint_parts.append("[b]Esc[/] 跳过")
            yield Static(" · ".join(hint_parts), id="hints")

    def on_mount(self) -> None:
        if self._options:
            self.query_one(OptionList).focus()
        elif self._allow_other:
            self.query_one("#other-input", Input).focus()

    def action_skip(self) -> None:
        self.dismiss("")

    def action_toggle_focus(self) -> None:
        if not (self._allow_other and self._options):
            return
        focused = self.focused
        if isinstance(focused, OptionList):
            self.query_one("#other-input", Input).focus()
        else:
            self.query_one(OptionList).focus()

    def on_option_list_option_selected(self, event: OptionList.OptionSelected) -> None:
        value = event.option.id or ""
        self.dismiss(value)

    def on_input_submitted(self, event: Input.Submitted) -> None:
        self.dismiss(event.value.strip())
