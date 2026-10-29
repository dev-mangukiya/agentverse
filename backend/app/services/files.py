"""Private virtual files persisted in the database, never server filesystem paths."""

from pathlib import PurePosixPath
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, delete, func, text
from app.database.models.models import Artifact
from app.database.session import async_session_factory
from app.security.identity import require_context, current_conversation
from app.core.config import get_settings


def filename(value):
    path = PurePosixPath(value)
    if (
        not value
        or path.is_absolute()
        or ".." in path.parts
        or "\\" in value
        or len(value) > 160
    ):
        raise ValueError("Use a relative workspace filename without parent traversal")
    return str(path)


async def save_artifact(name, data, content_type):
    owner = require_context()
    name = filename(name)
    if len(data) > 5_000_000:
        raise ValueError("File exceeds 5 MB")
    now = datetime.now(timezone.utc)
    async with async_session_factory() as db:
        if db.bind.dialect.name == "postgresql":
            import hashlib

            lock_id = int.from_bytes(
                hashlib.sha256(owner.key.encode()).digest()[:8], signed=True
            )
            await db.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": lock_id})
        # This write also serializes quota checks across SQLite connections.
        await db.execute(delete(Artifact).where(Artifact.expires_at < now))
        used = await db.scalar(
            select(func.coalesce(func.sum(func.length(Artifact.data)), 0)).where(
                Artifact.owner_key == owner.key
            )
        )
        if used + len(data) > 25_000_000:
            raise ValueError("Workspace file quota exceeded (25 MB)")
        record = Artifact(
            owner_key=owner.key,
            conversation_id=current_conversation.get(),
            filename=name,
            content_type=content_type,
            data=data,
            expires_at=now + timedelta(hours=get_settings().artifact_ttl_hours),
        )
        db.add(record)
        await db.commit()
        return record


async def read_private_file(name):
    name = filename(name)
    owner = require_context()
    async with async_session_factory() as db:
        record = await db.scalar(
            select(Artifact)
            .where(
                Artifact.owner_key == owner.key,
                Artifact.filename == name,
                Artifact.expires_at > datetime.now(timezone.utc),
            )
            .order_by(Artifact.expires_at.desc())
            .limit(1)
        )
        if not record:
            raise ValueError("File not found in your workspace")
        if len(record.data) > 50000:
            raise ValueError("Text reads are limited to 50 KB")
        return record.data.decode("utf-8")
