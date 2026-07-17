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

    # Background LLM warmup — prime the Gemini connection so the first real
    # user request doesn't pay the ~30s cold-start penalty.
    async def _warmup_llm():
        try:
            import asyncio
            await asyncio.sleep(1)  # Let the server finish starting
            if settings.llm_configured:
                from app.agents.base import get_llm
                from langchain_core.messages import HumanMessage
                llm = get_llm()
                logger.info("llm.warmup_start")
                await asyncio.wait_for(
                    llm.ainvoke([HumanMessage(content="hi")]),
                    timeout=30,
                )
                logger.info("llm.warmup_complete")
        except Exception as exc:
            logger.warning("llm.warmup_failed", error=str(exc)[:200])

    import asyncio
    asyncio.create_task(_warmup_llm())

    yield
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
