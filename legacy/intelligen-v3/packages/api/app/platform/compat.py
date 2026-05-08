"""Dialect compatibility — register type compilers so the same
SQLAlchemy models work transparently on PostgreSQL, MySQL and SQLite.

Import this module **before** any ``Base.metadata.create_all()`` call.
"""

from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy import BigInteger


@compiles(LONGTEXT, "sqlite")
def _compile_longtext_sqlite(element, compiler, **kw):
    """MySQL LONGTEXT → SQLite TEXT."""
    return "TEXT"


@compiles(LONGTEXT, "postgresql")
def _compile_longtext_postgresql(element, compiler, **kw):
    """MySQL LONGTEXT → PostgreSQL TEXT."""
    return "TEXT"


@compiles(BigInteger, "sqlite")
def _compile_bigint_sqlite(element, compiler, **kw):
    """BigInteger autoincrement needs plain INTEGER on SQLite."""
    return "INTEGER"
