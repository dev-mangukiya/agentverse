import asyncio
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

os.environ.setdefault("APP_DEBUG", "false")

import pytest
import pytest_asyncio
from fastapi import WebSocketDisconnect
from langchain_core.messages import AIMessage, AIMessageChunk
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.agents.streaming import stream_model_response, response_text
from app.api.routes import chat
from app.database.models.models import Conversation, Message
from app.database.session import Base


class Socket:
    def __init__(self):
        self.events = []
        self.incoming = asyncio.Queue()
        self.first_token = asyncio.Event()

    async def accept(self):
        pass

    async def receive_json(self):
        item = await self.incoming.get()
        if item is None:
            raise WebSocketDisconnect()
        return item

    async def send_json(self, event):
        self.events.append(event)
        if event["type"] == "stream_token":
            self.first_token.set()

    async def wait_for(self, kind):
        async def wait():
            while not any(event["type"] == kind for event in self.events):
                await asyncio.sleep(0)

        await asyncio.wait_for(wait(), 2)
        return next(event for event in self.events if event["type"] == kind)


@pytest_asyncio.fixture
async def database(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    monkeypatch.setattr(chat, "async_session_factory", factory)
    from app.services import jobs, files, approvals
    from app.memory import vector_store
    from app.security.identity import Owner, current_owner

    for module in (jobs, files, approvals, vector_store):
        monkeypatch.setattr(module, "async_session_factory", factory)
    monkeypatch.setattr(
        chat,
        "_authenticate_socket",
        AsyncMock(return_value=Owner(session_id="fixture-guest")),
    )
    monkeypatch.setattr(chat, "_socket_authorized", AsyncMock(return_value=True))
    original_process = chat._process_user_message

    async def owned_process(ws, conversation_id, content, attachments=None):
        token = current_owner.set(Owner(session_id="fixture-guest"))
        try:
            async with factory() as db:
                if not await db.get(Conversation, conversation_id):
                    db.add(
                        Conversation(
                            id=conversation_id,
                            title="Fixture",
                            session_id="fixture-guest",
                        )
                    )
                    await db.commit()
            return await original_process(ws, conversation_id, content, attachments)
        finally:
            current_owner.reset(token)

    monkeypatch.setattr(chat, "_process_user_message", owned_process)
    monkeypatch.setattr(chat, "settings", SimpleNamespace(llm_configured=True))
    monkeypatch.setattr(chat, "broadcast_event", AsyncMock())
    monkeypatch.setattr(chat, "_get_conversation_context", AsyncMock(return_value=""))
    # Tests must not touch external embedding providers or vector storage.
    from app.memory import vector_store

    monkeypatch.setattr(vector_store, "store_message", AsyncMock())
    yield factory
    tasks = list(chat._review_tasks)
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    chat._review_tasks.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_real_tokens_arrive_before_model_finishes():
    gate = asyncio.Event()
    ws = Socket()

    class Model:
        async def astream(self, messages):
            yield AIMessageChunk(content="Hello ")
            await gate.wait()
            yield AIMessageChunk(content="world")

    fallback = AsyncMock()
    task = asyncio.create_task(
        stream_model_response(Model(), [], ws.send_json, "writer", fallback)
    )
    await asyncio.wait_for(ws.first_token.wait(), 1)
    assert not task.done()
    assert ws.events[-1]["token"] == "Hello "
    gate.set()
    response = await task
    assert response.content == "Hello world"
    assert ws.events[-1]["type"] == "stream_end"
    fallback.assert_not_called()


@pytest.mark.asyncio
async def test_tool_arguments_are_accumulated_but_never_shown():
    ws = Socket()

    class Model:
        async def astream(self, messages):
            yield AIMessageChunk(content="Checking sources")
            yield AIMessageChunk(
                content="",
                tool_call_chunks=[
                    {"name": "search", "args": '{"q":', "id": "call1", "index": 0}
                ],
            )
            yield AIMessageChunk(
                content="",
                tool_call_chunks=[
                    {"name": None, "args": '"topic"}', "id": None, "index": 0}
                ],
            )

    response = await stream_model_response(
        Model(), [], ws.send_json, "research", AsyncMock()
    )
    assert response.tool_calls[0]["args"] == {"q": "topic"}
    assert [e["token"] for e in ws.events if e["type"] == "stream_token"] == [
        "Checking sources"
    ]
    assert ws.events[-1]["type"] == "stream_reset"


@pytest.mark.asyncio
async def test_stream_failure_after_visible_text_does_not_repeat_a_request():
    ws = Socket()

    class Model:
        async def astream(self, messages):
            yield AIMessageChunk(content="Partial")
            raise RuntimeError("connection failed")

    fallback = AsyncMock()
    with pytest.raises(RuntimeError, match="connection failed"):
        await stream_model_response(Model(), [], ws.send_json, "writer", fallback)
    fallback.assert_not_called()


@pytest.mark.asyncio
async def test_provider_without_streaming_uses_existing_fallback():
    ws = Socket()

    class Model:
        async def astream(self, messages):
            raise NotImplementedError()
            yield

    fallback = AsyncMock(return_value=AIMessage(content="Available answer"))
    response = await stream_model_response(
        Model(), [], ws.send_json, "writer", fallback
    )
    assert response.content == "Available answer"
    fallback.assert_awaited_once()
    assert ws.events[-1]["type"] == "stream_end"


def test_provider_reasoning_is_not_exposed_as_answer_text():
    assert (
        response_text(
            [
                {"type": "text", "text": "Visible"},
                {"type": "text", "text": "Private", "thought": True},
                {"type": "reasoning", "text": "Internal"},
            ]
        )
        == "Visible"
    )


@pytest.mark.asyncio
async def test_answer_is_saved_and_delivered_before_background_review(
    database, monkeypatch
):
    ws = Socket()
    review_started = asyncio.Event()
    review_gate = asyncio.Event()

    class Model:
        async def ainvoke(self, messages):
            return AIMessage(content="DELEGATE: writer | Write the answer")

        async def astream(self, messages):
            if messages[0].content == "Route":
                yield AIMessageChunk(content="DELEGATE: writer | Write the answer")
                return
            yield AIMessageChunk(content="First paragraph.\n\n")
            yield AIMessageChunk(content="Second paragraph.")

    class Agent:
        def __init__(self, name):
            self.name = name

        tools = []
        max_tool_rounds = 2

        def _build_system_prompt(self, context):
            return "Route" if self.name == "orchestrator" else "Write an answer."

        def _get_fresh_llm(self):
            return Model()

        async def run(self, prompt):
            review_started.set()
            await review_gate.wait()
            return '[CRITIC_REVIEW]{"score": 9}[/CRITIC_REVIEW]\nClear answer.'

    monkeypatch.setattr(
        chat, "_get_cached_agent", AsyncMock(side_effect=lambda name: Agent(name))
    )
    await asyncio.wait_for(
        chat._process_user_message(
            chat._TurnSocket(ws), "chat-1", "Write something useful"
        ),
        2,
    )
    response = await ws.wait_for("response")
    from app.database.models.models import BackgroundJob
    import json

    async with database() as db:
        job = await db.scalar(
            select(BackgroundJob).where(BackgroundJob.kind == "review")
        )
        assert job is not None and job.status == "pending"
        payload = json.loads(job.payload)
    payload.pop("evidence")
    review_task = asyncio.create_task(chat._review_saved_response(ws, **payload))
    chat._review_tasks.add(review_task)
    review_task.add_done_callback(chat._review_tasks.discard)
    await asyncio.wait_for(review_started.wait(), 1)
    assert response["content"] == "First paragraph.\n\nSecond paragraph."
    assert not any(e["type"] == "message_updated" for e in ws.events)
    async with database() as db:
        saved = await db.get(Message, response["message"]["id"])
        assert saved.content == response["content"]
    review_gate.set()
    update = await ws.wait_for("message_updated")
    assert update["id"] == response["message"]["id"]
    assert update["critic_score"] == 9
    assert update["critic_review"] == "Clear answer."


@pytest.mark.asyncio
async def test_parallel_workers_do_not_interleave_answer_streams(database, monkeypatch):
    ws = Socket()
    calls = []

    class Agent:
        def __init__(self, name):
            self.name = name

    monkeypatch.setattr(
        chat, "_get_cached_agent", AsyncMock(side_effect=lambda name: Agent(name))
    )

    async def run(
        agent, prompt, context, websocket, attachments=None, stream=True, routing=False
    ):
        calls.append((agent.name, stream, routing))
        if routing:
            return "PARALLEL: writer, coding | Explain ||| Implement"
        return f"Answer from {agent.name}"

    monkeypatch.setattr(chat, "_run_agent_with_streaming", run)
    monkeypatch.setattr(chat, "_review_saved_response", AsyncMock())
    await chat._process_user_message(
        chat._TurnSocket(ws), "parallel-1", "Explain and implement it"
    )
    assert calls == [
        ("orchestrator", True, True),
        ("writer", False, False),
        ("coding", False, False),
        ("orchestrator", True, False),
    ]
    assert len([e for e in ws.events if e["type"] == "response"]) == 1


@pytest.mark.asyncio
async def test_stop_cancels_work_persists_partial_and_allows_the_next_turn(
    database, monkeypatch
):
    from app.core import rate_limiter

    monkeypatch.setattr(rate_limiter, "check_ws_rate_limit", lambda ws: True)
    ws = Socket()
    cancelled = asyncio.Event()
    async with database() as db:
        db.add(Conversation(id="stop-chat", title="Test"))
        await db.commit()

    async def run(socket, conversation_id, content, attachments):
        await socket.send_json({"type": "stream_start", "agent": "writer"})
        await socket.send_json({"type": "stream_token", "token": content})
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    monkeypatch.setattr(chat, "_process_user_message", run)
    task = asyncio.create_task(chat.chat_websocket(ws, "stop-chat"))
    await ws.incoming.put({"type": "message", "content": "Partial answer"})
    await asyncio.wait_for(ws.first_token.wait(), 1)
    await ws.incoming.put({"type": "message", "content": "Must not overlap"})
    await ws.wait_for("busy")
    await ws.incoming.put({"type": "stop"})
    result = await ws.wait_for("cancelled")
    assert cancelled.is_set()
    assert result["message"]["content"] == "Partial answer"
    assert result["message"]["interrupted"] is True
    async with database() as db:
        saved = list((await db.execute(select(Message))).scalars())
        assert len(saved) == 1 and saved[0].interrupted == 1
    ws.first_token.clear()
    await ws.incoming.put({"type": "message", "content": "Next turn"})
    await asyncio.wait_for(ws.first_token.wait(), 1)
    await ws.incoming.put(None)
    await asyncio.wait_for(task, 1)
    async with database() as db:
        saved = list((await db.execute(select(Message))).scalars())
        assert [m.content for m in saved] == ["Partial answer", "Next turn"]


@pytest.mark.asyncio
async def test_interrupted_column_migrates_old_databases_without_losing_messages(
    monkeypatch,
):
    from sqlalchemy import text
    from sqlalchemy.schema import CreateTable
    from app.database import session

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    definition = str(CreateTable(Message.__table__).compile(engine.sync_engine))
    definition = "\n".join(
        line for line in definition.splitlines() if "interrupted" not in line
    )
    async with engine.begin() as conn:
        await conn.execute(text(definition))
        await conn.execute(
            text(
                "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (1, 'old', 'agent', 'Preserve me', CURRENT_TIMESTAMP)"
            )
        )
    monkeypatch.setattr(session, "engine", engine)
    await session.init_db()
    await session.init_db()  # Migration is idempotent.
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text("SELECT content, interrupted FROM messages WHERE id = 1")
            )
        ).one()
        assert row == ("Preserve me", 0)
    await engine.dispose()


