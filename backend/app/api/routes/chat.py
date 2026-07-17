"""Chat API routes — REST endpoints and WebSocket for real-time agent interaction.

Supports parallel multi-agent execution, rich pipeline event streaming,
and agent instance caching for speed.
"""

import asyncio
import base64
import binascii
import io
import json
import re
import time
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

# Keep extracted documents comfortably within the context window while still
# giving the specialist agent enough source material to answer follow-ups.
MAX_DOCUMENT_TEXT_CHARS = 50_000
MAX_PDF_BYTES = 2 * 1024 * 1024


# ── Agent instance cache ──────────────────────────────────
# Reuse agent instances instead of creating new ones per request
_agent_cache: dict[str, object] = {}


def _get_cached_agent(name: str):
    """Return a cached agent instance by name. Creates one if not cached.
    
    Checks built-in agents first, then falls back to custom agents from the database.
    """
    name = name.lower().strip()
    if name in _agent_cache:
        return _agent_cache[name]

    agent = None
    try:
        if name == "orchestrator":
            from app.agents.orchestrator import OrchestratorAgent
            agent = OrchestratorAgent()
        elif name == "research":
            from app.agents.research import ResearchAgent
            agent = ResearchAgent()
        elif name in ("coding", "code", "coder"):
            from app.agents.coding import CodingAgent
            agent = CodingAgent()
            name = "coding"
        elif name in ("writer", "write", "writing"):
            from app.agents.writer import WriterAgent
            agent = WriterAgent()
            name = "writer"
        elif name in ("critic", "review", "reviewer"):
            from app.agents.critic import CriticAgent
            agent = CriticAgent()
            name = "critic"
        elif name in ("data", "analyst", "data_analyst"):
            from app.agents.data_analyst import DataAnalystAgent
            agent = DataAnalystAgent()
            name = "data"
        else:
            # Try loading a custom agent from the database
            agent = _load_custom_agent(name)
    except ImportError as e:
        logger.warning("agent.import_failed", name=name, error=str(e))

    if agent:
        _agent_cache[name] = agent
    return agent


def _load_custom_agent(name: str):
    """Load a custom agent from the database (synchronous wrapper)."""
    import asyncio
    import json
    from sqlalchemy import select as sa_select
    from app.database.session import async_session_factory
    from app.database.models.models import CustomAgent
    from app.agents.custom_agent import DynamicCustomAgent

    async def _fetch():
        async with async_session_factory() as session:
            result = await session.execute(
                sa_select(CustomAgent).where(
                    CustomAgent.name == name,
                    CustomAgent.is_active == 1,
                )
            )
            return result.scalar_one_or_none()

    try:
        # Try to get existing event loop
        try:
            loop = asyncio.get_running_loop()
            # We're in an async context — use a thread to run the query
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                db_agent = pool.submit(asyncio.run, _fetch()).result(timeout=5)
        except RuntimeError:
            db_agent = asyncio.run(_fetch())

        if db_agent:
            tools = json.loads(db_agent.tools_json) if db_agent.tools_json else []
            return DynamicCustomAgent(
                agent_name=db_agent.name,
                agent_role=f"{db_agent.emoji} {db_agent.name} — {db_agent.description or 'Custom agent'}",
                agent_system_prompt=db_agent.system_prompt,
                tool_names=tools,
                model=db_agent.model,
            )
    except Exception as e:
        logger.warning("custom_agent.load_failed", name=name, error=str(e))
    return None


