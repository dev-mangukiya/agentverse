"""AgentVerse FastAPI application entrypoint.

Run with: uvicorn app.main:app --reload
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.rate_limiter import RateLimitMiddleware

from app.api.routes.health import router as health_router
from app.api.routes.chat import router as chat_router
from app.api.routes.stats import router as stats_router
from app.api.routes.custom_agents import router as agents_router
from app.api.routes.auth import router as auth_router
from app.api.routes.documents import router as documents_router
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.database.session import init_db

configure_logging()
logger = get_logger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("agentverse.startup", env=settings.app_env)
    # Import models so Base.metadata knows about them, then create tables
    import app.database.models.models  # noqa: F401

    await init_db()
    logger.info("agentverse.db_initialized")

    # Background startup tasks — run ALL in parallel, non-blocking
    async def _warmup_redis():
        try:
            from app.database.redis_client import get_redis

            r = await get_redis()
            logger.info("startup.redis", status="ok" if r else "skipped")
        except Exception as exc:
            logger.warning("startup.redis_failed", error=str(exc)[:100])

    async def _warmup_qdrant():
        try:
            from app.memory.vector_store import ensure_collection

            ok = await ensure_collection()
            logger.info("startup.qdrant", status="ok" if ok else "skipped")
        except Exception as exc:
            logger.warning("startup.qdrant_failed", error=str(exc)[:100])

    async def _run_all_warmups():
        await asyncio.sleep(0.5)  # Let the server finish binding the port
        await asyncio.gather(
            _warmup_redis(),
            _warmup_qdrant(),
            return_exceptions=True,
        )
        logger.info("startup.warmup_complete")

    import asyncio

    warmup_task = asyncio.create_task(_run_all_warmups())

    from app.services import jobs

    try:
        await jobs.start()
        yield
    finally:
        await jobs.stop()

        # Cleanup
        warmup_task.cancel()
        await asyncio.gather(warmup_task, return_exceptions=True)
        from app.api.routes.chat import _review_tasks

        for task in tuple(_review_tasks):
            task.cancel()
        await asyncio.gather(*tuple(_review_tasks), return_exceptions=True)
        from app.database.session import engine

        await engine.dispose()
        from app.database.redis_client import close_redis
        from app.memory.vector_store import close_qdrant

        await close_redis()
        await close_qdrant()
        logger.info("agentverse.shutdown")


def create_app() -> FastAPI:
    application = FastAPI(
        title=settings.app_name,
        description="Autonomous Multi-Agent AI Workforce Platform",
        version="0.1.0",
        lifespan=lifespan,
    )

    from app.core.body_limit import BodyLimitMiddleware

    application.add_middleware(BodyLimitMiddleware)
    application.add_middleware(RateLimitMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[
            value.strip()
            for value in settings.allowed_origins.split(",")
            if value.strip()
        ],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Session-ID"],
    )
    from app.api.routes.approvals import router as approvals_router

    application.include_router(approvals_router, prefix=settings.api_v1_prefix)

    application.include_router(health_router)
    application.include_router(chat_router, prefix=settings.api_v1_prefix)
    application.include_router(stats_router, prefix=settings.api_v1_prefix)
    application.include_router(agents_router, prefix=settings.api_v1_prefix)
    application.include_router(auth_router, prefix=settings.api_v1_prefix)
    application.include_router(documents_router, prefix=settings.api_v1_prefix)

    return application


app = create_app()
