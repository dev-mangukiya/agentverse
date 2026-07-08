"""Stats endpoint — real-time dashboard metrics from the database."""

import time
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models.models import Conversation, Message
from app.database.session import get_db
from app.core.config import get_settings

router = APIRouter(prefix="/stats", tags=["stats"])
settings = get_settings()

# Track server start time
_START_TIME = time.time()

# Static agent graph positions and metadata (extended by live data)
_AGENT_META: dict[str, dict] = {
    "orchestrator":  {"color": "#4285f4", "role": "Planning & Delegation",    "x": 50, "y": 50},
    "research":      {"color": "#34a853", "role": "Web Search & Analysis",      "x": 22, "y": 28},
    "data":          {"color": "#a855f7", "role": "Data Processing & Viz",      "x": 78, "y": 28},
    "data_analyst":  {"color": "#a855f7", "role": "Data Analyst",               "x": 78, "y": 45},
    "coding":        {"color": "#ea4335", "role": "Code Generation & Debug",    "x": 18, "y": 72},
    "writer":        {"color": "#fbbc04", "role": "Content & Reports",          "x": 82, "y": 72},
    "critic":        {"color": "#06b6d4", "role": "Quality & Evaluation",       "x": 50, "y": 85},
    "memory":        {"color": "#8b5cf6", "role": "RAG & Vector Storage",       "x": 50, "y": 18},
}


@router.get("")
async def get_stats(db: AsyncSession = Depends(get_db)) -> dict:
    """Return live dashboard stats derived from the database."""

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)

    # Total conversations
    total_convs = (await db.execute(select(func.count(Conversation.id)))).scalar_one()

    # Today's conversations
    today_convs = (await db.execute(
        select(func.count(Conversation.id)).where(Conversation.created_at >= today_start)
    )).scalar_one()

    # Total messages
    total_msgs = (await db.execute(select(func.count(Message.id)))).scalar_one()

    # Today's messages
    today_msgs = (await db.execute(
        select(func.count(Message.id)).where(Message.created_at >= today_start)
    )).scalar_one()

    # Yesterday's messages (for trend)
    yesterday_msgs = (await db.execute(
        select(func.count(Message.id)).where(
            Message.created_at >= yesterday_start,
            Message.created_at < today_start,
        )
    )).scalar_one()

    # Agent messages (responses only)
    agent_msgs_total = (await db.execute(
        select(func.count(Message.id)).where(Message.role == "agent")
    )).scalar_one()

    agent_msgs_today = (await db.execute(
        select(func.count(Message.id)).where(
            Message.role == "agent",
            Message.created_at >= today_start,
        )
    )).scalar_one()

    # Recent messages for activity feed (last 20 agent/tool messages)
    recent_msgs_result = await db.execute(
        select(Message)
        .where(Message.role.in_(["agent", "tool"]))
        .order_by(Message.created_at.desc())
        .limit(20)
    )
    recent_msgs = recent_msgs_result.scalars().all()

    # Uptime
    uptime_seconds = int(time.time() - _START_TIME)
    uptime_str = _format_uptime(uptime_seconds)

    # LLM info
    llm_provider = settings.default_model_provider or "unknown"
    llm_model = settings.default_model or "unknown"

    return {
        "conversations": {
            "total": total_convs,
            "today": today_convs,
        },
        "messages": {
            "total": total_msgs,
            "today": today_msgs,
            "yesterday": yesterday_msgs,
            "agent_total": agent_msgs_total,
            "agent_today": agent_msgs_today,
        },
        "uptime": uptime_str,
        "uptime_seconds": uptime_seconds,
        "llm": {
            "provider": llm_provider,
            "model": llm_model,
            "configured": settings.llm_configured,
        },
        "recent_activity": [
            {
                "agent": m.agent_name or "Agent",
                "content": m.content[:120] + "…" if len(m.content) > 120 else m.content,
                "role": m.role,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in recent_msgs
        ],
    }


def _format_uptime(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m"
    if seconds < 86400:
        return f"{seconds // 3600}h {(seconds % 3600) // 60}m"
    return f"{seconds // 86400}d {(seconds % 86400) // 3600}h"


@router.get("/agents")
async def get_agents(db: AsyncSession = Depends(get_db)) -> dict:
    """Return live agent roster derived from message history."""
    import math

    # Get distinct agent names with message counts and last seen
    result = await db.execute(
        select(
            Message.agent_name,
            func.count(Message.id).label("msg_count"),
            func.max(Message.created_at).label("last_seen"),
        )
        .where(Message.role == "agent", Message.agent_name.isnot(None))
        .group_by(Message.agent_name)
    )
    rows = result.all()

    # Always include orchestrator even if no messages yet
    seen_names = {r.agent_name.lower() for r in rows}
    agents = []

    # Build agents list from DB + static meta
    all_names = list(seen_names | set(_AGENT_META.keys()))

    for name in all_names:
        meta = _AGENT_META.get(name, {
            "color": "#9aa0a6",
            "role": "Agent",
            "x": 50,
            "y": 50,
        })
        row = next((r for r in rows if r.agent_name and r.agent_name.lower() == name), None)
        msg_count = row.msg_count if row else 0
        last_seen = row.last_seen.isoformat() if row and row.last_seen else None

        # Determine status based on last_seen recency
        if last_seen:
            from datetime import datetime, timezone
            delta = (datetime.now(timezone.utc) - row.last_seen.replace(tzinfo=timezone.utc)).total_seconds()
            status = "working" if delta < 300 else ("active" if msg_count > 0 else "idle")
        else:
            status = "idle" if name != "orchestrator" else "active"

        agents.append({
            "id": name,
            "label": name.title() + " Agent" if name != "orchestrator" else "Chief Orchestrator",
            "role": meta["role"],
            "status": status,
            "color": meta["color"],
            "x": meta["x"],
            "y": meta["y"],
            "message_count": msg_count,
            "last_seen": last_seen,
        })

    # Static edges (orchestrator → all, plus memory/critic connections)
    edges = [
        {"from": "orchestrator", "to": n}
        for n in ["research", "data", "coding", "writer", "critic", "memory"]
        if n in all_names
    ] + [
        {"from": "research", "to": "memory"},
        {"from": "coding", "to": "critic"},
        {"from": "writer", "to": "critic"},
    ]

    return {"agents": agents, "edges": edges}
