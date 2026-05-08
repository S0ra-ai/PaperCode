# SPDX-License-Identifier: MPL-2.0
"""Per-run conversation transcript writer.

Writes ``~/.folio/runs/<run_id>/transcript.md`` as the run progresses.
The TUI calls ``user(...)``/``stage(...)`` etc. and the transcript is
flushed on every append. On crashes, the partial file remains.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from app.persistence.snapshots import run_dir


class Transcript:
    def __init__(self, run_id: str) -> None:
        self._run_id = run_id
        self._path: Path | None = None
        self._opened = False

    @property
    def path(self) -> Path | None:
        return self._path

    def _ensure_open(self) -> Path | None:
        if self._opened:
            return self._path
        try:
            d = run_dir(self._run_id)
            d.mkdir(parents=True, exist_ok=True)
            self._path = d / "transcript.md"
            if not self._path.exists():
                self._write(
                    f"# Folio run `{self._run_id[:8]}`\n\n"
                    f"_started {datetime.now().isoformat(timespec='seconds')}_\n\n"
                )
            self._opened = True
        except OSError:
            self._opened = True  # don't retry forever
        return self._path

    def _write(self, chunk: str) -> None:
        if self._path is None:
            return
        try:
            with self._path.open("a", encoding="utf-8") as fh:
                fh.write(chunk)
        except OSError:
            pass

    # -- public ---------------------------------------------------------

    def user(self, text: str) -> None:
        self._ensure_open()
        self._write(f"**user:** {text}\n\n")

    def assistant(self, text: str) -> None:
        self._ensure_open()
        self._write(f"**folio:** {text}\n\n")

    def question(
        self, field: str, question: str, options: list[dict] | None = None
    ) -> None:
        self._ensure_open()
        self._write(f"**folio (?{field}):** {question}\n")
        if options:
            for i, opt in enumerate(options, start=1):
                lbl = opt.get("label") or opt.get("value") or ""
                desc = opt.get("description") or ""
                line = f"  {i}. {lbl}"
                if desc:
                    line += f" — {desc}"
                self._write(line + "\n")
        self._write("\n")

    def stage(self, name: str, status: str, detail: str = "") -> None:
        self._ensure_open()
        suffix = f" — {detail}" if detail else ""
        self._write(f"- _{name}_ **{status}**{suffix}\n")

    def footer(self, status: str, detail: str = "") -> None:
        self._ensure_open()
        ts = datetime.now().isoformat(timespec="seconds")
        self._write(f"\n---\n_{status}_ at {ts}\n")
        if detail:
            self._write(f"\n{detail}\n")
