"""Production regressions: unavailable hosted models and strict memory filters."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from langchain_core.messages import AIMessage, AIMessageChunk

from app.agents import base
from app.agents.streaming import stream_model_response
from app.memory import vector_store


@pytest.mark.asyncio
@pytest.mark.parametrize("streaming", [True, False])
async def test_stopping_a_silent_request_cancels_it_without_fallback(
    monkeypatch, streaming
):
    entered = asyncio.Event()
    stopped = asyncio.Event()

    class Model:
        async def ainvoke(self, messages):
            entered.set()
            try:
                await asyncio.Event().wait()
            finally:
                stopped.set()

        async def astream(self, messages):
            await self.ainvoke(messages)
            yield

    monkeypatch.setattr(
        base,
        "_get_fallback_llm",
        lambda **kwargs: pytest.fail("A cancelled turn must not retry"),
    )
    model = Model()
    call = (
        stream_model_response(
            model, [], AsyncMock(), "orchestrator", base._invoke_with_retry
        )
        if streaming
        else base._invoke_with_retry(model, [])
    )
    task = asyncio.create_task(call)
    await asyncio.wait_for(entered.wait(), 1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert stopped.is_set()


@pytest.mark.asyncio
async def test_silence_after_visible_text_keeps_partial_answer_without_replaying(
    monkeypatch,
):
    monkeypatch.setattr(base.get_settings(), "model_attempt_timeout_seconds", 0.05)

    class Model:
        async def astream(self, messages):
            yield AIMessageChunk(content="Already received text")
            while True:
                await asyncio.sleep(0.01)
                yield AIMessageChunk(content="")

    emit, fallback = AsyncMock(), AsyncMock()
    with pytest.raises(TimeoutError):
        await stream_model_response(Model(), [], emit, "writer", fallback)
    fallback.assert_not_called()
    assert [
        c.args[0]["token"]
        for c in emit.await_args_list
        if c.args[0]["type"] == "stream_token"
    ] == ["Already received text"]


@pytest.mark.asyncio
async def test_silent_router_and_silent_fallback_recover_before_routing_deadline(
    monkeypatch,
):
    from app.api.routes import chat
    from app.agents.orchestrator import OrchestratorAgent

    monkeypatch.setattr(base.get_settings(), "routing_timeout_seconds", 0.3)
    cancelled = []

    class SilentStream:
        async def astream(self, messages):
            try:
                yield AIMessageChunk(content="")  # Metadata is not an answer.
                await asyncio.Event().wait()
            finally:
                cancelled.append("stream")

    async def silent_invoke(messages):
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.append("invoke")

    slow = SimpleNamespace(ainvoke=AsyncMock(side_effect=silent_invoke))
    healthy = SimpleNamespace(
        ainvoke=AsyncMock(
            return_value=AIMessage(content="What would you like to know about Jo?")
        )
    )
    replacements = iter([slow, healthy])
    monkeypatch.setattr(base, "_get_fallback_llm", lambda **kwargs: next(replacements))
    agent = OrchestratorAgent()
    monkeypatch.setattr(agent, "_get_routing_llm", lambda: SilentStream())
    socket = SimpleNamespace(send_json=AsyncMock())

    reply = await chat._run_agent_with_streaming(
        agent, "jo", "The user is choosing a research topic.", socket, routing=True
    )

    assert reply == "What would you like to know about Jo?"
    assert cancelled == ["stream", "invoke"]
    healthy.ainvoke.assert_awaited_once()
    assert [c.args[0]["type"] for c in socket.send_json.await_args_list] == [
        "stream_start",
        "stream_token",
        "stream_end",
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", [httpx.ReadTimeout(""), httpx.ConnectError("")])
async def test_sdk_transport_failures_recover_even_without_error_text(
    monkeypatch, failure
):
    healthy = SimpleNamespace(
        ainvoke=AsyncMock(return_value=AIMessage(content="Recovered"))
    )
    monkeypatch.setattr(base, "_get_fallback_llm", lambda **kwargs: healthy)
    reply = await base._invoke_with_retry(SimpleNamespace(), [], initial_error=failure)
    assert reply.content == "Recovered"
    healthy.ainvoke.assert_awaited_once()


@pytest.mark.asyncio
async def test_switch_to_google_applies_fast_routing_settings(
    exhausted_hf, monkeypatch
):
    from app.api.routes import chat
    from app.agents.orchestrator import OrchestratorAgent
    from langchain_google_genai import ChatGoogleGenerativeAI

    primary, _ = exhausted_hf
    google = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash", google_api_key="unit-test-key"
    )
    called = []

    async def answer(self, messages, config=None, **kwargs):
        called.append(kwargs)
        return AIMessage(content="Could you clarify your topic?")

    monkeypatch.setattr(ChatGoogleGenerativeAI, "ainvoke", answer)
    monkeypatch.setattr(base, "_get_fallback_llm", lambda **kwargs: google)
    agent = OrchestratorAgent()
    monkeypatch.setattr(agent, "_get_routing_llm", lambda: primary)

    assert (
        await chat._run_agent_with_streaming(
            agent, "jo", "", SimpleNamespace(send_json=AsyncMock()), routing=True
        )
        == "Could you clarify your topic?"
    )
    assert called[0]["thinking_budget"] == 0


@pytest.mark.asyncio
async def test_direct_answer_can_keep_streaming_after_routing_deadline(monkeypatch):
    from app.api.routes import chat
    from app.agents.orchestrator import OrchestratorAgent

    monkeypatch.setattr(base.get_settings(), "routing_timeout_seconds", 0.1)

    class Answer:
        async def astream(self, messages):
            yield AIMessageChunk(content="The answer ")
            await asyncio.sleep(0.15)
            yield AIMessageChunk(content="is complete.")

    agent = OrchestratorAgent()
    monkeypatch.setattr(agent, "_get_routing_llm", lambda: Answer())
    socket = SimpleNamespace(send_json=AsyncMock())
    assert (
        await chat._run_agent_with_streaming(
            agent, "Explain this", "", socket, routing=True
        )
        == "The answer is complete."
    )
    assert [
        c.args[0]["token"]
        for c in socket.send_json.await_args_list
        if c.args[0]["type"] == "stream_token"
    ] == ["The answer ", "is complete."]


@pytest.fixture
def exhausted_hf(monkeypatch):
    """Use the installed chat adapter and the exception the HF SDK actually raises."""
    from huggingface_hub.utils import hf_raise_for_status
    from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint

    monkeypatch.setattr(base, "_hf_credit_retry_at", 0.0)
    endpoint = HuggingFaceEndpoint(
        repo_id="Qwen/Qwen2.5-72B-Instruct",
        huggingfacehub_api_token="hf_unit_test_not_a_real_key",
    )
    model = ChatHuggingFace(llm=endpoint, temperature=0)
    response = httpx.Response(
        402,
        json={"error": "Purchase pre-paid credits to continue"},
        request=httpx.Request(
            "POST", "https://router.huggingface.co/v1/chat/completions"
        ),
    )
    from huggingface_hub.errors import HfHubHTTPError

    with pytest.raises(HfHubHTTPError) as failure:
        hf_raise_for_status(response)
    request = AsyncMock(side_effect=failure.value)
    monkeypatch.setattr(endpoint.async_client, "chat_completion", request)
    return model, request


@pytest.mark.asyncio
async def test_credit_rejection_recovers_real_chat_turns_and_rechecks_after_cooldown(
    exhausted_hf, monkeypatch
):
    from app.api.routes import chat
    from app.agents.orchestrator import OrchestratorAgent

    model, hf_request = exhausted_hf
    clock = SimpleNamespace(now=1000.0)
    monkeypatch.setattr(base, "time", SimpleNamespace(monotonic=lambda: clock.now))
    agent = OrchestratorAgent()
    monkeypatch.setattr(agent, "_get_routing_llm", lambda: model)
    calls = []

    class Google:
        async def ainvoke(self, messages):
            calls.append("invoke")
            return AIMessage(content="The fallback answered.")

        async def astream(self, messages):
            calls.append("stream")
            yield AIMessageChunk(content="The fallback streamed.")

    monkeypatch.setattr(base, "_get_fallback_llm", lambda **kwargs: Google())

    async def turn():
        return await chat._run_agent_with_streaming(
            agent,
            "Explain gravity.",
            "",
            SimpleNamespace(send_json=AsyncMock()),
            routing=True,
        )

    assert await turn() == "The fallback answered."
    assert await turn() == "The fallback streamed."
    assert hf_request.await_count == 1
    clock.now += base._HF_CREDIT_COOLDOWN_SECONDS + 1
    assert await turn() == "The fallback answered."
    assert hf_request.await_count == 2
    assert calls == ["invoke", "stream", "invoke"]


@pytest.mark.asyncio
async def test_hf_billing_does_not_retry_a_different_model_on_the_same_account(
    exhausted_hf, monkeypatch
):
    from app.api.routes.chat import _reply_error_message

    model, hf_request = exhausted_hf
    monkeypatch.setattr(
        base, "_google_key_manager", SimpleNamespace(get_available_count=lambda: 0)
    )
    monkeypatch.setattr(
        base,
        "get_settings",
        lambda: SimpleNamespace(
            max_retries=2,
            huggingface_api_key="hf_test",
            model_attempt_timeout_seconds=30,
        ),
    )
    with pytest.raises(base.HuggingFaceCreditsExhausted) as caught:
        await base._invoke_with_retry(model, ["Explain gravity."])
    assert "credits" in _reply_error_message(caught.value)
    with pytest.raises(base.HuggingFaceCreditsExhausted):
        base.available_model(model, [])
    hf_request.assert_awaited_once()


def test_known_credit_outage_rebinds_specialist_tools_for_the_fallback(monkeypatch):
    from unittest.mock import Mock

    monkeypatch.setattr(base, "_hf_credit_retry_at", float("inf"))
    primary = SimpleNamespace(_llm_type="huggingface-chat-wrapper")
    bound = SimpleNamespace(bound=primary, kwargs={"tools": ["HF schema"]})
    google = Mock()
    google.bind_tools.return_value = object()
    monkeypatch.setattr(base, "_get_fallback_llm", lambda **kwargs: google)
    tool = object()
    assert base.available_model(bound, [tool]) is google.bind_tools.return_value
    google.bind_tools.assert_called_once_with([tool])


def provider_error(status=400, code="model_not_supported"):
    response = httpx.Response(
        status,
        json={"error": {"code": code, "message": "Model is not enabled"}},
        request=httpx.Request(
            "POST", "https://router.huggingface.co/v1/chat/completions"
        ),
    )
    return httpx.HTTPStatusError(
        "Provider rejected the request", request=response.request, response=response
    )


@pytest.mark.asyncio
async def test_unsupported_model_falls_back_before_streaming_without_replaying_it(
    monkeypatch,
):
    class Model:
        temperature = None
        ainvoke = AsyncMock()

        async def astream(self, _):
            raise provider_error()
            yield

    replacement = SimpleNamespace(
        ainvoke=AsyncMock(return_value=AIMessage(content="Connection works."))
    )

    def fallback(**kwargs):
        assert kwargs["temperature"] == 0.3
        return replacement

    monkeypatch.setattr(base, "_get_fallback_llm", fallback)
    emit = AsyncMock()
    model = Model()
    result = await stream_model_response(
        model, [], emit, "orchestrator", base._invoke_with_retry, routing=True
    )
    assert result.content == "Connection works."
    model.ainvoke.assert_not_awaited()
    replacement.ainvoke.assert_awaited_once()
    assert [call.args[0]["type"] for call in emit.await_args_list] == [
        "stream_start",
        "stream_token",
        "stream_end",
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status,code",
    [
        (400, "invalid_request_error"),
        (401, "model_not_supported"),
        (403, "model_not_supported"),
    ],
)
async def test_configuration_and_authentication_errors_do_not_trigger_model_fallback(
    monkeypatch, status, code
):
    monkeypatch.setattr(
        base, "_get_fallback_llm", lambda **kwargs: pytest.fail("Unexpected fallback")
    )
    error = provider_error(status, code)
    with pytest.raises(httpx.HTTPStatusError) as caught:
        await base._invoke_with_retry(SimpleNamespace(), [], initial_error=error)
    assert caught.value is error


@pytest.mark.asyncio
async def test_unsupported_model_without_an_alternative_remains_a_real_error(
    monkeypatch,
):
    monkeypatch.setattr(base, "_get_fallback_llm", lambda **kwargs: None)
    error = provider_error()
    with pytest.raises(httpx.HTTPStatusError) as caught:
        await base._invoke_with_retry(SimpleNamespace(), [], initial_error=error)
    assert caught.value is error
    assert base._is_model_unavailable_error(error)


def test_huggingface_chat_receives_the_routing_temperature(monkeypatch):
    monkeypatch.setattr(base, "_llm_cache", {})
    monkeypatch.setattr(
        base,
        "get_settings",
        lambda: SimpleNamespace(
            default_model_provider="huggingface",
            default_model="Qwen/Qwen2.5-72B-Instruct",
            google_api_key_list=[],
            openai_api_key=None,
            anthropic_api_key=None,
            huggingface_api_key="hf_unit_test_not_a_real_key",
            max_output_tokens=2048,
        ),
    )
    llm = base.get_llm(temperature=0)
    assert llm.temperature == 0
    assert llm._default_params["temperature"] == 0


@pytest.mark.asyncio
async def test_existing_cloud_collection_is_indexed_before_filtered_delete(monkeypatch):
    from qdrant_client.models import PayloadSchemaType

    monkeypatch.setattr(vector_store, "_indexed_collections", set())
    indexed = {"owner_key": SimpleNamespace(data_type=PayloadSchemaType.KEYWORD)}

    async def create_index(collection, *, field_name, field_schema, wait):
        assert collection == "previous-collection" and wait
        assert field_schema == PayloadSchemaType.KEYWORD
        indexed[field_name] = SimpleNamespace(data_type=field_schema)
        return SimpleNamespace(status="completed")

    async def delete(collection, *, points_selector, wait):
        assert collection == "previous-collection" and wait
        condition = points_selector.filter.must[0]
        assert condition.key in indexed, "Strict mode rejects unindexed deletes"
        assert condition.match.value == "deleted-chat"
        return SimpleNamespace(status="completed")

    client = SimpleNamespace(
        collection_exists=AsyncMock(return_value=True),
        get_collection=AsyncMock(return_value=SimpleNamespace(payload_schema=indexed)),
        create_payload_index=AsyncMock(side_effect=create_index),
        delete=AsyncMock(side_effect=delete),
    )
    monkeypatch.setattr(vector_store, "_get_qdrant", AsyncMock(return_value=client))
    assert await vector_store.delete_conversation_memory(
        "deleted-chat", collection="previous-collection"
    )
    assert await vector_store.delete_conversation_memory(
        "deleted-chat", collection="previous-collection"
    )
    client.create_payload_index.assert_awaited_once()
    client.get_collection.assert_awaited_once()


@pytest.mark.asyncio
async def test_index_failure_is_not_cached_and_cleanup_can_retry(monkeypatch):
    monkeypatch.setattr(vector_store, "_indexed_collections", set())
    client = SimpleNamespace(
        collection_exists=AsyncMock(return_value=True),
        get_collection=AsyncMock(return_value=SimpleNamespace(payload_schema={})),
        create_payload_index=AsyncMock(
            return_value=SimpleNamespace(status="acknowledged")
        ),
        delete=AsyncMock(return_value=SimpleNamespace(status="completed")),
    )
    monkeypatch.setattr(vector_store, "_get_qdrant", AsyncMock(return_value=client))
    with pytest.raises(RuntimeError, match="not ready"):
        await vector_store.delete_conversation_memory("chat")
    client.delete.assert_not_awaited()
    client.create_payload_index.return_value = SimpleNamespace(status="completed")
    assert await vector_store.delete_conversation_memory("chat")
    assert client.get_collection.await_count == 2
