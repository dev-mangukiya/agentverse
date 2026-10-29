"""Owner-scoped metrics; durations come from completed runs, never timestamp guesses."""

import time
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import select, func, case
from app.database.session import get_db
from app.database.models.models import Conversation, Message, Run, ToolExecution
from app.security.identity import Owner, get_owner
from app.core.config import get_settings

router = APIRouter(prefix="/stats", tags=["stats"])
_START_TIME = time.monotonic()
_AGENT_META = {
    "orchestrator": "Planning & Delegation",
    "research": "Web Search & Analysis",
    "coding": "Code Generation & Debug",
    "writer": "Content & Reports",
    "critic": "Quality & Evaluation",
    "data": "Data Processing & Viz",
    "doc_reader": "Document Analysis",
    "doc_generator": "Document Generation",
}


def scope(owner):
    return Message.conversation_id.in_(select(Conversation.id).where(owner.condition()))


def _format_uptime(seconds):
    return (
        f"{seconds // 3600}h {(seconds % 3600) // 60}m"
        if seconds >= 3600
        else f"{seconds // 60}m"
    )


@router.get("")
async def get_stats(db=Depends(get_db), owner: Owner = Depends(get_owner)):
    today = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    yesterday = today - timedelta(days=1)
    conv = (
        await db.execute(
            select(
                func.count(Conversation.id),
                func.count(case((Conversation.created_at >= today, 1))),
            ).where(owner.condition())
        )
    ).one()
    msg = (
        await db.execute(
            select(
                func.count(Message.id),
                func.count(case((Message.created_at >= today, 1))),
                func.count(
                    case(
                        (
                            (Message.created_at >= yesterday)
                            & (Message.created_at < today),
                            1,
                        )
                    )
                ),
                func.count(case((Message.role == "agent", 1))),
                func.count(
                    case(((Message.role == "agent") & (Message.created_at >= today), 1))
                ),
            ).where(scope(owner))
        )
    ).one()
    recent = (
        await db.scalars(
            select(Message)
            .where(scope(owner), Message.role.in_(["agent", "tool"]))
            .order_by(Message.id.desc())
            .limit(20)
        )
    ).all()
    settings = get_settings()
    uptime = int(time.monotonic() - _START_TIME)
    return {
        "conversations": {"total": conv[0], "today": conv[1]},
        "messages": dict(
            zip(["total", "today", "yesterday", "agent_total", "agent_today"], msg)
        ),
        "uptime": _format_uptime(uptime),
        "uptime_seconds": uptime,
        "llm": {
            "provider": settings.default_model_provider,
            "model": settings.default_model,
            "configured": settings.llm_configured,
        },
        "recent_activity": [
            {
                "agent": m.agent_name or "Agent",
                "content": m.content[:120],
                "role": m.role,
                "created_at": m.created_at.isoformat(),
            }
            for m in recent
        ],
    }


