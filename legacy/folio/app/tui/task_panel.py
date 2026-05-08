# SPDX-License-Identifier: MPL-2.0
"""Right-hand sidebar showing each pipeline stage's status.

Pure Textual widget; the TUI feeds it ``StageEvent``-shaped tuples and
the panel renders an at-a-glance list — opencode-style.

State machine per stage:

    pending  → '⏸'   (grey)
    running  → '▶'   (cyan, with running elapsed timer)
    done     → '✓'   (green, with final elapsed)
    failed   → '✗'   (red, with detail in tooltip-style line)
    skipped  → '↷'   (dim)

The widget is layout-only — no business logic beyond mapping events
to rows. It is reused both for ``format_to_paper`` and ``survey`` by
calling ``set_stages`` with the appropriate label sequence.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from textual.reactive import reactive
from textual.widgets import Static

FORMAT_STAGES: tuple[str, ...] = (
    "format",
    "clarify",
    "outline",
    "draft",
    "code",
    "experiment_write",
    "cite",
    "verify",
    "export_latex",
    "export_pdf",
    "export_docx",
)

SURVEY_STAGES: tuple[str, ...] = (
    "scope",
    "search",
    "fetch",
    "cluster",
    "outline",
    "draft",
    "cite",
    "verify",
    "export_latex",
    "export_pdf",
    "export_docx",
)


@dataclass
class StageRow:
    name: str
    status: str = "pending"  # pending|running|done|failed|skipped
    started_at: float | None = None
    finished_at: float | None = None
    detail: str = ""

    def elapsed(self) -> float:
        if self.started_at is None:
            return 0.0
        end = self.finished_at if self.finished_at is not None else time.monotonic()
        return max(0.0, end - self.started_at)


_STATUS_ICON: dict[str, str] = {
    "pending": "○",
    "running": "◉",
    "done": "●",
    "failed": "✕",
    "skipped": "◌",
    "retrying": "⟳",
    "repairing": "⚒",
    "repaired": "✓",
}

_STATUS_STYLE: dict[str, str] = {
    "pending": "dim",
    "running": "bold cyan",
    "done": "bold green",
    "failed": "bold red",
    "skipped": "dim yellow",
    "retrying": "bold yellow",
    "repairing": "bold magenta",
    "repaired": "bold green",
}


@dataclass
class _PanelState:
    rows: list[StageRow] = field(default_factory=list)


class TaskPanel(Static):
    """Sidebar widget."""

    DEFAULT_CSS = """
    TaskPanel {
        width: 30;
        min-width: 26;
        border: tall $secondary 30%;
        padding: 0 1;
        background: $surface;
        color: $text;
    }
    """

    title_text: reactive[str] = reactive("TASKS")

    def __init__(self, stages: tuple[str, ...] = FORMAT_STAGES) -> None:
        super().__init__()
        self._state = _PanelState(rows=[StageRow(s) for s in stages])

    def on_mount(self) -> None:
        self._refresh()
        self.set_interval(0.5, self._refresh)

    # -- public API ------------------------------------------------------

    def set_stages(self, stages: tuple[str, ...]) -> None:
        self._state = _PanelState(rows=[StageRow(s) for s in stages])
        self._refresh()

    def mark(self, stage: str, status: str, detail: str = "") -> None:
        row = self._row(stage)
        if row is None:
            row = StageRow(stage)
            self._state.rows.append(row)
        if status == "running" and row.started_at is None:
            row.started_at = time.monotonic()
            row.finished_at = None
        elif status in {"done", "failed", "skipped"} and row.finished_at is None:
            row.finished_at = time.monotonic()
            if row.started_at is None:
                row.started_at = row.finished_at
        row.status = status
        if detail:
            row.detail = detail
        self._refresh()

    def reset(self) -> None:
        for row in self._state.rows:
            row.status = "pending"
            row.started_at = None
            row.finished_at = None
            row.detail = ""
        self._refresh()

    def snapshot(self) -> list[StageRow]:
        return list(self._state.rows)

    # -- rendering -------------------------------------------------------

    def _row(self, stage: str) -> StageRow | None:
        for r in self._state.rows:
            if r.name == stage:
                return r
        return None

    def _refresh(self) -> None:
        lines = [f"[bold cyan]▎[/][bold] {self.title_text}[/]", ""]
        running_idx = next(
            (i for i, r in enumerate(self._state.rows) if r.status == "running"),
            None,
        )
        done_count = sum(1 for r in self._state.rows if r.status == "done")
        total = len(self._state.rows)
        for i, r in enumerate(self._state.rows):
            icon = _STATUS_ICON.get(r.status, "·")
            style = _STATUS_STYLE.get(r.status, "white")
            elapsed = r.elapsed()
            time_str = f"{elapsed:4.1f}s" if elapsed > 0 else "     "
            arrow = "▸" if i == running_idx else " "
            name = r.name if len(r.name) <= 13 else r.name[:12] + "…"
            line = f"[{style}]{arrow}{icon} {name:<13}[/][dim]{time_str}[/]"
            if r.status == "failed" and r.detail:
                line += f"\n    [red dim]{r.detail[:22]}[/]"
            lines.append(line)
        lines.append("")
        lines.append(f"[dim]── {done_count}/{total} done ──[/]")
        self.update("\n".join(lines))
