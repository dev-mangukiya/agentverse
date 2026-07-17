"""Cortex AI FastAPI application entrypoint.

Run with: uvicorn app.main:app --reload
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.health import router as health_router
from app.api.routes.chat import router as chat_router
from app.api.routes.stats import router as stats_router
from app.api.routes.custom_agents import router as agents_router
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
    logger.info("agentverse.db_initialized", url=settings.effective_database_url[:50])

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

    async def _warmup_llm():
        try:
            if settings.llm_configured:
                from app.agents.base import get_llm
                from langchain_core.messages import HumanMessage
                llm = get_llm()
                await asyncio.wait_for(
                    llm.ainvoke([HumanMessage(content="hi")]),
                    timeout=15,
                )
                logger.info("startup.llm_ready")
        except Exception as exc:
            logger.warning("startup.llm_failed", error=str(exc)[:100])

    async def _run_all_warmups():
        await asyncio.sleep(0.5)  # Let the server finish binding the port
        await asyncio.gather(
            _warmup_redis(),
            _warmup_qdrant(),
            _warmup_llm(),
            return_exceptions=True,
        )
        logger.info("startup.warmup_complete")

    import asyncio
    asyncio.create_task(_run_all_warmups())

    yield

    # Cleanup
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

    @application.get("/logs")
    def get_logs():
        try:
            if os.path.exists("/tmp/render_app.log"):
                with open("/tmp/render_app.log", "r") as f:
                    return {"logs": f.read()[-50000:]}  # Last 50k chars
            return {"logs": "Log file not found"}
        except Exception as e:
            return {"error": str(e)}

    application.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "https://agentverse-psi.vercel.app"
        ],
        allow_origin_regex=r"https://.*\.vercel\.app",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(health_router)
    application.include_router(chat_router, prefix=settings.api_v1_prefix)
    application.include_router(stats_router, prefix=settings.api_v1_prefix)
    application.include_router(agents_router, prefix=settings.api_v1_prefix)

    return application


app = create_app()
