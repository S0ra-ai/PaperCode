# SPDX-License-Identifier: MPL-2.0
"""Minimal Textual app used as the M0 smoke target.

This is intentionally trivial: a title bar, a scrolling log pane, and an
input box. Per AGENTS.md § 1.1, the TUI never makes business decisions
or calls providers — later milestones will replace this with a real
orchestrator-driven view.
"""

from __future__ import annotations

from typing import ClassVar

from textual.app import App, ComposeResult
from textual.binding import BindingType
from textual.containers import Vertical
from textual.widgets import Footer, Header, Input, RichLog


class HelloFolioApp(App[None]):
    CSS = """
    Screen { layout: vertical; }
    RichLog { height: 1fr; border: round $primary; }
    Input { dock: bottom; }
    """

    BINDINGS: ClassVar[list[BindingType]] = [("ctrl+c", "quit", "Quit")]

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with Vertical():
            self.log_view = RichLog(highlight=True, markup=True)
            yield self.log_view
            yield Input(placeholder="hello-folio — type and press enter")
        yield Footer()

    def on_mount(self) -> None:
        self.title = "Folio"
        self.sub_title = "M0 hello"
        self.log_view.write("[bold green]hello-folio[/] — Folio TUI is alive.")
        self.log_view.write("Type anything below; Ctrl+C to quit.")

    def on_input_submitted(self, event: Input.Submitted) -> None:
        self.log_view.write(f"[cyan]you said:[/] {event.value}")
        event.input.value = ""
