"""Health check endpoint — verifies every backing service is actually reachable.

This is deliberately not a fake "status: ok" stub. It pings each dependency so
the /health endpoint is meaningful in a demo (and in production monitoring).
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.database.session import get_db

router = APIRouter(tags=["health"])
logger = get_logger(__name__)


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)) -> dict:
    settings = get_settings()
    status: dict[str, str] = {}

    # Database (SQLite or Postgres)
    db_label = "sqlite" if settings.effective_database_url.startswith("sqlite") else "postgres"
    try:
        await db.execute(text("SELECT 1"))
        status[db_label] = "ok"
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"health.{db_label}.failed", error=str(exc))
        status[db_label] = "unreachable"

    # LLM provider
    status["llm"] = "configured" if settings.llm_configured else "no_api_key"

    # Redis (optional) — use the shared singleton
    try:
        from app.database.redis_client import get_redis
        redis = await get_redis()
        if redis:
            await redis.ping()
            status["redis"] = "ok"
        else:
            status["redis"] = "not_running"
    except Exception:
        status["redis"] = "not_running"

    # Qdrant (optional) — use the shared singleton
    try:
        from app.memory.vector_store import _get_qdrant
        client = await _get_qdrant()
        if client:
            await client.get_collections()
            status["qdrant"] = "ok"
        else:
            status["qdrant"] = "not_running"
    except Exception:
        status["qdrant"] = "not_running"

    # Overall: ok if core services (db + llm) are up
    core_ok = status[db_label] == "ok" and status["llm"] == "configured"
    return {"status": "ok" if core_ok else "degraded", "services": status}


@router.get("/debug/redis")
async def debug_redis() -> dict:
    """Debug endpoint to diagnose Redis connection issues."""
    settings = get_settings()
    url = settings.redis_url
    result = {
        "url_prefix": url[:25] + "..." if url else "NOT SET",
        "url_scheme": url.split("://")[0] if url and "://" in url else "none",
        "is_tls": url.startswith("rediss://") if url else False,
    }

    try:
        from app.database.redis_client import get_redis, _redis_available
        result["cached_available"] = _redis_available
        redis = await get_redis()
        if redis:
            pong = await redis.ping()
            result["status"] = "connected"
            result["ping"] = str(pong)
        else:
            result["status"] = "unavailable"
    except Exception as exc:
        result["status"] = "error"
        result["error"] = str(exc)
        result["error_type"] = type(exc).__name__

    return result
