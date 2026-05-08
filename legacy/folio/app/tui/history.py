# SPDX-License-Identifier: MPL-2.0
"""History stack for the TUI input box.

Persists across runs in ``~/.folio/history`` (plain text, one entry per
line, newest last). Up/down arrows in ``progress.py`` walk a snapshot
of the file plus the current session's submissions.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

DEFAULT_PATH = Path.home() / ".folio" / "history"
MAX_ENTRIES = 1000


class HistoryStack:
    def __init__(
        self, path: Path | None = None, max_entries: int = MAX_ENTRIES
    ) -> None:
        self._path = path or DEFAULT_PATH
        self._max = max_entries
        self._entries: deque[str] = deque(maxlen=max_entries)
        self._cursor: int | None = None
        self._draft: str = ""
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            for raw in self._path.read_text("utf-8").splitlines():
                line = raw.rstrip("\n")
                if line:
                    self._entries.append(line)
        except OSError:
            return

    def add(self, line: str) -> None:
        line = line.strip()
        if not line:
            return
        if self._entries and self._entries[-1] == line:
            self._cursor = None
            return
        self._entries.append(line)
        self._cursor = None
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            with self._path.open("a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        except OSError:
            pass

    def up(self, current: str) -> str | None:
        """Walk older. Returns the entry to display, or None if no move."""
        if not self._entries:
            return None
        if self._cursor is None:
            self._draft = current
            self._cursor = len(self._entries) - 1
        elif self._cursor > 0:
            self._cursor -= 1
        else:
            return self._entries[0]
        return self._entries[self._cursor]

    def down(self, current: str) -> str | None:
        """Walk newer. Returns the entry, the saved draft, or None."""
        if self._cursor is None:
            return None
        if self._cursor < len(self._entries) - 1:
            self._cursor += 1
            return self._entries[self._cursor]
        # past newest → restore draft
        self._cursor = None
        return self._draft

    def reset(self) -> None:
        self._cursor = None
        self._draft = ""

    @property
    def entries(self) -> list[str]:
        return list(self._entries)
