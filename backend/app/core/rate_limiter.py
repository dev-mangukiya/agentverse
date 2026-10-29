"""Rate limiter middleware for AgentVerse.

Provides per-IP rate limiting with tiered limits:
- Chat/WebSocket: 20 requests per minute (expensive LLM calls)
- Auth endpoints: 10 requests per minute (prevent brute force)
- General API: 60 requests per minute
- Health/static: no limit

HTTP limits use a bounded in-process fallback. Turn admission also checks owner identity.
"""

from __future__ import annotations

import time
import math
from collections import defaultdict
from dataclasses import dataclass, field

from fastapi import Request, WebSocket
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.logging import get_logger

logger = get_logger(__name__)


# ── Rate limit tiers ──────────────────────────────────────────────────────────


@dataclass
class RateLimit:
    """Rate limit configuration: max requests per window_seconds."""

    max_requests: int
    window_seconds: int = 60


# Path-prefix → limit mapping (first match wins, checked in order)
RATE_LIMITS: list[tuple[str, RateLimit]] = [
    # Expensive LLM endpoints — tight limit
    ("/api/v1/chat/ws/", RateLimit(max_requests=20, window_seconds=60)),
    ("/api/v1/chat/compare", RateLimit(max_requests=10, window_seconds=60)),
    ("/api/v1/chat/conversations", RateLimit(max_requests=40, window_seconds=60)),
    # Auth — brute force protection
    ("/api/v1/auth/login", RateLimit(max_requests=10, window_seconds=60)),
    ("/api/v1/auth/register", RateLimit(max_requests=5, window_seconds=60)),
    ("/api/v1/auth/google", RateLimit(max_requests=10, window_seconds=60)),
    ("/api/v1/auth/recovery", RateLimit(max_requests=3, window_seconds=60)),
    ("/api/v1/auth/reset-password", RateLimit(max_requests=5, window_seconds=60)),
    ("/api/v1/auth/guest", RateLimit(max_requests=15, window_seconds=60)),
    # Agent management
    ("/api/v1/agents", RateLimit(max_requests=30, window_seconds=60)),
    # General API fallback
    ("/api/", RateLimit(max_requests=60, window_seconds=60)),
]

# Paths that are never rate-limited
EXEMPT_PATHS = {"/health", "/live", "/", "/docs", "/openapi.json", "/redoc"}


def _get_limit(path: str) -> RateLimit | None:
    """Find the rate limit for a given path. Returns None for exempt paths."""
    if path in EXEMPT_PATHS:
        return None
    for prefix, limit in RATE_LIMITS:
        if path.startswith(prefix):
            return limit
    return RateLimit(max_requests=60, window_seconds=60)  # default


def _get_client_ip(request: Request) -> str:
    """Extract client IP, respecting X-Forwarded-For from reverse proxies."""
    # Trust only ASGI's client address. Configure trusted proxy IPs in Uvicorn.
    return request.client.host if request.client else "unknown"


# ── In-memory sliding window tracker ─────────────────────────────────────────


@dataclass
class _SlidingWindow:
    """Thread-safe sliding window counter for a single key."""

    timestamps: list[float] = field(default_factory=list)

    def count_and_add(self, now: float, window: int) -> int:
        """Remove expired timestamps, add current one, return count."""
        cutoff = now - window
        self.timestamps = [t for t in self.timestamps if t > cutoff]
        self.timestamps.append(now)
        return len(self.timestamps)


