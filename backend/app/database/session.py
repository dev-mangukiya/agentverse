"""Async SQLAlchemy engine and session factory.

Supports both PostgreSQL (asyncpg) and SQLite (aiosqlite).
Defaults to SQLite for zero-config development.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

_db_url = settings.effective_database_url
_connect_args = {}
_echo = settings.app_debug

if _db_url.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}
    _echo = False  # SQLite echo is very noisy
else:
    # Disable prepared statement caching for compatibility with transaction
    # poolers (PgBouncer / Supavisor) which don't support prepared statements.
    _connect_args = {"statement_cache_size": 0}

engine = create_async_engine(
    _db_url,
    echo=False,
    pool_pre_ping=True if not _db_url.startswith("sqlite") else False,
    connect_args=_connect_args,
)

async_session_factory = async_sessionmaker(
    engine, expire_on_commit=False, class_=AsyncSession
)


class Base(DeclarativeBase):
    """Base class for all ORM models."""


async def init_db() -> None:
    from app.database.migrations import upgrade

    async with engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            from sqlalchemy import text

            await conn.execute(text("SELECT pg_advisory_xact_lock(6291029)"))
        await conn.run_sync(upgrade)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a request-scoped DB session."""
    async with async_session_factory() as session:
        yield session


if _db_url.startswith("sqlite"):
    from sqlalchemy import event

    @event.listens_for(engine.sync_engine, "connect")
    def _foreign_keys(dbapi_connection, _):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
