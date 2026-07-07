"""
Structured logging configuration using structlog.

Every agent action, tool call, and API request should log through this so that
production traces are queryable JSON, not free-text prints. This is what lets you
say in an interview: "every agent decision is traceable end to end."
"""

import logging
import sys

import structlog

from app.core.config import get_settings


def configure_logging() -> None:
    settings = get_settings()

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=logging.DEBUG if settings.app_debug else logging.INFO,
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer()
            if settings.is_production
            else structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.DEBUG if settings.app_debug else logging.INFO
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> logging.Logger:
    """Get a structlog-wrapped logger."""
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    
    # Ensure logs go to stdout
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
        
        # Add file handler for debugging on Render
        file_handler = logging.FileHandler("/tmp/render_app.log")
        file_handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(file_handler)

    return structlog.wrap_logger(logger)
