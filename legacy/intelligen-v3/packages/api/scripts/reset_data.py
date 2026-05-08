"""Reset database data while preserving schema. For development/testing.

Usage:
    cd packages/api
    python -m scripts.reset_data             # clear data, keep admin
    python -m scripts.reset_data --all       # clear everything including admin
"""

from __future__ import annotations

import argparse
import sys

sys.path.insert(0, ".")

from app.platform.database import SessionLocal  # noqa: E402
from sqlalchemy import text  # noqa: E402

# Tables to clear, ordered by FK constraints (children first).
# 'users' is appended only when --all is passed.
TABLES_TO_CLEAR = [
    "section_checkpoints",
    "task_executions",
    "generate_task_files",
    "generate_tasks",
    "files",
    "sessions",
    "admin_access_logs",
    "operation_logs",
]


def reset_data(keep_admin: bool = True) -> None:
    """Clear all data except (optionally) the admin user."""
    tables = list(TABLES_TO_CLEAR)
    if not keep_admin:
        tables.append("users")

    db = SessionLocal()
    try:
        for table in tables:
            try:
                count = db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() or 0
                if count > 0:
                    db.execute(text(f"DELETE FROM {table}"))
                    print(f"  ✓ {table}: {count} rows deleted")
                else:
                    print(f"  – {table}: empty")
            except Exception as e:
                print(f"  ✗ {table}: {e}")

        if keep_admin:
            # Clear non-admin users
            try:
                count = db.execute(
                    text("DELETE FROM users WHERE role != 'admin'")
                ).rowcount
                print(f"  ✓ users (non-admin): {count} rows deleted")
            except Exception as e:
                print(f"  ✗ users (non-admin): {e}")

        db.commit()
        print("\nDone.")
    except Exception as e:
        db.rollback()
        print(f"\nFailed: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Reset IntelliGen database data.")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Also delete admin users (full reset).",
    )
    args = parser.parse_args()

    mode = "FULL RESET (including admin)" if args.all else "Data reset (keeping admin)"
    print(f"\n🔄 {mode}\n")

    confirm = input("Type 'yes' to confirm: ")
    if confirm.strip().lower() != "yes":
        print("Aborted.")
        sys.exit(0)

    print()
    reset_data(keep_admin=not args.all)
