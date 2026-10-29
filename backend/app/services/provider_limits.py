"""Bound model concurrency and respect a shared Google project quota."""

import asyncio
import time
from contextlib import asynccontextmanager
from app.database.redis_client import get_redis
from app.core.config import get_settings

_slots = asyncio.Semaphore(6)
_google_cooldown_until = 0.0


async def owner_allowed(owner_key):
    from app.core.rate_limiter import _limiter, RateLimit

    redis = await get_redis()
    if redis:
        try:
            count = await redis.eval(
                "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",
                1,
                "turn_limit:" + owner_key,
            )
            return count <= 15
        except Exception:
            pass
    return _limiter.is_allowed("turn:" + owner_key, RateLimit(15))[0]


@asynccontextmanager
async def model_slot(llm):
    global _google_cooldown_until
    from app.agents.base import _underlying_model

    model = _underlying_model(llm)
    google = getattr(model, "google_api_key", None) is not None
    if google and time.monotonic() < _google_cooldown_until:
        raise RuntimeError("Google project quota is temporarily exhausted (429)")
    # Cached optional Redis avoids a new connection handshake on the model path.
    from app.database import redis_client

    redis = redis_client._redis_client
    key = "provider_quota:" + get_settings().google_quota_group
    if google and redis:
        try:
            if await redis.exists(key):
                raise RuntimeError(
                    "Google project quota is temporarily exhausted (429)"
                )
        except RuntimeError:
            raise
        except Exception:
            pass
    await asyncio.wait_for(_slots.acquire(), 10)
    try:
        yield
    except Exception as exc:
        if google and any(
            value in str(exc).lower()
            for value in ("429", "quota", "resource_exhausted")
        ):
            _google_cooldown_until = time.monotonic() + 60
            if redis:
                try:
                    await redis.set(key, "1", ex=60)
                except Exception:
                    pass
        raise
    finally:
        _slots.release()
