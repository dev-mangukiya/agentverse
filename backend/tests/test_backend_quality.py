import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from langchain_core.messages import AIMessage, AIMessageChunk
from sqlalchemy import select

from app.agents import base, tool_execution
from app.agents.quality import build_review_prompt, parse_review
from app.agents.streaming import stream_model_response
from app.api.routes import chat
from app.database.models.models import Conversation, Message
from test_chat_experience import database, Socket

real_get_context = chat._get_conversation_context


def test_review_receives_full_request_answer_context_and_evidence():
    request = (
        "Follow these instructions: " + "x" * 1500 + " Final constraint: Spanish only."
    )
    answer = "A" * 4500 + "\nSources: https://example.org/verified"
    prompt, partial = build_review_prompt(
        request, answer, "User asked for a short email.", "Source confirms this figure."
    )
    payload = json.loads(prompt.split("\n\n", 1)[1])
    assert payload["request"] == request
    assert payload["answer"] == answer
    assert payload["conversation_context"] == "User asked for a short email."
    assert payload["tool_evidence"] == "Source confirms this figure."
    assert partial is False


@pytest.mark.parametrize("score", [None, True, 0, 11, 8.5, "9"])
def test_invalid_scores_are_not_converted_to_low_scores(score):
    raw = "[CRITIC_REVIEW]" + json.dumps({"score": score}) + "[/CRITIC_REVIEW]\nReview."
    with pytest.raises(ValueError):
        parse_review(raw)


def test_partial_context_is_explicit_and_cannot_receive_a_score():
    prompt, partial = build_review_prompt("Question", "start" + "x" * 65000 + "finish")
    assert partial
    assert "start" in prompt and "finish" in prompt and "Middle omitted" in prompt
    score, review = parse_review(
        '[CRITIC_REVIEW]{"score": null}[/CRITIC_REVIEW]\nCannot judge omitted material.',
        partial,
    )
    assert score is None
    assert review.startswith("Partial review")
    with pytest.raises(ValueError):
        parse_review("Agent critic encountered an error: provider unavailable")


@pytest.mark.asyncio
async def test_read_tools_overlap_but_actions_form_ordered_barriers(monkeypatch):
    monkeypatch.setattr(
        tool_execution,
        "get_settings",
        lambda: SimpleNamespace(max_parallel_tools=3, tool_timeout_seconds=1),
    )
    gate, reads_started = asyncio.Event(), asyncio.Event()
    events = []

    class Tool:
        def __init__(self, name):
            self.name = name

        async def ainvoke(self, args):
            events.append(("start", args["id"]))
            if args["id"] in (1, 2, 3):
                if len(events) == 3:
                    reads_started.set()
                await gate.wait()
            events.append(("end", args["id"]))
            return str(args["id"])

    calls = [
        {
            "id": str(i),
            "name": "write_file" if i == 4 else "fetch_url",
            "args": {"id": i},
        }
        for i in range(1, 6)
    ]
    task = asyncio.create_task(
        tool_execution.execute_tool_calls(
            calls, [Tool("fetch_url"), Tool("write_file")]
        )
    )
    await asyncio.wait_for(reads_started.wait(), 1)
    assert all(event[0] == "start" for event in events)
    gate.set()
    assert await task == ["1", "2", "3", "4", "5"]
    assert events.index(("start", 4)) > max(events.index(("end", i)) for i in (1, 2, 3))
    assert events.index(("end", 4)) < events.index(("start", 5))


@pytest.mark.asyncio
async def test_tool_timeout_is_bounded_and_stopping_cancels_every_active_read(
    monkeypatch,
):
    monkeypatch.setattr(
        tool_execution,
        "get_settings",
        lambda: SimpleNamespace(max_parallel_tools=2, tool_timeout_seconds=0.02),
    )
    active = set()

    class Tool:
        name = "fetch_url"

        async def ainvoke(self, args):
            active.add(args["id"])
            try:
                await asyncio.Event().wait()
            finally:
                active.remove(args["id"])

    calls = [{"id": str(i), "name": "fetch_url", "args": {"id": i}} for i in range(4)]
    results = await tool_execution.execute_tool_calls(calls[:1], [Tool()])
    assert "timed out" in results[0]
    assert not active
    monkeypatch.setattr(
        tool_execution,
        "get_settings",
        lambda: SimpleNamespace(max_parallel_tools=2, tool_timeout_seconds=1),
    )
    task = asyncio.create_task(tool_execution.execute_tool_calls(calls, [Tool()]))
    for _ in range(20):
        await asyncio.sleep(0)
        if len(active) == 2:
            break
    assert len(active) == 2
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not active