@router.get("/agents")
async def get_agents(db=Depends(get_db), owner: Owner = Depends(get_owner)):
    rows = (
        await db.execute(
            select(
                Message.agent_name, func.count(Message.id), func.max(Message.created_at)
            )
            .where(scope(owner), Message.role == "agent")
            .group_by(Message.agent_name)
        )
    ).all()
    lookup = {r[0]: (r[1], r[2]) for r in rows if r[0]}
    active = set(
        (
            await db.scalars(
                select(Run.agent_name).where(
                    Run.owner_key == owner.key, Run.status == "running"
                )
            )
        ).all()
    )
    agents = []
    for i, name in enumerate(sorted(set(_AGENT_META) | set(lookup))):
        count, last = lookup.get(name, (0, None))
        agents.append(
            {
                "id": name,
                "label": name.replace("_", " ").title(),
                "role": _AGENT_META.get(name, "Custom Agent"),
                "status": "working"
                if name in active
                else "active"
                if count
                else "idle",
                "x": 20 + (i % 3) * 30,
                "y": 20 + (i // 3) * 30,
                "message_count": count,
                "last_seen": last.isoformat() if last else None,
            }
        )
    return {
        "agents": agents,
        "edges": [
            {"from": "orchestrator", "to": a["id"]}
            for a in agents
            if a["id"] != "orchestrator"
        ],
    }


@router.get("/agent-analytics")
async def get_agent_analytics(db=Depends(get_db), owner: Owner = Depends(get_owner)):
    rows = (
        await db.execute(
            select(
                Message.agent_name,
                func.count(Message.id),
                func.min(Message.created_at),
                func.max(Message.created_at),
            )
            .where(scope(owner), Message.role == "agent", Message.interrupted == 0)
            .group_by(Message.agent_name)
        )
    ).all()
    runs = (
        await db.execute(
            select(Run.agent_name, Run.duration_ms)
            .where(
                Run.owner_key == owner.key,
                Run.status == "completed",
                Run.duration_ms.isnot(None),
            )
            .order_by(Run.created_at.desc())
            .limit(10000)
        )
    ).all()
    samples = {}
    for name, ms in runs:
        samples.setdefault(name, []).append(ms)
    agents = []
    for name, count, first, last in rows:
        values = sorted(samples.get(name, []))
        n = len(values)
        agents.append(
            {
                "name": name,
                "label": _AGENT_META.get(name, name),
                "total_messages": count,
                "first_seen": first.isoformat(),
                "last_active": last.isoformat(),
                "avg_response_ms": round(sum(values) / n) if n else None,
                "p50_response_ms": values[int((n - 1) * 0.5)] if n >= 20 else None,
                "p95_response_ms": values[int((n - 1) * 0.95)] if n >= 20 else None,
                "response_sample_count": n,
            }
        )
    start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    ) - timedelta(days=6)
    daily_rows = (
        await db.execute(
            select(func.date(Message.created_at), func.count(Message.id))
            .where(scope(owner), Message.created_at >= start)
            .group_by(func.date(Message.created_at))
        )
    ).all()
    counts = {str(day): count for day, count in daily_rows}
    daily = [
        {
            "date": (start + timedelta(days=i)).strftime("%Y-%m-%d"),
            "label": (start + timedelta(days=i)).strftime("%a"),
            "count": counts.get((start + timedelta(days=i)).strftime("%Y-%m-%d"), 0),
        }
        for i in range(7)
    ]
    tools = (
        await db.execute(
            select(ToolExecution.name, func.count(ToolExecution.id))
            .join(Run)
            .where(Run.owner_key == owner.key)
            .group_by(ToolExecution.name)
            .order_by(func.count(ToolExecution.id).desc())
            .limit(10)
        )
    ).all()
    return {
        "agents": agents,
        "daily_messages": daily,
        "tool_usage": [{"tool": name, "count": count} for name, count in tools],
    }


@router.get("/feedback-leaderboard")
async def get_feedback_leaderboard(
    db=Depends(get_db), owner: Owner = Depends(get_owner)
):
    rows = (
        await db.execute(
            select(
                Message.agent_name,
                func.count(case((Message.feedback == "up", 1))),
                func.count(case((Message.feedback == "down", 1))),
            )
            .where(scope(owner), Message.role == "agent", Message.feedback.isnot(None))
            .group_by(Message.agent_name)
        )
    ).all()
    agents = [
        {
            "agent_name": name,
            "thumbs_up": up,
            "thumbs_down": down,
            "total_feedback": up + down,
            "approval_rate": round(up / (up + down), 3),
            "low_sample": up + down < 5,
        }
        for name, up, down in rows
        if up + down
    ]
    agents.sort(key=lambda a: a["approval_rate"], reverse=True)
    return {"agents": agents, "min_threshold": 5, "has_data": bool(agents)}


@router.get("/highlights")
async def get_highlights(db=Depends(get_db), owner: Owner = Depends(get_owner)):
    analytics = await get_agent_analytics(db, owner)
    eligible = [a for a in analytics["agents"] if a["response_sample_count"] >= 20]
    highlights = []
    if eligible:
        fastest = min(eligible, key=lambda a: a["avg_response_ms"])
        highlights.append(
            {
                "id": "fastest_agent",
                "label": "Fastest agent",
                "value": fastest["name"],
                "detail": f"{fastest['avg_response_ms'] / 1000:.1f}s average across {fastest['response_sample_count']} runs",
                "source": "runs.duration_ms",
                "available": True,
            }
        )
    return {"highlights": highlights}
