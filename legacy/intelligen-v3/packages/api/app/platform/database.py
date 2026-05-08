"""SQLAlchemy database engine and session factory."""

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool

from app.platform.config import settings

# Import compat module to register dialect compilers (LONGTEXT, BigInteger)
import app.platform.compat  # noqa: F401

_url = settings.database_url
_is_sqlite = _url.startswith("sqlite")

if _is_sqlite:
    engine = create_engine(
        _url,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=settings.LOG_LEVEL.lower() == "debug",
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
else:
    engine = create_engine(
        _url,
        pool_size=10,
        max_overflow=20,
        pool_recycle=3600,
        pool_pre_ping=True,
        echo=settings.LOG_LEVEL.lower() == "debug",
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
