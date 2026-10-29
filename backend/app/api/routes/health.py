"""Bounded readiness checks; optional dependencies never block API health."""

import asyncio
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from app.database.session import get_db
from app.core.config import get_settings

router = APIRouter(tags=["health"])


@router.api_route("/live", methods=["GET", "HEAD"])
async def liveness():
    return {"status": "alive"}


@router.api_route("/health", methods=["GET", "HEAD"])
async def health_check(db=Depends(get_db)):
    settings = get_settings()
    status = {"llm": "configured" if settings.llm_configured else "no_api_key"}
    label = (
        "sqlite" if settings.effective_database_url.startswith("sqlite") else "postgres"
    )

    async def database():
        try:
            await asyncio.wait_for(db.execute(text("SELECT 1")), 3)
            status[label] = "ok"
        except Exception:
            status[label] = "unreachable"

    async def redis():
        from app.database.redis_client import get_redis

        try:
            client = await asyncio.wait_for(get_redis(), 2)
            status["redis"] = (
                "ok"
                if client and await asyncio.wait_for(client.ping(), 1)
                else "not_running"
            )
        except Exception:
            status["redis"] = "not_running"

    async def qdrant():
        from app.memory.vector_store import _get_qdrant

        try:
            client = await asyncio.wait_for(_get_qdrant(), 2)
            status["qdrant"] = (
                "ok"
                if client and await asyncio.wait_for(client.get_collections(), 1)
                else "not_running"
            )
        except Exception:
            status["qdrant"] = "not_running"

    await asyncio.gather(database(), redis(), qdrant())
    return JSONResponse(
        {
            "status": "ok"
            if status[label] == "ok" and settings.llm_configured
            else "degraded",
            "services": status,
        },
        status_code=200 if status[label] == "ok" else 503,
    )
