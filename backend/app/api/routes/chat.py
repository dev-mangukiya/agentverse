"""Chat API routes — REST endpoints and WebSocket for real-time agent interaction."""

import asyncio
import json
import traceback
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.database.models.models import Conversation, Message
from app.database.session import get_db, async_session_factory

logger = get_logger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])
settings = get_settings()


# ── Pydantic schemas ──────────────────────────────────────

class ConversationCreate(BaseModel):
    title: str | None = None


# ── REST endpoints ────────────────────────────────────────

@router.get("/conversations")
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    x_session_id: str | None = Header(None),
) -> list[dict]:
    """List conversations for a session, most recent first."""
    stmt = select(Conversation).order_by(Conversation.updated_at.desc())
    if x_session_id:
        stmt = stmt.where(Conversation.session_id == x_session_id)
    else:
        # No session ID = show nothing (don't leak other users' chats)
        return []
    result = await db.execute(stmt)
    conversations = result.scalars().all()
    return [c.to_dict() for c in conversations]


@router.post("/conversations")
async def create_conversation(
    body: ConversationCreate | None = None,
    db: AsyncSession = Depends(get_db),
    x_session_id: str | None = Header(None),
) -> dict:
    """Create a new conversation scoped to a session."""
    title = (body.title if body and body.title else "New conversation")
    conv = Conversation(title=title, session_id=x_session_id)
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    logger.info("chat.conversation.created", id=conv.id, session=x_session_id)
    return conv.to_dict()


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    x_session_id: str | None = Header(None),
) -> dict:
    """Get a conversation with all its messages (session-scoped)."""
    stmt = select(Conversation).where(Conversation.id == conversation_id)
    if x_session_id:
        stmt = stmt.where(Conversation.session_id == x_session_id)
    result = await db.execute(stmt)
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv.to_dict(include_messages=True)


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    x_session_id: str | None = Header(None),
) -> dict:
    """Delete a conversation and all its messages (session-scoped)."""
    stmt = select(Conversation).where(Conversation.id == conversation_id)
    if x_session_id:
        stmt = stmt.where(Conversation.session_id == x_session_id)
    result = await db.execute(stmt)
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.delete(conv)
    await db.commit()
    logger.info("chat.conversation.deleted", id=conversation_id)
    return {"deleted": True}


@router.get("/status")
async def llm_status() -> dict:
    """Check if LLM is configured and available."""
    return {
        "llm_configured": settings.llm_configured,
        "provider": settings.default_model_provider,
        "model": settings.default_model,
        "has_openai": bool(settings.openai_api_key),
        "has_anthropic": bool(settings.anthropic_api_key),
        "has_google": bool(settings.google_api_key),
        "has_huggingface": bool(settings.huggingface_api_key),
    }


# ── Active WebSocket connections ──────────────────────────

active_connections: list[WebSocket] = []


async def broadcast_event(event: dict) -> None:
    """Send an event to all connected WebSocket clients."""
    dead = []
    for ws in active_connections:
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in active_connections:
            active_connections.remove(ws)


# ── WebSocket endpoint ───────────────────────────────────

@router.websocket("/ws/{conversation_id}")
async def chat_websocket(websocket: WebSocket, conversation_id: str):
    """Real-time chat WebSocket."""
    await websocket.accept()
    active_connections.append(websocket)
    logger.info("ws.connected", conversation_id=conversation_id)

    task = None
    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "message":
                content = data.get("content", "").strip()
                if not content:
                    continue
                task = asyncio.create_task(
                    _process_user_message(websocket, conversation_id, content)
                )

            elif data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info("ws.disconnected", conversation_id=conversation_id)
        if task and not task.done():
            logger.info("ws.cancelling_task", conversation_id=conversation_id)
            task.cancel()
    except Exception as exc:
        logger.error("ws.error", error=str(exc))
    finally:
        if websocket in active_connections:
            active_connections.remove(websocket)


