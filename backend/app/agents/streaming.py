"""Deliver provider text as it arrives while retaining complete tool-call messages."""
from collections.abc import Awaitable, Callable

from langchain_core.messages import AIMessage


def response_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            part if isinstance(part, str) else part.get("text", "")
            for part in content
            if isinstance(part, str) or (
                isinstance(part, dict)
                and part.get("type", "text") == "text"
                and not part.get("thought")
            )
        )
    return ""


async def stream_model_response(
    llm, messages, emit: Callable[[dict], Awaitable[None]], agent: str,
    fallback: Callable[..., Awaitable[AIMessage]], routing: bool = False,
):
    """Never replay a partial answer after failure, or expose tool arguments.

    Some providers emit a short preamble before choosing a tool. Reset that
    provisional text in place when tool-call chunks arrive. Routing prefixes
    stay private; direct coordinator answers can still stream immediately.
    """
    response = None
    started = False
    tool_call = False
    prefix = ""
    route_decided = not routing
    private_route = False
    directives = ("DELEGATE:", "PARALLEL:")
    try:
        async for chunk in llm.astream(messages):
            response = chunk if response is None else response + chunk
            if getattr(chunk, "tool_call_chunks", None) or getattr(chunk, "tool_calls", None):
                tool_call = True
                if started:
                    await emit({"type": "stream_reset", "agent": agent})
                    started = False
            text = response_text(chunk.content)
            if text and not route_decided:
                prefix += text
                candidate = prefix.lstrip().upper()
                if any(candidate.startswith(marker) for marker in directives):
                    route_decided = True
                    private_route = True
                elif candidate and not any(marker.startswith(candidate) for marker in directives):
                    route_decided = True
                    text = prefix
                else:
                    continue
            if text and not tool_call and not private_route:
                if not started:
                    await emit({"type": "stream_start", "agent": agent})
                    started = True
                await emit({"type": "stream_token", "agent": agent, "token": text})
    except Exception:
        if started or tool_call:
            raise  # Don't silently re-run a partially delivered answer/tool call.
        response = await fallback(llm, messages)
        text = response_text(response.content)
        private_route = routing and text.lstrip().upper().startswith(directives)
        if text and not getattr(response, "tool_calls", None) and not private_route:
            await emit({"type": "stream_start", "agent": agent})
            await emit({"type": "stream_token", "agent": agent, "token": text})
            started = True
    if response is None:
        raise RuntimeError("The model returned an empty response. Please try again.")
    if started:
        await emit({"type": "stream_end", "agent": agent})
    return response