@pytest.mark.asyncio
async def test_interrupted_provider_reply_is_saved_before_error(database, monkeypatch):
    ws = Socket()

    class Agent:
        def __init__(self, name):
            self.name = name

    monkeypatch.setattr(
        chat, "_get_cached_agent", AsyncMock(side_effect=lambda name: Agent(name))
    )

    async def run(
        agent, prompt, context, websocket, attachments=None, stream=True, routing=False
    ):
        if routing:
            return "DELEGATE: writer | Write it"
        await websocket.send_json({"type": "stream_start", "agent": agent.name})
        await websocket.send_json(
            {"type": "stream_token", "token": "Useful partial text"}
        )
        raise RuntimeError("Provider disconnected")

    monkeypatch.setattr(chat, "_run_agent_with_streaming", run)
    await chat._process_user_message(
        chat._TurnSocket(ws), "error-chat", "Write something"
    )
    error = await ws.wait_for("error")
    assert error["message"]["content"] == "Useful partial text"
    async with database() as db:
        saved = await db.get(Message, error["message"]["id"])
        assert saved.interrupted == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "text,visible",
    [
        ("  DELEGATE: writer | write it", False),
        ("PARALLEL: coding, writer | work", False),
        ("Parallel programming is useful.", True),
        ("Design it simply.", True),
    ],
)
async def test_routing_prefixes_stay_private_across_chunk_boundaries(text, visible):
    ws = Socket()

    class Model:
        async def astream(self, messages):
            for char in text:
                yield AIMessageChunk(content=char)

    result = await stream_model_response(
        Model(), [], ws.send_json, "orchestrator", AsyncMock(), routing=True
    )
    assert result.content == text
    delivered = "".join(e["token"] for e in ws.events if e["type"] == "stream_token")
    assert delivered == (text if visible else "")


