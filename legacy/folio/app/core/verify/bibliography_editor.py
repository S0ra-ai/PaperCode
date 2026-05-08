# SPDX-License-Identifier: MPL-2.0
"""Bibliography editor: operations on bibliography entries.

Provides a model for managing, editing, and merging bibliography entries
after the cite stage (verify/export stages use the final bibliography).
Supports deletion logging ("why was this removed?").
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.citations.bibtex import BibEntry


@dataclass
class BibEntryWithDeletionLog:
    """BibEntry with optional deletion reason."""

    key: str
    entry_type: str
    fields: dict[str, str]
    source: str = "unknown"
    deletion_reason: str | None = None


@dataclass
class Bibliography:
    """Mutable bibliography: list of entries with edit history."""

    entries: list[BibEntry] = field(default_factory=list)
    deleted_entries: list[BibEntryWithDeletionLog] = field(
        default_factory=list
    )  # for undo
    edits: list[dict[str, Any]] = field(default_factory=list)  # edit log

    def add_entry(self, entry: BibEntry) -> None:
        """Add an entry (check for duplicates by key first)."""
        if not any(e.key == entry.key for e in self.entries):
            self.entries.append(entry)
            self.edits.append({"op": "add", "key": entry.key, "source": entry.source})

    def delete_entry(self, key: str, reason: str | None = None) -> bool:
        """Delete entry by key; log the reason."""
        for i, e in enumerate(self.entries):
            if e.key == key:
                entry = self.entries.pop(i)
                deleted = BibEntryWithDeletionLog(
                    key=entry.key,
                    entry_type=entry.entry_type,
                    fields=entry.fields,
                    source=entry.source,
                    deletion_reason=reason,
                )
                self.deleted_entries.append(deleted)
                self.edits.append(
                    {
                        "op": "delete",
                        "key": key,
                        "reason": reason,
                    }
                )
                return True
        return False

    def update_entry(self, key: str, fields: dict[str, str]) -> bool:
        """Update fields of an entry by key."""
        for e in self.entries:
            if e.key == key:
                # For frozen dataclass, we need to recreate
                new_fields = {**e.fields, **fields}
                idx = self.entries.index(e)
                self.entries[idx] = BibEntry(
                    key=e.key,
                    entry_type=e.entry_type,
                    fields=new_fields,
                    source=e.source,
                )
                self.edits.append(
                    {
                        "op": "update",
                        "key": key,
                        "fields": fields,
                    }
                )
                return True
        return False

    def find_by_key(self, key: str) -> BibEntry | None:
        """Look up entry by cite key."""
        for e in self.entries:
            if e.key == key:
                return e
        return None

    def merge(self, other: Bibliography) -> None:
        """Merge another bibliography, preferring self on conflicts."""
        for entry in other.entries:
            if not any(e.key == entry.key for e in self.entries):
                self.add_entry(entry)

    def to_bibtex(self) -> str:
        """Render all entries as BibTeX."""
        return "\n\n".join(e.to_bibtex() for e in self.entries)

    def undo_delete(self, key: str) -> bool:
        """Restore a deleted entry."""
        for i, deleted in enumerate(self.deleted_entries):
            if deleted.key == key:
                restored = BibEntry(
                    key=deleted.key,
                    entry_type=deleted.entry_type,
                    fields=deleted.fields,
                    source=deleted.source,
                )
                self.entries.append(restored)
                self.deleted_entries.pop(i)
                self.edits.append(
                    {
                        "op": "undelete",
                        "key": key,
                    }
                )
                return True
        return False