def _clear_cached_agent(name: str):
    """Remove an agent from the cache (called when custom agent is updated/deleted)."""
    name = name.lower().strip()
    _agent_cache.pop(name, None)


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
    from app.agents.base import get_google_key_manager
    km = get_google_key_manager()
    return {
        "llm_configured": settings.llm_configured,
        "provider": settings.default_model_provider,
        "model": settings.default_model,
        "has_openai": bool(settings.openai_api_key),
        "has_anthropic": bool(settings.anthropic_api_key),
        "has_google": bool(settings.google_api_key),
        "has_huggingface": bool(settings.huggingface_api_key),
        "google_keys_total": km.key_count,
        "google_keys_available": km.get_available_count(),
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
                attachments = data.get("attachments", [])
                task = asyncio.create_task(
                    _process_user_message(websocket, conversation_id, content, attachments)
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


async def _send_ws(websocket: WebSocket, data: dict) -> None:
    """Safe WebSocket send — swallows errors if connection is closed."""
    try:
        await websocket.send_json(data)
    except Exception:
        pass


async def _process_user_message(
    websocket: WebSocket,
    conversation_id: str,
    content: str,
    attachments: list | None = None,
) -> None:
    """Process a user message through the multi-agent pipeline.

    Pipeline: Save → Orchestrate → Delegate (parallel) → Synthesize → Respond
    """
    pipeline_start = time.time()

    try:
        # Attachments arrive separately from the visible chat text. Convert PDF
        # bytes to text here so routing, specialist agents, memory, and future
        # turns all share the same document context. Passing a PDF as an
        # ``image_url`` is not portable across the supported LLM providers.
        content = _include_attachment_text(content, attachments)

        # ── Save user message to DB ──────────────────────────────
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

            await _send_ws(websocket, {
                "type": "message_saved",
                "message": user_msg.to_dict(),
            })

            # Background: embed user message into Qdrant semantic memory
            async def _store_user_memory():
                try:
                    from app.memory.vector_store import store_message
                    await store_message(conversation_id, "user", content)
                except Exception:
                    pass  # Non-critical
            asyncio.create_task(_store_user_memory())

        # Check LLM
        if not settings.llm_configured:
            await _send_ws(websocket, {
                "type": "error",
                "content": "No LLM API key configured. Add GOOGLE_API_KEY to your .env file and restart the server.",
            })
            return

        # ── Fast-path for trivial greetings ──────────────────────
        # Skip the full orchestrator pipeline for messages that don't need it.
        trivial_lower = content.strip().lower().rstrip("!?.,:;")
        GREETINGS = {
            "hi", "hey", "hello", "hola", "yo", "sup", "hii", "hiii",
            "good morning", "good afternoon", "good evening", "good night",
            "gm", "thanks", "thank you", "thx", "ty", "ok", "okay",
            "bye", "goodbye", "see you", "test", "ping",
        }
        if trivial_lower in GREETINGS and not attachments:
            fast_start = time.time()
            FAST_RESPONSES = {
                "hi": "Hello! How can I help you today?",
                "hey": "Hey there! What can I do for you?",
                "hello": "Hello! How can I help you today?",
                "hola": "¡Hola! How can I help you?",
                "yo": "Hey! What's up?",
                "sup": "Hey! What's on your mind?",
                "hii": "Hello! How can I help you today?",
                "hiii": "Hello! How can I help you today?",
                "good morning": "Good morning! ☀️ How can I help you today?",
                "good afternoon": "Good afternoon! How can I help you?",
                "good evening": "Good evening! What can I do for you?",
                "good night": "Good night! 🌙 Let me know if you need anything before you go.",
                "gm": "Good morning! ☀️ How can I help you today?",
                "thanks": "You're welcome! Let me know if you need anything else.",
                "thank you": "You're welcome! Happy to help.",
                "thx": "You're welcome! 😊",
                "ty": "You're welcome!",
                "ok": "Got it! Let me know what you'd like to work on.",
                "okay": "Got it! Let me know what you'd like to work on.",
                "bye": "Goodbye! 👋 Feel free to come back anytime.",
                "goodbye": "Goodbye! 👋 Have a great day!",
                "see you": "See you later! 👋",
                "test": "I'm here and working! ✅ Ask me anything.",
                "ping": "Pong! 🏓 System is online and ready.",
            }
            fast_response = FAST_RESPONSES.get(trivial_lower, "Hello! How can I help you today?")
            fast_duration = int((time.time() - fast_start) * 1000)

            # Send minimal pipeline events
            await _send_ws(websocket, {"type": "pipeline_start", "timestamp": time.time()})
            await _send_ws(websocket, {"type": "agent_activated", "agent": "orchestrator", "task": "Quick response"})
            await _send_ws(websocket, {"type": "agent_complete", "agent": "orchestrator", "duration_ms": fast_duration, "summary": "Instant reply"})

            # Save and send
            async with async_session_factory() as db:
                agent_msg = Message(conversation_id=conversation_id, role="agent", agent_name="orchestrator", content=fast_response)
                db.add(agent_msg)
                stmt = select(Conversation).where(Conversation.id == conversation_id)
                result = await db.execute(stmt)
                conv = result.scalar_one_or_none()
                if conv:
                    conv.updated_at = datetime.now(timezone.utc)
                await db.commit()
                await _send_ws(websocket, {"type": "pipeline_complete", "total_duration_ms": fast_duration, "agents_used": 1, "contributing_agents": []})
                await _send_ws(websocket, {"type": "response", "agent": "orchestrator", "content": fast_response, "message": agent_msg.to_dict(), "contributing_agents": [], "pipeline_duration_ms": fast_duration})
            return

        # ── Pipeline Start Event ─────────────────────────────────
        await _send_ws(websocket, {
            "type": "pipeline_start",
            "timestamp": time.time(),
        })

        # ── Step 1: Run orchestrator ─────────────────────────────
        await _send_ws(websocket, {
            "type": "agent_activated",
            "agent": "orchestrator",
            "task": "Analyzing request and planning delegation...",
        })
        await _send_ws(websocket, {
            "type": "thinking",
            "agent": "orchestrator",
            "content": "Analyzing your request...",
            "phase": "planning",
        })
        await broadcast_event({
            "type": "activity",
            "agent": "Orchestrator",
            "action": f'Planning: "{content[:50]}"',
            "time": "now",
        })

        orchestrator = _get_cached_agent("orchestrator")
        history = await _get_conversation_context(conversation_id)
        orch_start = time.time()
        # Truncate file content for orchestrator — it only needs to route, not analyze
        orch_content = _truncate_file_content(content)
        orch_response = await _run_agent_with_streaming(orchestrator, orch_content, history, websocket, attachments=attachments)
        orch_duration = int((time.time() - orch_start) * 1000)

        await _send_ws(websocket, {
            "type": "agent_complete",
            "agent": "orchestrator",
            "duration_ms": orch_duration,
            "summary": "Analysis complete",
        })

        # ── Step 2: Parse delegation directive ───────────────────
        parallel_match = re.match(
            r"^\s*PARALLEL:\s*([\w\s,]+)\s*\|\s*(.+)",
            orch_response.strip(),
            re.IGNORECASE | re.DOTALL,
        )
        delegate_match = re.match(
            r"^\s*DELEGATE:\s*(\w+)\s*\|\s*(.+)",
            orch_response.strip(),
            re.IGNORECASE | re.DOTALL,
        )

        if parallel_match:
            # ── Parallel multi-agent execution ───────────────────
            agent_names = [n.strip().lower() for n in parallel_match.group(1).split(",")]
            tasks_text = parallel_match.group(2).strip()
            sub_tasks = [t.strip() for t in tasks_text.split("|||")]

            # Pad tasks if fewer than agents
            while len(sub_tasks) < len(agent_names):
                sub_tasks.append(content)

            agents_planned = ["orchestrator"] + agent_names
            await _send_ws(websocket, {
                "type": "pipeline_start",
                "agents_planned": agents_planned,
            })

            # Activate all agents
            for i, name in enumerate(agent_names):
                agent = _get_cached_agent(name)
                if agent:
                    await _send_ws(websocket, {
                        "type": "agent_activated",
                        "agent": name,
                        "task": sub_tasks[i][:100],
                        "parallel_group": 1,
                    })
                    await _send_ws(websocket, {
                        "type": "delegation",
                        "from": "orchestrator",
                        "to": name,
                        "reason": f"Specialist needed for: {sub_tasks[i][:60]}",
                        "task": sub_tasks[i][:200],
                    })

            # Run all agents in parallel
            async def _run_sub(name: str, task: str) -> tuple[str, str, int]:
                agent = _get_cached_agent(name)
                if not agent:
                    return name, f"Agent '{name}' not available.", 0
                await _send_ws(websocket, {
                    "type": "thinking",
                    "agent": name,
                    "content": f"{name.title()} agent is working...",
                    "phase": "executing",
                })
                # Include original user content so sub-agents see file attachments
                full_task = f"User's original message:\n{content}\n\nYour specific task:\n{task}"
                start = time.time()
                result = await _run_agent_with_streaming(agent, full_task, history, websocket, attachments=attachments)
                duration = int((time.time() - start) * 1000)
                await _send_ws(websocket, {
                    "type": "agent_complete",
                    "agent": name,
                    "duration_ms": duration,
                    "summary": result[:80] + "..." if len(result) > 80 else result,
                })
                await broadcast_event({
                    "type": "activity",
                    "agent": name.capitalize(),
                    "action": "Completed task",
                    "time": "now",
                })
                return name, result, duration

            # Execute in parallel with asyncio.gather
            parallel_results = await asyncio.gather(
                *[_run_sub(name, sub_tasks[i]) for i, name in enumerate(agent_names)],
                return_exceptions=True,
            )

            # Collect results
            agent_outputs: dict[str, str] = {}
            contributing_agents = []
            for res in parallel_results:
                if isinstance(res, Exception):
                    logger.error("parallel.agent.error", error=str(res))
                    continue
                name, output, duration = res
                agent_outputs[name] = output
                contributing_agents.append(name)

            # Synthesize if multiple agents responded
            if len(agent_outputs) > 1:
                await _send_ws(websocket, {
                    "type": "synthesis_start",
                    "agents_completed": contributing_agents,
                })
                await _send_ws(websocket, {
                    "type": "thinking",
                    "agent": "orchestrator",
                    "content": "Synthesizing results from all agents...",
                    "phase": "synthesizing",
                })

                synthesis_prompt = "Synthesize the following agent outputs into a single, cohesive response for the user:\n\n"
                for name, output in agent_outputs.items():
                    synthesis_prompt += f"## {name.title()} Agent's Output:\n{output}\n\n"
                synthesis_prompt += "Combine the above into a well-structured final response. Give credit to each agent's contribution."

                final_response = await _run_agent_with_streaming(orchestrator, synthesis_prompt, "", websocket)
                final_agent_name = "orchestrator"
            elif agent_outputs:
                name = list(agent_outputs.keys())[0]
                final_response = agent_outputs[name]
                final_agent_name = name
            else:
                final_response = orch_response
                final_agent_name = "orchestrator"

        elif delegate_match:
            # ── Single agent delegation ──────────────────────────
            sub_agent_name = delegate_match.group(1).strip().lower()
            sub_task = delegate_match.group(2).strip()

            sub_agent = _get_cached_agent(sub_agent_name)
            if sub_agent:
                await _send_ws(websocket, {
                    "type": "delegation",
                    "from": "orchestrator",
                    "to": sub_agent_name,
                    "reason": f"Delegated to specialist: {sub_agent_name}",
                    "task": sub_task[:200],
                })
                await _send_ws(websocket, {
                    "type": "agent_activated",
                    "agent": sub_agent_name,
                    "task": sub_task[:100],
                })
                await _send_ws(websocket, {
                    "type": "thinking",
                    "agent": sub_agent_name,
                    "content": f"{sub_agent_name.title()} agent is working...",
                    "phase": "executing",
                })
                await broadcast_event({
                    "type": "activity",
                    "agent": sub_agent_name.capitalize(),
                    "action": f"Working on: {sub_task[:60]}",
                    "time": "now",
                })

                agent_start = time.time()
                # Include original user content so sub-agent sees file attachments
                full_sub_task = f"User's original message:\n{content}\n\nYour specific task:\n{sub_task}"
                sub_response = await _run_agent_with_streaming(sub_agent, full_sub_task, history, websocket, attachments=attachments)
                agent_duration = int((time.time() - agent_start) * 1000)

                await _send_ws(websocket, {
                    "type": "agent_complete",
                    "agent": sub_agent_name,
                    "duration_ms": agent_duration,
                    "summary": sub_response[:80] + "..." if len(sub_response) > 80 else sub_response,
                })

                final_agent_name = sub_agent_name
                final_response = sub_response
                contributing_agents = [sub_agent_name]
            else:
                final_agent_name = "orchestrator"
                final_response = orch_response
                contributing_agents = []
        else:
            # ── Fallback: keyword-based intent detection ─────────
            sub_agent_name = _detect_intent(content) or ""
            sub_agent = _get_cached_agent(sub_agent_name) if sub_agent_name else None

            if sub_agent:
                await _send_ws(websocket, {
                    "type": "delegation",
                    "from": "orchestrator",
                    "to": sub_agent_name,
                    "reason": f"Auto-routed to {sub_agent_name} specialist",
                    "task": content[:200],
                })
                await _send_ws(websocket, {
                    "type": "agent_activated",
                    "agent": sub_agent_name,
                    "task": content[:100],
                })
                await _send_ws(websocket, {
                    "type": "thinking",
                    "agent": sub_agent_name,
                    "content": f"{sub_agent_name.title()} agent is working...",
                    "phase": "executing",
                })

                agent_start = time.time()
                sub_response = await _run_agent_with_streaming(sub_agent, content, history, websocket, attachments=attachments)
                agent_duration = int((time.time() - agent_start) * 1000)

                await _send_ws(websocket, {
                    "type": "agent_complete",
                    "agent": sub_agent_name,
                    "duration_ms": agent_duration,
                    "summary": sub_response[:80] + "..." if len(sub_response) > 80 else sub_response,
                })

                final_agent_name = sub_agent_name
                final_response = sub_response
                contributing_agents = [sub_agent_name]
            else:
                final_agent_name = "orchestrator"
                final_response = orch_response
                contributing_agents = []

        # ── Step 3: Save and send final response ─────────────────
        total_duration = int((time.time() - pipeline_start) * 1000)

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

            # Background: embed agent response into Qdrant semantic memory
            _final_agent = final_agent_name
            _final_resp = final_response
            _conv_id = conversation_id
            async def _store_agent_memory():
                try:
                    from app.memory.vector_store import store_message
                    await store_message(_conv_id, "agent", _final_resp, agent_name=_final_agent)
                except Exception:
                    pass  # Non-critical
            asyncio.create_task(_store_agent_memory())

            # Pipeline complete event
            await _send_ws(websocket, {
                "type": "pipeline_complete",
                "total_duration_ms": total_duration,
                "agents_used": len(contributing_agents) + 1 if contributing_agents else 1,
                "contributing_agents": contributing_agents if contributing_agents else [],
            })

            await _send_ws(websocket, {
                "type": "response",
                "agent": final_agent_name,
                "content": final_response,
                "message": agent_msg.to_dict(),
                "contributing_agents": contributing_agents if contributing_agents else [],
                "pipeline_duration_ms": total_duration,
            })

        await broadcast_event({
            "type": "activity",
            "agent": final_agent_name.capitalize(),
            "action": f"Completed in {total_duration}ms",
            "time": "now",
        })

    except Exception as exc:
        err_str = str(exc)
        logger.error("ws.process_error", error=err_str)
        try:
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower() or "rate limit" in err_str.lower():
                await _send_ws(websocket, {
                    "type": "error",
                    "content": "⏳ Both primary and fallback APIs are temporarily rate-limited. Please wait ~30 seconds and try again.",
                })
            elif "Fallback LLM" in err_str and "timed out" in err_str:
                await _send_ws(websocket, {
                    "type": "error",
                    "content": "⏳ Fallback model (HuggingFace) timed out. The model may be cold-starting — please try again in a moment.",
                })
            elif "API_KEY_INVALID" in err_str or "API key not valid" in err_str:
                await _send_ws(websocket, {
                    "type": "error",
                    "content": "🔑 Invalid API key. Please check your API key configuration.",
                })
            else:
                await _send_ws(websocket, {
                    "type": "error",
                    "content": f"Error: {err_str[:300]}",
                })
        except Exception:
            pass


# ── File content truncation for routing ────────────────────

def _include_attachment_text(content: str, attachments: list | None) -> str:
    """Append readable PDF text to a chat message.

    The browser sends PDFs as data URLs. Extracting their text in the backend
    makes document understanding work for every model provider, rather than
    relying on provider-specific multimodal PDF support.
    """
    document_blocks: list[str] = []

    for attachment in attachments or []:
        if attachment.get("type") != "document":
            continue

        name = str(attachment.get("name") or "document.pdf")
        data_url = attachment.get("data")
        if not isinstance(data_url, str):
            continue

        extracted = _extract_pdf_text(data_url)
        # Keep the UI's existing marker, then place the source text below it.
        # ChatPanel deliberately hides attachment blocks when rendering a user
        # bubble, while the database and agents retain the full source text.
        marker = f"[Attached document: {name}]"
        if marker in content:
            content = content.replace(marker, f"{marker}\n{extracted}", 1)
        else:
            document_blocks.append(f"{marker}\n{extracted}")

    return content + ("\n\n" + "\n\n".join(document_blocks) if document_blocks else "")


def _extract_pdf_text(data_url: str) -> str:
    """Return a bounded, model-ready text block from a PDF data URL."""
    try:
        header, encoded = data_url.split(",", 1)
        if not header.startswith("data:application/pdf"):
            return "The attachment was not a valid PDF."
        pdf_bytes = base64.b64decode(encoded, validate=True)
        if len(pdf_bytes) > MAX_PDF_BYTES:
            return f"The PDF is too large to process (maximum {MAX_PDF_BYTES // (1024 * 1024)} MB)."

        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages = []
        remaining = MAX_DOCUMENT_TEXT_CHARS
        for page_number, page in enumerate(reader.pages, start=1):
            page_text = (page.extract_text() or "").strip()
            if not page_text:
                continue
            page_text = page_text[:remaining]
            pages.append(f"--- Page {page_number} ---\n{page_text}")
            remaining -= len(page_text)
            if remaining <= 0:
                break

        if not pages:
            return (
                "This PDF appears to be scanned or contains no extractable text. "
                "OCR is required before its contents can be analyzed."
            )

        suffix = "\n[Document text truncated for context length.]" if remaining <= 0 else ""
        return "Document text:\n" + "\n\n".join(pages) + suffix
    except (ValueError, binascii.Error):
        return "The PDF data could not be decoded."
    except Exception as exc:
        logger.warning("attachment.pdf_extraction_failed", error=str(exc))
        return f"The PDF could not be read: {str(exc)[:160]}"

def _truncate_file_content(content: str, preview_chars: int = 500) -> str:
    """Truncate file attachment content for the orchestrator.
    
    The orchestrator only needs to know what files are attached and see a preview
    to make a routing decision. Sub-agents get the full content separately.
    """
    import re
    
    # Truncate code fence blocks: [File: name]\n```lang\n<content>\n```
    def truncate_code_block(match: re.Match) -> str:
        header = match.group(1)  # [File: name]
        lang = match.group(2) or ""
        body = match.group(3)
        truncated = body[:preview_chars]
        lines = truncated.split("\n")
        line_count = body.count("\n") + 1
        return f"{header}\n```{lang}\n{truncated}\n```\n[... {line_count} total lines, showing first {len(lines)} lines]"
    
    result = re.sub(
        r'(\[File: [^\]]+\])\n```(\w*)\n([\s\S]*?)```',
        truncate_code_block,
        content,
    )
    
    # Truncate plain text blocks: [File: name]\n<content>
    def truncate_text_block(match: re.Match) -> str:
        header = match.group(1)
        body = match.group(2)
        if len(body) <= preview_chars:
            return match.group(0)
        truncated = body[:preview_chars]
        line_count = body.count("\n") + 1
        return f"{header}\n{truncated}\n[... {line_count} total lines truncated for routing]"
    
    result = re.sub(
        r'(\[File: [^\]]+\])\n((?:(?!\[File: |\[Attached image: |\[Attached document: )[\s\S])*)',
        truncate_text_block,
        result,
    )

    # PDF text uses the document marker so it remains hidden in the chat UI.
    result = re.sub(
        r'(\[Attached document: [^\]]+\])\n((?:(?!\[File: |\[Attached image: |\[Attached document: )[\s\S])*)',
        truncate_text_block,
        result,
    )
    
    return result


# ── Intent detection fallback ─────────────────────────────

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
            parts.append(f"{role}: {msg.content[:2000]}")

        return "Previous conversation:\n" + "\n".join(parts) if parts else ""


async def _run_agent_with_streaming(
    agent, user_input: str, context: str, websocket: WebSocket,
    attachments: list | None = None,
) -> str:
    """Run an agent with streamed tool call notifications.
    
    Supports multimodal input — if attachments contain images with base64 data,
    they are included as image_url parts in the HumanMessage for Gemini vision.
    """
    from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage, AIMessage
    from app.agents.base import _invoke_with_retry

    async def _execute() -> str:
        messages = [SystemMessage(content=agent._build_system_prompt(context))]
        
        # PDFs are converted to text before this function is called. Keep image
        # attachments multimodal for vision-capable providers.
        binary_attachments = [
            a for a in (attachments or [])
            if a.get("type") == "image" and a.get("data", "").startswith("data:")
        ]
        
        if binary_attachments:
            # Multimodal message: text + binary files
            # LangChain's Google GenAI adapter reads MIME type from the data URL
            # (e.g. data:application/pdf;base64,... or data:image/png;base64,...)
            # and converts to Gemini's inline_data format automatically.
            content_parts: list[dict] = [{"type": "text", "text": user_input}]
            for att in binary_attachments:
                content_parts.append({
                    "type": "image_url",
                    "image_url": {"url": att["data"]},
                })
            messages.append(HumanMessage(content=content_parts))
        else:
            messages.append(HumanMessage(content=user_input))

        llm = agent._get_fresh_llm()

        last_text_content = ""
        tool_results_log = []

        for _ in range(5):  # max 5 tool rounds
            response = await _invoke_with_retry(llm, messages)

            if hasattr(response, "tool_calls") and response.tool_calls:
                # Gemini often returns text content alongside tool_calls — capture it
                if isinstance(response, AIMessage) and response.content:
                    rc = response.content
                    if isinstance(rc, list):
                        rc = "".join([c.get("text", "") if isinstance(c, dict) else str(c) for c in rc])
                    if rc.strip():
                        last_text_content = rc

                messages.append(response)

                for call in response.tool_calls:
                    tool_start = time.time()
                    await _send_ws(websocket, {
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

                    tool_duration = int((time.time() - tool_start) * 1000)
                    tool_results_log.append(f"**Tool `{call['name']}`** ({tool_duration}ms):\n{str(result)[:2000]}")
                    messages.append(ToolMessage(content=str(result), tool_call_id=call["id"]))

                    await _send_ws(websocket, {
                        "type": "tool_result",
                        "agent": agent.name,
                        "tool": call["name"],
                        "result": str(result)[:1000],
                        "duration_ms": tool_duration,
                    })
            else:
                content = response.content if isinstance(response, AIMessage) else str(response)
                if isinstance(content, list):
                    content = "".join([c.get("text", "") if isinstance(c, dict) else str(c) for c in content])
                if content and content.strip():
                    return content
                # If LLM returned empty content after tools, use accumulated text or tool results
                if last_text_content:
                    return last_text_content
                if tool_results_log:
                    return "\n\n".join(tool_results_log)
                return "(Agent finished with no text output)"

        # Exhausted tool rounds — return whatever we have
        content = response.content if isinstance(response, AIMessage) else str(response)
        if isinstance(content, list):
            content = "".join([c.get("text", "") if isinstance(c, dict) else str(c) for c in content])
        if content and content.strip():
            return content
        if last_text_content:
            return last_text_content
        if tool_results_log:
            return "\n\n".join(tool_results_log)
        return "(Agent finished with no text output)"

    try:
        return await asyncio.wait_for(_execute(), timeout=60.0)
    except asyncio.TimeoutError:
        logger.warning("agent.timeout", agent=agent.name)
        return f"Agent '{agent.name}' timed out after 60 seconds. Please try a simpler request or smaller file."

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