async def _process_user_message(
    websocket: WebSocket,
    conversation_id: str,
    content: str,
) -> None:
    """Process a user message: save to DB, run orchestrator, delegate to sub-agents if needed."""
    try:
        # Save user message to DB
        async with async_session_factory() as db:
            stmt = select(Conversation).where(Conversation.id == conversation_id)
            result = await db.execute(stmt)
            conv = result.scalar_one_or_none()

            if not conv:
                conv = Conversation(id=conversation_id, title=content[:80])
                db.add(conv)
                await db.flush()

            user_msg = Message(
                conversation_id=conversation_id,
                role="user",
                content=content,
            )
            db.add(user_msg)
            await db.commit()

            await websocket.send_json({
                "type": "message_saved",
                "message": user_msg.to_dict(),
            })

        # Check LLM
        if not settings.llm_configured:
            await websocket.send_json({
                "type": "error",
                "content": "No LLM API key configured. Add GOOGLE_API_KEY to your .env file and restart the server.",
            })
            return

        # ── Step 1: Run orchestrator ──────────────────────────────
        await websocket.send_json({"type": "thinking", "agent": "orchestrator", "content": "Analyzing your request..."})
        await broadcast_event({"type": "activity", "agent": "Orchestrator", "action": f'Processing: "{content[:50]}"', "time": "now"})

        from app.agents.orchestrator import OrchestratorAgent
        orchestrator = OrchestratorAgent()
        history = await _get_conversation_context(conversation_id)
        orch_response = await _run_agent_with_streaming(orchestrator, content, history, websocket)

        # ── Step 2: Check for DELEGATE directive or intent ───────
        import re
        delegate_match = re.match(r"^\s*DELEGATE:\s*(\w+)\s*\|\s*(.+)", orch_response.strip(), re.IGNORECASE | re.DOTALL)

        if delegate_match:
            # LLM explicitly said DELEGATE: <agent> | <task>
            sub_agent_name = delegate_match.group(1).strip().lower()
            sub_task = delegate_match.group(2).strip()
        else:
            # Fallback: keyword-based intent detection on original user input
            sub_agent_name = _detect_intent(content) or ""
            sub_task = content  # send original user request to sub-agent

        sub_agent = _get_sub_agent(sub_agent_name) if sub_agent_name else None

        if sub_agent:
            # Notify client — delegation happening
            await websocket.send_json({
                "type": "thinking",
                "agent": sub_agent_name,
                "content": f"{sub_agent_name.title()} agent is working...",
            })
            await broadcast_event({
                "type": "activity",
                "agent": sub_agent_name.capitalize(),
                "action": f"Working on: {sub_task[:60]}",
                "time": "now",
            })

            # Run sub-agent with original user task + conversation context
            sub_response = await _run_agent_with_streaming(sub_agent, sub_task, history, websocket)
            final_agent_name = sub_agent_name
            final_response = sub_response
        else:
            # Orchestrator handled it directly
            final_agent_name = "orchestrator"
            final_response = orch_response

        # ── Step 3: Save and send final response ─────────────────
        async with async_session_factory() as db:
            agent_msg = Message(
                conversation_id=conversation_id,
                role="agent",
                agent_name=final_agent_name,
                content=final_response,
            )
            db.add(agent_msg)

            stmt = select(Conversation).where(Conversation.id == conversation_id)
            result = await db.execute(stmt)
            conv = result.scalar_one_or_none()
            if conv:
                conv.updated_at = datetime.now(timezone.utc)

            await db.commit()

            await websocket.send_json({
                "type": "response",
                "agent": final_agent_name,
                "content": final_response,
                "message": agent_msg.to_dict(),
            })

        await broadcast_event({
            "type": "activity",
            "agent": final_agent_name.capitalize(),
            "action": "Completed task",
            "time": "now",
        })

    except Exception as exc:
        err_str = str(exc)
        logger.error("ws.process_error", error=err_str)
        try:
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower():
                await websocket.send_json({
                    "type": "error",
                    "content": "⏳ Rate limit reached — your Gemini API free tier quota is temporarily exhausted. The system will auto-retry. Please wait ~30 seconds and try again.",
                })
            elif "API_KEY_INVALID" in err_str or "API key not valid" in err_str:
                await websocket.send_json({
                    "type": "error",
                    "content": "🔑 Invalid API key. Please check your GOOGLE_API_KEY in the .env file.",
                })
            else:
                await websocket.send_json({
                    "type": "error",
                    "content": f"Error: {err_str[:300]}",
                })
        except Exception:
            pass


# ── Sub-agent loader ──────────────────────────────────────

def _get_sub_agent(name: str):
    """Return a sub-agent instance by name. Returns None if unknown."""
    name = name.lower().strip()
    try:
        if name == "research":
            from app.agents.research import ResearchAgent
            return ResearchAgent()
        if name in ("coding", "code", "coder"):
            from app.agents.coding import CodingAgent
            return CodingAgent()
        if name in ("writer", "write", "writing"):
            from app.agents.writer import WriterAgent
            return WriterAgent()
        if name in ("critic", "review", "reviewer"):
            from app.agents.critic import CriticAgent
            return CriticAgent()
        if name in ("data", "analyst", "data_analyst"):
            from app.agents.data_analyst import DataAnalystAgent
            return DataAnalystAgent()
    except ImportError as e:
        logger.warning("sub_agent.import_failed", name=name, error=str(e))
    return None


