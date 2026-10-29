"""
Structured logging configuration using structlog.

Every agent action, tool call, and API request should log through this so that
production traces are queryable JSON, not free-text prints. This is what lets you
say in an interview: "every agent decision is traceable end to end."
"""

import re
import logging
import sys

import structlog

from app.core.config import get_settings


def redact_fields(_, __, event):
    settings = get_settings()
    values = [
        settings.secret_key,
        settings.openai_api_key,
        settings.anthropic_api_key,
        settings.huggingface_api_key,
        settings.execution_token,
        settings.slack_bot_token,
        settings.linear_api_key,
        settings.github_token,
        settings.smtp_password,
        *settings.google_api_key_list,
    ]
    for key, value in list(event.items()):
        if isinstance(value, str):
            for secret in values:
                if secret and len(secret) >= 8:
                    value = value.replace(secret, "[redacted]")
            value = re.sub(r"(://)[^/@\s]+:[^/@\s]+@", r"\1[redacted]@", value)
            value = re.sub(
                r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",
                "[redacted token]",
                value,
            )
            event[key] = value
    return event


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
            redact_fields,
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


def get_logger(name: str):
    return structlog.wrap_logger(logging.getLogger(name))