@pytest.mark.asyncio
async def test_retry_preserves_tools_and_does_not_retry_the_failed_stream(monkeypatch):
    failing = SimpleNamespace(
        model="google-model",
        temperature=0,
        google_api_key="test-key",
        ainvoke=AsyncMock(),
    )
    original = SimpleNamespace(
        bound=failing,
        kwargs={"tools": ["provider-specific-schema"], "thinking_budget": 0},
    )
    canonical_tools = [SimpleNamespace(name="web_search")]
    bound_fallback = SimpleNamespace(
        ainvoke=AsyncMock(return_value=AIMessage(content="Verified answer"))
    )

    class Replacement:
        model = "other-provider"

        def bind_tools(self, tools):
            assert tools is canonical_tools
            return bound_fallback

    replacement = Replacement()
    monkeypatch.setattr(base, "_get_fallback_llm", lambda **kwargs: replacement)
    manager = SimpleNamespace(mark_rate_limited=lambda key: None)
    monkeypatch.setattr(base, "_google_key_manager", manager)
    response = await base._invoke_with_retry(
        original, [], initial_error=RuntimeError("429 quota"), tools=canonical_tools
    )
    assert response.content == "Verified answer"
    failing.ainvoke.assert_not_awaited()
    bound_fallback.ainvoke.assert_awaited_once()


@pytest.mark.asyncio
async def test_non_transient_stream_error_is_not_replayed(monkeypatch):
    class Model:
        ainvoke = AsyncMock()

        async def astream(self, messages):
            raise ValueError("Invalid model")
            yield

    model = Model()
    with pytest.raises(ValueError, match="Invalid model"):
        await stream_model_response(
            model, [], AsyncMock(), "writer", base._invoke_with_retry
        )
    model.ainvoke.assert_not_awaited()


@pytest.mark.asyncio
async def test_retries_do_not_repeat_an_exhausted_fallback(monkeypatch):
    model = SimpleNamespace(
        ainvoke=AsyncMock(side_effect=RuntimeError("503 unavailable"))
    )
    monkeypatch.setattr(base, "_get_fallback_llm", lambda **kwargs: model)
    with pytest.raises(RuntimeError, match="503"):
        await base._invoke_with_retry(model, [])
    model.ainvoke.assert_awaited_once()


@pytest.mark.asyncio
async def test_synthesis_preserves_original_constraints_and_does_not_route_again(
    database, monkeypatch
):
    ws = chat._TurnSocket(Socket())
    request = "Compare these ideas in Spanish, in at most 100 words."
    monkeypatch.setattr(
        chat,
        "_get_conversation_context",
        AsyncMock(return_value="Important prior context"),
    )
    monkeypatch.setattr(
        chat,
        "_get_cached_agent",
        AsyncMock(side_effect=lambda name: SimpleNamespace(name=name)),
    )
    monkeypatch.setattr(chat, "_review_saved_response", AsyncMock())

    async def run(
        agent, prompt, context, socket, attachments=None, stream=True, routing=False
    ):
        if routing:
            return "PARALLEL: coding, writer | Technical perspective ||| Writing perspective"
        if agent.name == "orchestrator":
            assert request in prompt
            assert context == "Important prior context"
            assert agent.tools == []
            assert "Do not delegate" in agent.system_prompt.replace("\n", " ")
            return "Respuesta final"
        return f"Output from {agent.name}"

    monkeypatch.setattr(chat, "_run_agent_with_streaming", run)
    await chat._process_user_message(ws, "synthesis-test", request)
    assert (
        next(event for event in ws.websocket.events if event["type"] == "response")[
            "content"
        ]
        == "Respuesta final"
    )


@pytest.mark.asyncio
async def test_writer_waits_for_research_and_avoids_a_redundant_synthesis(
    database, monkeypatch
):
    ws = chat._TurnSocket(Socket())
    calls = []
    monkeypatch.setattr(
        chat,
        "_get_cached_agent",
        AsyncMock(side_effect=lambda name: SimpleNamespace(name=name)),
    )
    monkeypatch.setattr(chat, "_review_saved_response", AsyncMock())

    async def run(
        agent, prompt, context, socket, attachments=None, stream=True, routing=False
    ):
        calls.append(agent.name)
        if routing:
            return "PARALLEL: writer, research | Write an article using the research ||| Find sources"
        if agent.name == "research":
            assert not stream
            return "Verified source: https://example.org/source"
        assert agent.name == "writer"
        assert "https://example.org/source" in context
        assert stream
        await socket.send_json({"type": "stream_start", "agent": "writer"})
        await socket.send_json({"type": "stream_token", "token": "Grounded article"})
        return "Grounded article"

    monkeypatch.setattr(chat, "_run_agent_with_streaming", run)
    await chat._process_user_message(
        ws, "dependency-test", "Research a topic and write an article."
    )
    assert calls == ["orchestrator", "research", "writer"]
    assert (
        len([event for event in ws.websocket.events if event["type"] == "stream_start"])
        == 1
    )
    assert (
        next(event for event in ws.websocket.events if event["type"] == "response")[
            "content"
        ]
        == "Grounded article"
    )


