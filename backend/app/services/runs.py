"""Admission limits and durable turn lifecycle; one active run per conversation."""

import asyncio
import hashlib
import time
import uuid
from contextlib import asynccontextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from app.core.config import get_settings
from app.database.models.models import Run, ToolExecution
from app.security.identity import require_context, current_run

_slots = asyncio.Semaphore(get_settings().max_concurrent_turns)
model_calls: ContextVar[list[int] | None] = ContextVar("model_calls", default=None)


@asynccontextmanager
async def bounded_operation():
    """Apply chat admission and call/deadline budgets to auxiliary model work."""
    await asyncio.wait_for(_slots.acquire(), 3)
    token = model_calls.set([0])
    try:
        async with asyncio.timeout(get_settings().turn_timeout_seconds):
            yield
    finally:
        model_calls.reset(token)
        _slots.release()


def count_model_call():
    counter = model_calls.get()
    if counter is not None:
        counter[0] += 1
        if counter[0] > get_settings().max_model_calls_per_turn:
            raise RuntimeError("Model call budget exhausted")


async def record_tool(name, status, duration):
    run_id = current_run.get()
    if not run_id:
        return
    from app.database.session import async_session_factory

    async with async_session_factory() as db:
        db.add(
            ToolExecution(run_id=run_id, name=name, status=status, duration_ms=duration)
        )
        await db.commit()


async def run_turn(process, socket, conversation_id, content, attachments, factory):
    owner = require_context()
    started = time.monotonic()
    request_id = hashlib.sha256(
        f"{owner.key}:{getattr(socket, 'request_id', None) or uuid.uuid4().hex}".encode()
    ).hexdigest()
    async with factory() as db:
        from app.database.models.models import Conversation

        if not await db.scalar(
            select(Conversation.id).where(
                Conversation.id == conversation_id, owner.condition()
            )
        ):
            await socket.send_json(
                {"type": "error", "content": "Conversation not found."}
            )
            return
        if await db.scalar(select(Run.id).where(Run.request_id == request_id)):
            await socket.send_json(
                {
                    "type": "error",
                    "content": "This message was already submitted. Reload the conversation to see its result.",
                }
            )
            return
        from app.services.provider_limits import owner_allowed

        if not await owner_allowed(owner.key):
            await socket.send_json(
                {
                    "type": "error",
                    "content": "Please wait a moment before sending another message.",
                }
            )
            return
        run = Run(
            owner_key=owner.key,
            conversation_id=conversation_id,
            request_id=request_id,
            active_conversation=conversation_id,
        )
        db.add(run)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            await socket.send_json(
                {
                    "type": "busy",
                    "content": "This conversation already has a reply in progress.",
                }
            )
            return
    rt = current_run.set(run.id)
    ct = model_calls.set([0])
    from app.agents.telemetry import stages, usage

    stage_token = stages.set([])
    usage_token = usage.set({})
    from structlog.contextvars import bind_contextvars, reset_contextvars

    log_tokens = bind_contextvars(run_id=run.id, conversation_id=conversation_id)
    status = "failed"
    try:
        async with asyncio.timeout(get_settings().turn_timeout_seconds):
            await asyncio.wait_for(_slots.acquire(), 3)
            try:
                await process(socket, conversation_id, content, attachments)
                status = (
                    "failed"
                    if getattr(socket, "failed", False)
                    else "awaiting_approval"
                    if getattr(socket, "approval_pending", False)
                    else "completed"
                )
            finally:
                _slots.release()
    except asyncio.CancelledError:
        status = "cancelled"
        raise
    except TimeoutError:
        status = "timed_out"
        from app.api.routes.chat import _save_interrupted_response

        partial = await _save_interrupted_response(socket, conversation_id)
        await socket.send_json(
            {
                "type": "error",
                "message": partial,
                "content": "The reply reached its time limit. Please try a smaller request.",
            }
        )
    finally:
        current_run.reset(rt)
        call_count = model_calls.get()[0]
        stage_data = stages.get()
        token_usage = usage.get()
        usage.reset(usage_token)
        reset_contextvars(**log_tokens)
        stages.reset(stage_token)
        model_calls.reset(ct)
        async with factory() as db:
            await db.execute(
                update(Run)
                .where(Run.id == run.id)
                .values(
                    status=status,
                    metrics_json=__import__("json").dumps(
                        {
                            "model_calls": call_count,
                            "stages": stage_data,
                            "token_usage": token_usage,
                        }
                    ),
                    active_conversation=None,
                    completed_at=datetime.now(timezone.utc),
                    duration_ms=int((time.monotonic() - started) * 1000),
                    first_token_ms=getattr(socket, "first_token_ms", None),
                    agent_name=getattr(socket, "agent", None),
                )
            )
            await db.commit()
