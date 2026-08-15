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
# Positions use a spread-out layout to avoid overlap on all screen sizes
_AGENT_META: dict[str, dict] = {
    "orchestrator":  {"color": "#4285f4", "role": "Planning & Delegation",    "x": 42, "y": 55},
    "research":      {"color": "#34a853", "role": "Web Search & Analysis",      "x": 18, "y": 25},
    "data":          {"color": "#a855f7", "role": "Data Processing & Viz",      "x": 72, "y": 22},
    "coding":        {"color": "#ea4335", "role": "Code Generation & Debug",    "x": 15, "y": 75},
    "writer":        {"color": "#fbbc04", "role": "Content & Reports",          "x": 72, "y": 78},
    "critic":        {"color": "#06b6d4", "role": "Quality & Evaluation",       "x": 42, "y": 85},
    "memory":        {"color": "#8b5cf6", "role": "RAG & Vector Storage",       "x": 48, "y": 18},
    "doc_reader":    {"color": "#f97316", "role": "Document Analysis & Q&A",    "x": 85, "y": 50},
    "doc_generator": {"color": "#14b8a6", "role": "Document Generation",        "x": 85, "y": 75},
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
            "label": name.replace("_", " ").title() + " Agent" if name != "orchestrator" else "Chief Orchestrator",
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


@router.get("/agent-analytics")
async def get_agent_analytics(db: AsyncSession = Depends(get_db)) -> dict:
    """Per-agent performance metrics for the analytics dashboard."""

    now = datetime.now(timezone.utc)

    # Per-agent message counts
    agent_stats_result = await db.execute(
        select(
            Message.agent_name,
            func.count(Message.id).label("total_messages"),
            func.max(Message.created_at).label("last_active"),
            func.min(Message.created_at).label("first_seen"),
        )
        .where(Message.role == "agent", Message.agent_name.isnot(None))
        .group_by(Message.agent_name)
    )
    agent_rows = agent_stats_result.all()

    agents = []
    for row in agent_rows:
        name = row.agent_name
        meta = _AGENT_META.get(name, {"color": "#9aa0a6", "role": "Agent"})

        # Estimate avg response time from message pairs (user → agent)
        # This is a rough estimate based on timestamps
        avg_response_ms = None
        try:
            # Use dialect-appropriate timestamp diff
            dialect = db.bind.dialect.name if db.bind else "sqlite"
            if dialect == "postgresql":
                sql = text("""
                    SELECT AVG(
                        EXTRACT(EPOCH FROM (a.created_at - u.created_at))
                    ) * 1000 as avg_ms
                    FROM messages a
                    JOIN messages u ON a.conversation_id = u.conversation_id
                        AND u.role = 'user'
                        AND u.created_at < a.created_at
                    WHERE a.role = 'agent' AND a.agent_name = :name
                    AND u.created_at = (
                        SELECT MAX(u2.created_at) FROM messages u2
                        WHERE u2.conversation_id = a.conversation_id
                        AND u2.role = 'user'
                        AND u2.created_at < a.created_at
                    )
                """)
            else:
                sql = text("""
                    SELECT AVG(
                        julianday(a.created_at) - julianday(u.created_at)
                    ) * 86400000 as avg_ms
                    FROM messages a
                    JOIN messages u ON a.conversation_id = u.conversation_id
                        AND u.role = 'user'
                        AND u.created_at < a.created_at
                    WHERE a.role = 'agent' AND a.agent_name = :name
                    AND u.created_at = (
                        SELECT MAX(u2.created_at) FROM messages u2
                        WHERE u2.conversation_id = a.conversation_id
                        AND u2.role = 'user'
                        AND u2.created_at < a.created_at
                    )
                """)
            pairs_result = await db.execute(sql, {"name": name})
            avg_row = pairs_result.first()
            if avg_row and avg_row[0]:
                avg_response_ms = int(avg_row[0])
        except Exception:
            pass

        agents.append({
            "name": name,
            "label": meta.get("role", name.replace("_", " ").title()),
            "color": meta.get("color", "#9aa0a6"),
            "total_messages": row.total_messages,
            "last_active": row.last_active.isoformat() if row.last_active else None,
            "first_seen": row.first_seen.isoformat() if row.first_seen else None,
            "avg_response_ms": avg_response_ms,
        })

    # Daily message counts for the last 7 days
    daily = []
    for i in range(6, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count_result = await db.execute(
            select(func.count(Message.id)).where(
                Message.role == "agent",
                Message.created_at >= day_start,
                Message.created_at < day_end,
            )
        )
        daily.append({
            "date": day_start.strftime("%Y-%m-%d"),
            "label": day_start.strftime("%a"),
            "count": count_result.scalar_one(),
        })

    # Tool usage breakdown (from tool messages)
    tool_result = await db.execute(
        select(
            Message.tool_name,
            func.count(Message.id).label("usage_count"),
        )
        .where(Message.role == "tool", Message.tool_name.isnot(None))
        .group_by(Message.tool_name)
        .order_by(func.count(Message.id).desc())
        .limit(10)
    )
    tool_usage = [
        {"tool": r.tool_name, "count": r.usage_count}
        for r in tool_result.all()
    ]

    return {
        "agents": agents,
        "daily_messages": daily,
        "tool_usage": tool_usage,
    }
