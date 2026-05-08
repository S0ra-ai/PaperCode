# SPDX-License-Identifier: MPL-2.0
"""SQLite/SQLAlchemy bootstrap test."""

from __future__ import annotations

import importlib

from sqlalchemy import inspect


def test_init_db_creates_trace_events_table(monkeypatch) -> None:
    # Re-import so the engine binds to the test FOLIO_HOME.
    import app.persistence.db as db_mod

    importlib.reload(db_mod)
    db_mod.init_db()
    insp = inspect(db_mod._engine)
    assert "trace_events" in insp.get_table_names()