@pytest.mark.asyncio
async def test_tool_results_feed_the_next_streaming_round():
    ws = Socket()
    seen = []

    class Model:
        async def astream(self, messages):
            seen.append(list(messages))
            if len(seen) == 1:
                yield AIMessageChunk(
                    content="",
                    tool_call_chunks=[
                        {
                            "name": "lookup",
                            "args": '{"topic":"test"}',
                            "id": "one",
                            "index": 0,
                        }
                    ],
                )
            else:
                yield AIMessageChunk(content="Verified result")

    model = Model()
    tool = SimpleNamespace(name="lookup", ainvoke=AsyncMock(return_value="Source data"))
    agent = SimpleNamespace(
        name="research",
        tools=[tool],
        max_tool_rounds=3,
        _build_system_prompt=lambda _: "Help",
        _get_fresh_llm=lambda: model,
    )
    result = await chat._run_agent_with_streaming(agent, "Look up test", "", ws)
    assert result == "Verified result"
    assert seen[1][-1].content == "Source data"
    tool.ainvoke.assert_awaited_once_with({"topic": "test"})
    assert [e["type"] for e in ws.events] == [
        "tool_call",
        "tool_result",
        "stream_start",
        "stream_token",
        "stream_end",
    ]


@pytest.mark.asyncio
async def test_stop_after_commit_returns_the_saved_answer_without_a_duplicate(
    database, monkeypatch
):
    from app.core import rate_limiter

    monkeypatch.setattr(rate_limiter, "check_ws_rate_limit", lambda ws: True)
    ws = Socket()
    committed = asyncio.Event()
    async with database() as db:
        db.add(Conversation(id="commit-stop", title="Test"))
        await db.commit()

    async def run(socket, conversation_id, content, attachments):
        await socket.send_json({"type": "stream_start", "agent": "writer"})
        await socket.send_json({"type": "stream_token", "token": "Finished answer"})
        async with database() as db:
            message = Message(
                conversation_id=conversation_id,
                role="agent",
                agent_name="writer",
                content="Finished answer",
            )
            db.add(message)
            await db.commit()
            socket.record_saved_response(message.to_dict())
        committed.set()
        await asyncio.Event().wait()  # Simulate delivery pending after commit.

    monkeypatch.setattr(chat, "_process_user_message", run)
    task = asyncio.create_task(chat.chat_websocket(ws, "commit-stop"))
    await ws.incoming.put({"type": "message", "content": "Start"})
    await asyncio.wait_for(committed.wait(), 1)
    await ws.incoming.put({"type": "stop"})
    result = await ws.wait_for("cancelled")
    assert result["message"]["content"] == "Finished answer"
    assert result["message"]["interrupted"] is False
    await ws.incoming.put(None)
    await task
    async with database() as db:
        messages = (await db.scalars(select(Message))).all()
        assert len(messages) == 1


