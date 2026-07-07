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

engine = create_async_engine(
    _db_url,
    echo=_echo,
    pool_pre_ping=True if not _db_url.startswith("sqlite") else False,
    connect_args=_connect_args,
)

async_session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    """Base class for all ORM models."""


async def init_db() -> None:
    """Create all tables. Called once at startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a request-scoped DB session."""
    async with async_session_factory() as session:
        yield session
