"""Alembic environment configuration.

Supports DATABASE_URL env-var override so migrations can be generated
without a running MySQL instance (e.g. with SQLite in CI).
"""

from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.platform.database import Base
from app.platform.config import settings

# Import all models so Base.metadata is complete
from app.modules.auth.models import User  # noqa: F401
from app.modules.workspace.models.session import Session  # noqa: F401
from app.modules.workspace.models.file import StoredFile  # noqa: F401
from app.modules.workspace.models.task import GenerateTask, GenerateTaskFile  # noqa: F401
from app.platform.models.audit import OperationLog, AdminAccessLog  # noqa: F401
from app.modules.generation.models import TaskExecution, SectionCheckpoint  # noqa: F401
from app.modules.llm.models import LLMProvider, LLMStageConfig  # noqa: F401

config = context.config

# DATABASE_URL env-var takes precedence (useful for CI / local dev without MySQL)
database_url = os.environ.get("DATABASE_URL") or settings.database_url
config.set_main_option("sqlalchemy.url", database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