@pytest.mark.asyncio
async def test_next_turn_can_start_while_delivered_turn_finishes_notifications(
    database, monkeypatch
):
    from app.core import rate_limiter

    monkeypatch.setattr(rate_limiter, "check_ws_rate_limit", lambda ws: True)
    ws = Socket()
    cleanup_gate = asyncio.Event()
    calls = []
    jobs = []

    async def run(socket, conversation_id, content, attachments):
        jobs.append(asyncio.current_task())
        calls.append(content)
        await socket.send_json({"type": "response", "content": content})
        if content == "First":
            await cleanup_gate.wait()

    monkeypatch.setattr(chat, "_process_user_message", run)
    connection = asyncio.create_task(chat.chat_websocket(ws, "next-turn"))
    try:
        await ws.incoming.put({"type": "message", "content": "First"})
        await ws.wait_for("response")
        await ws.incoming.put({"type": "message", "content": "Second"})

        async def wait_for_second():
            while len(calls) < 2:
                await asyncio.sleep(0)

        await asyncio.wait_for(wait_for_second(), 1)
        assert calls == ["First", "Second"]
        assert not any(event["type"] == "busy" for event in ws.events)
    finally:
        cleanup_gate.set()
        await ws.incoming.put(None)
        await connection
        await asyncio.gather(*jobs)
