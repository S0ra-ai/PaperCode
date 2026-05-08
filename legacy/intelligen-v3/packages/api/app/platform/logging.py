"""Structured logging configuration via structlog with stdlib bridge.

Calling ``setup_logging()`` once at application startup will:
* Configure *structlog* with JSON rendering (production) or coloured
  console rendering (development / debug).
* Set up a ``ProcessorFormatter`` on the stdlib root logger so that
  **every** ``logging.getLogger(__name__)`` call in the codebase
  automatically produces structured output enriched with request-scoped
  context (``request_id``, ``trace_id``, ``user_id``).
"""

from __future__ import annotations

import logging
import sys

import structlog


def setup_logging(log_level: str = "INFO") -> None:
    """Bootstrap structlog + stdlib logging.

    Parameters
    ----------
    log_level:
        Any standard level name recognised by :pymod:`logging`
        (``DEBUG``, ``INFO``, ``WARNING``, ``ERROR``, ``CRITICAL``).
    """
    level = getattr(logging, log_level.upper(), logging.INFO)

    # Processors shared by both structlog-native and stdlib-originated logs.
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]

    if level <= logging.DEBUG:
        renderer: structlog.types.Processor = structlog.dev.ConsoleRenderer()
    else:
        renderer = structlog.processors.JSONRenderer()

    # --- structlog-native logger configuration ---
    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # --- stdlib root logger → structlog ProcessorFormatter ---
    formatter = structlog.stdlib.ProcessorFormatter(
        # For logs originating from stdlib (foreign) loggers, run the shared
        # chain so they also receive timestamp, level, and contextvars.
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # Quieten noisy third-party loggers
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error", "sqlalchemy.engine"):
        logging.getLogger(name).setLevel(max(level, logging.WARNING))
