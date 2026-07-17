"""Async Redis client singleton with connection pool.

Provides a lazy-initialized Redis client that gracefully handles
connection failures — the app works without Redis, just without caching.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_redis_client = None
_redis_available: bool | None = None


async def get_redis():
    """Get the shared async Redis client. Returns None if Redis is unavailable."""
    global _redis_client, _redis_available

    if _redis_client is not None:
        return _redis_client

    try:
        import ssl
        from redis.asyncio import Redis

        settings = get_settings()
        url = settings.redis_url

        if not url or url == "redis://localhost:6379/0":
            _redis_available = False
            return None

        # Cloud Redis (Upstash, Render, Redis Cloud) uses rediss:// with TLS
        kwargs = dict(
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=3,
        )

        if url.startswith("rediss://"):
            # Create a permissive SSL context for managed Redis
            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE
            kwargs["ssl"] = ssl_ctx

        _redis_client = Redis.from_url(url, **kwargs)
        await _redis_client.ping()
        _redis_available = True
        logger.info("redis.connected", url=url[:40] + "...")
        return _redis_client
    except Exception as exc:
        _redis_available = False
        _redis_client = None
        logger.warning("redis.unavailable", error=str(exc)[:300])
        return None


async def close_redis():
    """Close the Redis connection pool. Call on app shutdown."""
    global _redis_client, _redis_available
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None
        _redis_available = None
        logger.info("redis.closed")


# ── LLM Response Cache ──────────────────────────────────────────────────────

def _cache_key(model: str, system_prompt: str, user_input: str) -> str:
    """Generate a deterministic cache key from the LLM call parameters."""
    payload = f"{model}|{system_prompt[:500]}|{user_input}"
    digest = hashlib.sha256(payload.encode()).hexdigest()[:16]
    return f"llm_cache:{digest}"


async def cache_get(model: str, system_prompt: str, user_input: str) -> str | None:
    """Check if we have a cached LLM response. Returns None on miss."""
    redis = await get_redis()
    if redis is None:
        return None
    try:
        key = _cache_key(model, system_prompt, user_input)
        result = await redis.get(key)
        if result:
            logger.info("cache.hit", key=key[:30])
        return result
    except Exception:
        return None


async def cache_set(model: str, system_prompt: str, user_input: str, response: str) -> None:
    """Cache an LLM response with TTL."""
    redis = await get_redis()
    if redis is None:
        return
    try:
        settings = get_settings()
        key = _cache_key(model, system_prompt, user_input)
        await redis.set(key, response, ex=settings.redis_cache_ttl)
        logger.info("cache.stored", key=key[:30], ttl=settings.redis_cache_ttl)
    except Exception as exc:
        logger.warning("cache.store_failed", error=str(exc)[:100])


# ── Rate Limit Persistence ──────────────────────────────────────────────────

async def rate_limit_mark(key_suffix: str, cooldown_seconds: int = 60) -> None:
    """Mark an API key as rate-limited in Redis."""
    redis = await get_redis()
    if redis is None:
        return
    try:
        await redis.set(f"rate_limit:{key_suffix}", "1", ex=cooldown_seconds)
    except Exception:
        pass


async def rate_limit_check(key_suffix: str) -> bool:
    """Check if an API key is rate-limited. Returns True if limited."""
    redis = await get_redis()
    if redis is None:
        return False
    try:
        return await redis.exists(f"rate_limit:{key_suffix}") > 0
    except Exception:
        return False