def _detect_intent(user_input: str) -> str | None:
    """Keyword-based intent detection — fallback when LLM doesn't emit DELEGATE format."""
    text = user_input.lower()

    research_kw = ["search for", "find information", "look up", "what is", "who is", "news about",
                   "latest on", "tell me about", "research", "find out", "current events"]
    coding_kw = ["write a script", "write code", "code that", "python script", "implement",
                 "debug", "fix this code", "execute", "run this", "write a program",
                 "create a function", "build a", "develop a"]
    writer_kw = ["write an essay", "draft an email", "write a report", "compose", "write a story",
                 "write a blog", "write a poem", "write a letter", "summarize this", "paraphrase",
                 "write a summary", "create content"]
    data_kw = ["analyze data", "data analysis", "statistics", "calculate statistics",
               "analyze this dataset", "plot", "graph", "chart", "distribution"]
    critic_kw = ["review this", "critique this", "evaluate this", "give feedback on",
                 "check my", "what do you think of", "rate this", "score this"]

    for kw in coding_kw:
        if kw in text:
            return "coding"
    for kw in writer_kw:
        if kw in text:
            return "writer"
    for kw in research_kw:
        if kw in text:
            return "research"
    for kw in data_kw:
        if kw in text:
            return "data"
    for kw in critic_kw:
        if kw in text:
            return "critic"
    return None


async def _get_conversation_context(conversation_id: str) -> str:
    """Get recent conversation messages as context."""
    async with async_session_factory() as db:
        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(20)
        )
        result = await db.execute(stmt)
        messages = list(reversed(result.scalars().all()))

        if len(messages) <= 1:
            return ""

        parts = []
        for msg in messages[:-1]:
            role = "User" if msg.role == "user" else f"Agent ({msg.agent_name or 'system'})"
            parts.append(f"{role}: {msg.content[:500]}")

        return "Previous conversation:\n" + "\n".join(parts) if parts else ""


async def _run_agent_with_streaming(agent, user_input: str, context: str, websocket: WebSocket) -> str:
    """Run an agent with streamed tool call notifications."""
    from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage, AIMessage
    from app.agents.base import _invoke_with_retry

    messages = [SystemMessage(content=agent._build_system_prompt(context))]
    messages.append(HumanMessage(content=user_input))

    for _ in range(5):  # max 5 tool rounds
        response = await _invoke_with_retry(agent.llm_with_tools, messages)

        if hasattr(response, "tool_calls") and response.tool_calls:
            messages.append(response)

            for call in response.tool_calls:
                await websocket.send_json({
                    "type": "tool_call",
                    "agent": agent.name,
                    "tool": call["name"],
                    "args": {k: str(v)[:200] for k, v in call["args"].items()},
                })

                await broadcast_event({
                    "type": "activity",
                    "agent": agent.name.capitalize(),
                    "action": f'Using: {call["name"]}',
                    "time": "now",
                })

                tool_map = {t.name: t for t in agent.tools}
                try:
                    if call["name"] in tool_map:
                        result = await tool_map[call["name"]].ainvoke(call["args"])
                    else:
                        result = f"Unknown tool: {call['name']}"
                except Exception as exc:
                    result = f"Tool error: {exc}"

                messages.append(ToolMessage(content=str(result), tool_call_id=call["id"]))

                await websocket.send_json({
                    "type": "tool_result",
                    "tool": call["name"],
                    "result": str(result)[:1000],
                })
        else:
            content = response.content if isinstance(response, AIMessage) else str(response)
            if isinstance(content, list):
                content = "".join([c.get("text", "") if isinstance(c, dict) else str(c) for c in content])
            return content

    content = response.content if isinstance(response, AIMessage) else str(response)
    if isinstance(content, list):
        content = "".join([c.get("text", "") if isinstance(c, dict) else str(c) for c in content])
    return content

# ── Dashboard events WebSocket ────────────────────────────

@router.websocket("/ws/events")
async def events_websocket(websocket: WebSocket):
    """WebSocket for dashboard event streaming."""
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in active_connections:
            active_connections.remove(websocket)
