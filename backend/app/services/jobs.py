"""Database-backed bounded background jobs with leases and restart recovery."""

import asyncio
import json
import time
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, update, delete, func, case, text
from app.database.session import async_session_factory
from app.database.models.models import BackgroundJob, Message, Run, Artifact, Approval
from app.security.identity import (
    require_context,
    Owner,
    current_owner,
    current_conversation,
)
from app.core.logging import get_logger

logger = get_logger(__name__)
_tasks = set()
_maintenance_at = 0.0


async def enqueue(kind, conversation_id, payload):
    owner = require_context()
    if kind == "memory":
        from app.core.config import get_settings

        settings = get_settings()
        if not settings.qdrant_url or not settings.google_api_key_list:
            return False
    async with async_session_factory() as db:
        if db.bind.dialect.name == "postgresql":
            await db.execute(text("SELECT pg_advisory_xact_lock(629102901)"))
        else:
            await db.execute(
                text("UPDATE background_jobs SET attempts=attempts WHERE 1=0")
            )
        count = await db.scalar(
            select(func.count(BackgroundJob.id)).where(
                BackgroundJob.status.in_(["pending", "running"])
            )
        )
        if count >= 200:
            if kind == "review":
                await db.execute(
                    update(Message)
                    .where(Message.id == payload["message_id"])
                    .values(review_status="skipped_busy")
                )
                await db.commit()
            return False
        db.add(
            BackgroundJob(
                kind=kind,
                conversation_id=conversation_id,
                owner_key=owner.key,
                payload=json.dumps(payload),
            )
        )
        await db.commit()
    return True


async def _fail_review(db, job):
    if job.kind == "review":
        payload = json.loads(job.payload)
        if payload.get("message_id"):
            await db.execute(
                update(Message)
                .where(
                    Message.id == payload["message_id"],
                    Message.review_status == "pending",
                )
                .values(review_status="failed")
            )


async def _perform(job):
    kind, identity = job.owner_key.split(":", 1)
    ot = current_owner.set(
        Owner(user_id=identity) if kind == "user" else Owner(session_id=identity)
    )
    ct = current_conversation.set(job.conversation_id)
    try:
        payload = json.loads(job.payload)
        if job.kind == "memory":
            from app.memory.vector_store import store_message

            if not await store_message(job.conversation_id, **payload):
                raise RuntimeError("Memory indexing unavailable")
        elif job.kind == "review":
            from app.api.routes.chat import (
                _review_saved_response,
                _chat_connections,
                _socket_authorized,
            )

            class ReviewSocket:
                evidence = payload.pop("evidence", [])

                async def send_json(self, data):
                    for ws in tuple(_chat_connections):
                        if (
                            getattr(ws, "agentverse_conversation", None)
                            == job.conversation_id
                            and getattr(ws, "agentverse_owner", None) == job.owner_key
                        ):
                            try:
                                if not await _socket_authorized(
                                    ws, job.conversation_id
                                ):
                                    continue
                                await asyncio.wait_for(ws.send_json(data), 2)
                            except Exception:
                                pass

            if not await _review_saved_response(ReviewSocket(), **payload):
                raise RuntimeError("Quality review unavailable")
    finally:
        current_owner.reset(ot)
        current_conversation.reset(ct)


async def worker():
    global _maintenance_at
    while True:
        now = datetime.now(timezone.utc)
        async with async_session_factory() as db:
            if time.monotonic() >= _maintenance_at:
                _maintenance_at = time.monotonic() + 60
                await db.execute(
                    update(Run)
                    .where(
                        Run.status == "running",
                        Run.created_at < now - timedelta(seconds=610),
                    )
                    .values(
                        status="interrupted", active_conversation=None, completed_at=now
                    )
                )
                await db.execute(delete(Artifact).where(Artifact.expires_at < now))
                await db.execute(
                    update(Approval)
                    .where(Approval.status == "pending", Approval.expires_at < now)
                    .values(status="expired")
                )
                exhausted = (
                    await db.scalars(
                        select(BackgroundJob).where(
                            BackgroundJob.attempts >= 3,
                            (BackgroundJob.status == "pending")
                            | (
                                (BackgroundJob.status == "running")
                                & (
                                    BackgroundJob.updated_at
                                    < now - timedelta(seconds=120)
                                )
                            ),
                        )
                    )
                ).all()
                for exhausted_job in exhausted:
                    await _fail_review(db, exhausted_job)
                await db.execute(
                    update(BackgroundJob)
                    .where(
                        BackgroundJob.status == "running",
                        BackgroundJob.updated_at < now - timedelta(seconds=120),
                    )
                    .values(
                        status=case(
                            (BackgroundJob.attempts >= 3, "failed"), else_="pending"
                        )
                    )
                    .execution_options(synchronize_session=False)
                )
                await db.execute(
                    update(BackgroundJob)
                    .where(
                        BackgroundJob.status == "pending", BackgroundJob.attempts >= 3
                    )
                    .values(status="failed")
                )
                await db.execute(
                    delete(BackgroundJob)
                    .where(
                        BackgroundJob.created_at < now - timedelta(days=7),
                        BackgroundJob.status.in_(["completed", "failed"]),
                    )
                    .execution_options(synchronize_session=False)
                )
            job = await db.scalar(
                select(BackgroundJob)
                .where(
                    BackgroundJob.status == "pending",
                    BackgroundJob.attempts < 3,
                    BackgroundJob.available_at <= now,
                )
                .order_by(BackgroundJob.kind.desc(), BackgroundJob.created_at)
                .limit(1)
            )
            if job:
                result = await db.execute(
                    update(BackgroundJob)
                    .where(
                        BackgroundJob.id == job.id, BackgroundJob.status == "pending"
                    )
                    .values(
                        status="running",
                        attempts=BackgroundJob.attempts + 1,
                        updated_at=now,
                    )
                )
                claimed = result.rowcount == 1
            else:
                claimed = False
            await db.commit()
        if not claimed:
            await asyncio.sleep(1)
            continue
        try:
            await asyncio.wait_for(_perform(job), 90)
            status = "completed"
        except asyncio.CancelledError:
            async with async_session_factory() as db:
                await db.execute(
                    update(BackgroundJob)
                    .where(BackgroundJob.id == job.id)
                    .values(status="failed" if job.attempts >= 3 else "pending")
                )
                if job.attempts >= 3:
                    await _fail_review(db, job)
                await db.commit()
            raise
        except Exception:
            logger.warning("job.failed", kind=job.kind)
            status = "failed" if job.attempts >= 3 else "pending"
        async with async_session_factory() as db:
            if status == "failed":
                await _fail_review(db, job)
            await db.execute(
                update(BackgroundJob)
                .where(BackgroundJob.id == job.id)
                .values(
                    status=status,
                    updated_at=datetime.now(timezone.utc),
                    available_at=datetime.now(timezone.utc)
                    + timedelta(seconds=30 * job.attempts),
                )
            )
            await db.commit()


async def supervised_worker():
    while True:
        try:
            await worker()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("job.worker_restart")
            await asyncio.sleep(5)


async def start():
    from app.services.memory_cleanup import worker as cleanup_worker

    cleanup = asyncio.create_task(cleanup_worker())
    _tasks.add(cleanup)
    cleanup.add_done_callback(_tasks.discard)
    for _ in range(2):
        task = asyncio.create_task(supervised_worker())
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)


async def stop():
    for task in tuple(_tasks):
        task.cancel()
    await asyncio.gather(*tuple(_tasks), return_exceptions=True)
