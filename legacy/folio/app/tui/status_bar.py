# SPDX-License-Identifier: MPL-2.0
"""Bottom HUD: current stage, tokens, cost, elapsed."""

from __future__ import annotations

import time

from textual.reactive import reactive
from textual.widgets import Static

from app.observability.pricing import accumulate, estimate
from app.observability.trace import read_for_run


class StatusBar(Static):
    DEFAULT_CSS = """
    StatusBar {
        dock: bottom;
        height: 1;
        background: $surface-darken-1;
        color: $text;
        padding: 0 2;
    }
    """

    stage: reactive[str] = reactive("idle")

    def __init__(self) -> None:
        super().__init__()
        self._run_id: str | None = None
        self._start: float = time.monotonic()

    def on_mount(self) -> None:
        self._refresh()
        self.set_interval(1.0, self._refresh)

    def reset(self, run_id: str | None = None) -> None:
        self._run_id = run_id
        self._start = time.monotonic()
        self._refresh()

    def watch_stage(self, _old: str, _new: str) -> None:
        self._refresh()

    def _refresh(self) -> None:
        elapsed = time.monotonic() - self._start
        if self._run_id is None:
            cost = "$0.0000"
            tok = "0 tok"
        else:
            events = read_for_run(self._run_id)
            ests = [
                estimate(
                    model=ev.model,
                    prompt_tokens=ev.prompt_tokens,
                    completion_tokens=ev.completion_tokens,
                )
                for ev in events
            ]
            total = accumulate(ests) if ests else None
            if total is None:
                cost = "$0.0000"
                tok = "0 tok"
            else:
                cost = f"${total.usd:.4f} (¥{total.cny:.3f})"
                tok = f"{total.total_tokens:,} tok"
        sep = "[dim] · [/]"
        self.update(
            f"[bold cyan]●[/] [bold]{self.stage}[/]"
            f"{sep}[dim]tokens[/] {tok}"
            f"{sep}[dim]cost[/] {cost}"
            f"{sep}[dim]elapsed[/] {elapsed:5.1f}s"
        )
