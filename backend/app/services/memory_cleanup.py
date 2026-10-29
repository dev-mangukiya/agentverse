"""Transactional deletion outbox with leased, indefinitely retried cleanup."""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, or_, select, update

from app.core.config import get_settings
from app.core.logging import get_logger
from app.database.models.models import MemoryDeletion
from app.database.session import async_session_factory

logger = get_logger(__name__)
# Let in-flight indexing jobs (90-second deadline) finish before the final sweep.
GRACE_SECONDS = 120


async def schedule_deletion(db, conversation_id):
    """Use the caller's deletion transaction so the intent cannot be lost."""
    if db.bind.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert

    due = datetime.now(timezone.utc) + timedelta(seconds=GRACE_SECONDS)
    statement = insert(MemoryDeletion).values(
        conversation_id=conversation_id,
        collection=get_settings().qdrant_collection,
        available_at=due,
    )
    await db.execute(
        statement.on_conflict_do_update(
            index_elements=["conversation_id", "collection"],
            # A late index write invalidates any old cleanup claim and requests a new sweep.
            set_={"available_at": due, "lease_until": None, "lease_token": None},
        )
    )


async def process_one():
    now = datetime.now(timezone.utc)
    claim = uuid.uuid4().hex
    eligible = (
        MemoryDeletion.available_at <= now,
        or_(MemoryDeletion.lease_until.is_(None), MemoryDeletion.lease_until <= now),
    )
    async with async_session_factory() as db:
        record = await db.scalar(
            select(MemoryDeletion)
            .where(*eligible)
            .order_by(MemoryDeletion.available_at)
            .limit(1)
        )
        if record is None:
            return False
        result = await db.execute(
            update(MemoryDeletion)
            .where(MemoryDeletion.id == record.id, *eligible)
            .values(
                lease_token=claim,
                lease_until=now + timedelta(seconds=60),
                attempts=MemoryDeletion.attempts + 1,
            )
            .execution_options(synchronize_session=False)
        )
        await db.commit()
        if result.rowcount != 1:
            return False
        record_id, conversation_id, collection = (
            record.id,
            record.conversation_id,
            record.collection,
        )
        attempt = record.attempts + 1

    try:
        from app.memory.vector_store import delete_conversation_memory

        async with asyncio.timeout(10):
            confirmed = await delete_conversation_memory(
                conversation_id, collection=collection
            )
        if not confirmed:
            raise RuntimeError("Memory store unavailable")
    except asyncio.CancelledError:
        # Persisted lease expires after restart; no intent is discarded.
        raise
    except Exception:
        delay = min(3600, 30 * 2 ** min(attempt - 1, 7))
        async with async_session_factory() as db:
            await db.execute(
                update(MemoryDeletion)
                .where(
                    MemoryDeletion.id == record_id, MemoryDeletion.lease_token == claim
                )
                .values(
                    lease_token=None,
                    lease_until=None,
                    available_at=datetime.now(timezone.utc) + timedelta(seconds=delay),
                )
            )
            await db.commit()
        logger.warning("memory.cleanup_retry", attempt=attempt, retry_seconds=delay)
        return True

    async with async_session_factory() as db:
        await db.execute(
            delete(MemoryDeletion).where(
                MemoryDeletion.id == record_id, MemoryDeletion.lease_token == claim
            )
        )
        await db.commit()
    return True


async def worker():
    while True:
        try:
            processed = get_settings().qdrant_url and await process_one()
            await asyncio.sleep(0.25 if processed else 5)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("memory.cleanup_worker_retry")
            await asyncio.sleep(5)
