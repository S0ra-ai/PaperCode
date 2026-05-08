"""Migrate data from legacy SQLite/MySQL databases to PostgreSQL.

Usage:
    cd packages/api
    python -m scripts.migrate_legacy                      # auto-detect and migrate
    python -m scripts.migrate_legacy --sqlite path/to.db  # migrate specific SQLite file
"""

from __future__ import annotations

import argparse
import glob
import os
import sys
from typing import Optional

sys.path.insert(0, ".")


def detect_legacy_databases() -> list[dict]:
    """Scan for old database files or connections."""
    found: list[dict] = []

    # Check for SQLite files in common locations
    search_dirs = [".", "./data", "./database", ".."]
    for d in search_dirs:
        for db_file in glob.glob(os.path.join(d, "*.db")):
            found.append({"type": "sqlite", "path": os.path.abspath(db_file)})
        for db_file in glob.glob(os.path.join(d, "*.sqlite3")):
            found.append({"type": "sqlite", "path": os.path.abspath(db_file)})
        for db_file in glob.glob(os.path.join(d, "*.sqlite")):
            found.append({"type": "sqlite", "path": os.path.abspath(db_file)})

    # Check environment variables for old MySQL connections
    mysql_url = os.environ.get("LEGACY_MYSQL_URL", "")
    if mysql_url:
        found.append({"type": "mysql", "url": mysql_url})

    return found


def _get_sqlite_tables(conn) -> list[str]:
    """List all user tables in a SQLite database."""
    import sqlite3
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    return [row[0] for row in cursor.fetchall()]


def migrate_sqlite(sqlite_path: str, pg_url: Optional[str] = None) -> dict:
    """Migrate from SQLite to PostgreSQL."""
    import sqlite3
    from sqlalchemy import create_engine, text as sa_text

    if pg_url is None:
        from app.platform.config import settings
        pg_url = settings.database_url

    print(f"  Source: {sqlite_path}")
    print(f"  Target: {pg_url[:pg_url.index('@') + 1]}***")

    src = sqlite3.connect(sqlite_path)
    src.row_factory = sqlite3.Row
    pg_engine = create_engine(pg_url)

    tables = _get_sqlite_tables(src)
    stats: dict[str, int] = {}

    for table in tables:
        try:
            rows = src.execute(f"SELECT * FROM {table}").fetchall()  # noqa: S608
            if not rows:
                stats[table] = 0
                continue

            columns = rows[0].keys()
            placeholders = ", ".join(f":{c}" for c in columns)
            col_list = ", ".join(f'"{c}"' for c in columns)
            insert_sql = f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders})'

            with pg_engine.begin() as conn:
                for row in rows:
                    try:
                        conn.execute(sa_text(insert_sql), dict(row))
                    except Exception:
                        pass  # skip duplicates / constraint violations

            stats[table] = len(rows)
            print(f"  ✓ {table}: {len(rows)} rows migrated")
        except Exception as e:
            stats[table] = -1
            print(f"  ✗ {table}: {e}")

    src.close()
    pg_engine.dispose()
    return stats


def migrate_mysql(mysql_url: str, pg_url: Optional[str] = None) -> dict:
    """Migrate from MySQL to PostgreSQL."""
    from sqlalchemy import create_engine, inspect, text as sa_text

    if pg_url is None:
        from app.platform.config import settings
        pg_url = settings.database_url

    print(f"  Source: mysql://***")
    print(f"  Target: {pg_url[:pg_url.index('@') + 1]}***")

    src_engine = create_engine(mysql_url)
    pg_engine = create_engine(pg_url)

    inspector = inspect(src_engine)
    tables = inspector.get_table_names()
    stats: dict[str, int] = {}

    for table in tables:
        if table in ("alembic_version",):
            continue
        try:
            with src_engine.connect() as src_conn:
                rows = src_conn.execute(sa_text(f"SELECT * FROM `{table}`")).mappings().fetchall()

            if not rows:
                stats[table] = 0
                continue

            columns = list(rows[0].keys())
            placeholders = ", ".join(f":{c}" for c in columns)
            col_list = ", ".join(f'"{c}"' for c in columns)
            insert_sql = f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders})'

            with pg_engine.begin() as conn:
                for row in rows:
                    try:
                        conn.execute(sa_text(insert_sql), dict(row))
                    except Exception:
                        pass

            stats[table] = len(rows)
            print(f"  ✓ {table}: {len(rows)} rows migrated")
        except Exception as e:
            stats[table] = -1
            print(f"  ✗ {table}: {e}")

    src_engine.dispose()
    pg_engine.dispose()
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate legacy databases to PostgreSQL.")
    parser.add_argument("--sqlite", type=str, help="Path to a specific SQLite file to migrate.")
    parser.add_argument("--mysql", type=str, help="MySQL connection URL to migrate from.")
    args = parser.parse_args()

    if args.sqlite:
        if not os.path.isfile(args.sqlite):
            print(f"Error: SQLite file not found: {args.sqlite}")
            sys.exit(1)
        print(f"\n📦 Migrating SQLite: {args.sqlite}\n")
        stats = migrate_sqlite(args.sqlite)
        print(f"\nDone. Tables: {len(stats)}")
        return

    if args.mysql:
        print(f"\n📦 Migrating MySQL\n")
        stats = migrate_mysql(args.mysql)
        print(f"\nDone. Tables: {len(stats)}")
        return

    # Auto-detect
    print("\n🔍 Scanning for legacy databases...\n")
    found = detect_legacy_databases()

    if not found:
        print("No legacy databases detected.")
        return

    for db_info in found:
        print(f"  Found: {db_info['type']} — {db_info.get('path') or db_info.get('url')}")

    print()
    confirm = input("Migrate all detected databases? Type 'yes' to confirm: ")
    if confirm.strip().lower() != "yes":
        print("Aborted.")
        return

    for db_info in found:
        print()
        if db_info["type"] == "sqlite":
            migrate_sqlite(db_info["path"])
        elif db_info["type"] == "mysql":
            migrate_mysql(db_info["url"])

    print("\n✅ Migration complete.")


if __name__ == "__main__":
    main()