class InMemoryRateLimiter:
    """Per-IP rate limiter using in-memory sliding windows.

    Periodically cleans up stale entries to prevent memory leaks.
    """

    def __init__(self) -> None:
        # Key: "ip:path_prefix" → sliding window
        self._windows: dict[str, _SlidingWindow] = defaultdict(_SlidingWindow)
        self._last_cleanup = time.monotonic()
        self._cleanup_interval = 300  # 5 minutes

    def is_allowed(self, key: str, limit: RateLimit) -> tuple[bool, int, int]:
        """Check if a request is allowed.

        Returns: (allowed, current_count, remaining)
        """
        now = time.monotonic()

        # Periodic cleanup of old windows
        if now - self._last_cleanup > self._cleanup_interval:
            self._cleanup(now)

        if key not in self._windows and len(self._windows) >= 10000:
            self._cleanup(now)
            if len(self._windows) >= 10000:
                return False, limit.max_requests, 0
        window = self._windows[key]
        count = window.count_and_add(now, limit.window_seconds)
        if count > limit.max_requests:
            window.timestamps.pop()
        remaining = max(0, limit.max_requests - count)
        return count <= limit.max_requests, count, remaining

    def _cleanup(self, now: float) -> None:
        """Remove windows that have been inactive for > 10 minutes."""
        self._last_cleanup = now
        stale_keys = []
        for key, window in self._windows.items():
            if not window.timestamps or (now - window.timestamps[-1]) > 600:
                stale_keys.append(key)
        for key in stale_keys:
            del self._windows[key]
        if stale_keys:
            logger.info(
                "rate_limiter.cleanup",
                removed=len(stale_keys),
                remaining=len(self._windows),
            )

    def retry_after(self, key: str, limit: RateLimit) -> int:
        window = self._windows.get(key)
        if not window or not window.timestamps:
            return limit.window_seconds
        return max(
            1, math.ceil(window.timestamps[0] + limit.window_seconds - time.monotonic())
        )


# Global singleton
_limiter = InMemoryRateLimiter()


# ── FastAPI Middleware ────────────────────────────────────────────────────────


class RateLimitMiddleware(BaseHTTPMiddleware):
    """HTTP middleware that enforces per-IP rate limits.

    Adds standard rate limit headers to every response:
    - X-RateLimit-Limit: max requests in window
    - X-RateLimit-Remaining: remaining requests
    - Retry-After: seconds to wait (only on 429)
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        limit = _get_limit(path)

        # No limit for exempt paths
        if limit is None or request.method == "OPTIONS":
            return await call_next(request)

        ip = _get_client_ip(request)

        # Use path prefix as the bucket key (not full path with IDs)
        bucket = path
        for prefix, _ in RATE_LIMITS:
            if path.startswith(prefix):
                bucket = prefix
                break

        key = f"{ip}:{bucket}"
        allowed, count, remaining = _limiter.is_allowed(key, limit)

        if not allowed:
            retry_after = _limiter.retry_after(key, limit)
            logger.warning(
                "rate_limiter.blocked",
                ip=ip,
                path=path,
                bucket=bucket,
                count=count,
                limit=limit.max_requests,
            )
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Too many requests. Please slow down.",
                    "retry_after": retry_after,
                },
                headers={
                    "X-RateLimit-Limit": str(limit.max_requests),
                    "X-RateLimit-Remaining": "0",
                    "Retry-After": str(retry_after),
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit.max_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response


# ── WebSocket rate check (called manually since middleware doesn't cover WS) ──


def check_ws_rate_limit(websocket: WebSocket) -> bool:
    """Check rate limit for WebSocket connections. Returns True if allowed."""
    ip = websocket.client.host if websocket.client else "unknown"

    limit = RateLimit(max_requests=20, window_seconds=60)
    key = f"{ip}:/api/v1/chat/ws/"
    allowed, count, remaining = _limiter.is_allowed(key, limit)

    if not allowed:
        logger.warning("rate_limiter.ws_blocked", ip=ip, count=count)
    return allowed


# ── Per-message rate limit for chat (prevent spam within a single WS session) ──


class MessageRateLimiter:
    """Per-connection message rate limiter for WebSocket chat.

    Limits how many messages a single user can send per minute
    to prevent LLM API abuse through rapid-fire messages.
    """

    def __init__(self, max_messages: int = 15, window_seconds: int = 60) -> None:
        self.max_messages = max_messages
        self.window_seconds = window_seconds
        self._timestamps: list[float] = []

    def is_allowed(self) -> tuple[bool, int]:
        """Check if another message is allowed. Returns (allowed, remaining)."""
        now = time.monotonic()
        cutoff = now - self.window_seconds
        self._timestamps = [t for t in self._timestamps if t > cutoff]
        if len(self._timestamps) >= self.max_messages:
            return False, 0
        self._timestamps.append(now)
        remaining = max(0, self.max_messages - len(self._timestamps))
        return len(self._timestamps) <= self.max_messages, remaining