@pytest.mark.asyncio
async def test_invalid_review_does_not_save_a_fake_score(database, monkeypatch):
    async with database() as db:
        db.add(Conversation(id="review-test", title="Test"))
        message = Message(conversation_id="review-test", role="agent", content="Answer")
        db.add(message)
        await db.commit()
        message_id = message.id
    critic = SimpleNamespace(
        run=AsyncMock(
            return_value='[CRITIC_REVIEW]{"summary":"No score"}[/CRITIC_REVIEW]\nReview'
        )
    )
    monkeypatch.setattr(chat, "_get_cached_agent", AsyncMock(return_value=critic))
    await chat._review_saved_response(
        Socket(), message_id, "writer", "Request", "Answer"
    )
    async with database() as db:
        message = await db.get(Message, message_id)
        assert message.critic_score is None and message.critic_review is None


@pytest.mark.asyncio
async def test_recent_long_answer_is_preserved_for_follow_up_context(
    database, monkeypatch
):
    monkeypatch.setattr(chat, "async_session_factory", database)
    async with database() as db:
        db.add(Conversation(id="context-test", title="Test"))
        db.add(
            Message(
                conversation_id="context-test",
                role="agent",
                content="x" * 4000 + "Important code at the end.",
            )
        )
        db.add(
            Message(
                conversation_id="context-test",
                role="user",
                content="Fix that final line.",
            )
        )
        await db.commit()
    context = await real_get_context("context-test")
    assert "Important code at the end." in context
    assert "Fix that final line." not in context


@pytest.mark.asyncio
async def test_exhausted_tool_budget_still_produces_an_answer_from_results():
    tool = SimpleNamespace(
        name="fetch_url", ainvoke=AsyncMock(return_value="Verified fact from source.")
    )

    class Model:
        async def astream(self, messages):
            assert "Verified fact from source." in str(messages)
            assert "tool budget is exhausted" in messages[-1].content
            yield AIMessageChunk(content="Here is the supported answer.")

    class Bound:
        bound = Model()
        kwargs = {"tools": [tool]}

        async def astream(self, messages):
            yield AIMessageChunk(
                content="",
                tool_call_chunks=[
                    {
                        "name": "fetch_url",
                        "args": '{"url":"https://example.org"}',
                        "id": "one",
                        "index": 0,
                    }
                ],
            )

    agent = SimpleNamespace(
        name="research",
        tools=[tool],
        max_tool_rounds=1,
        _get_fresh_llm=lambda: Bound(),
        _build_system_prompt=lambda context: "Research the topic.",
    )
    ws = chat._TurnSocket(Socket())
    result = await chat._run_agent_with_streaming(agent, "Question", "", ws)
    assert result == "Here is the supported answer."
    assert "Verified fact" in "\n".join(ws.evidence)
    tool.ainvoke.assert_awaited_once()


def test_routing_disables_thinking_only_for_supported_flash_models(monkeypatch):
    from app.agents import orchestrator

    for name, expected in [
        ("gemini-2.5-flash", True),
        ("gemini-2.5-pro", False),
        ("claude-sonnet-4-6", False),
    ]:
        calls = []

        class Model:
            model = name

            def bind(self, **kwargs):
                calls.append(kwargs)
                return self

        model = Model()
        monkeypatch.setattr(orchestrator, "get_llm", lambda **kwargs: model)
        assert orchestrator.OrchestratorAgent()._get_routing_llm() is model
        assert bool(calls) == expected
        if expected:
            assert calls == [{"thinking_budget": 0}]


def test_comma_separated_google_keys_are_recognized_as_configured():
    from app.core.config import Settings

    settings = Settings(
        _env_file=None,
        google_api_keys="test-a,test-b",
        google_api_key=None,
        anthropic_api_key=None,
        openai_api_key=None,
        huggingface_api_key=None,
    )
    assert settings.llm_configured
