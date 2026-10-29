"""Shared, server-issued identities. Headers are credentials, never owner IDs."""

from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import secrets

from fastapi import Depends, Header, HTTPException
import jwt
from jwt import InvalidTokenError

from app.core.config import get_settings
from app.database.session import get_db
from app.database.models.models import AccessSession, Conversation


@dataclass(frozen=True)
class Owner:
    user_id: str | None = None
    session_id: str | None = None

    @property
    def key(self):
        return f"user:{self.user_id}" if self.user_id else f"guest:{self.session_id}"

    def condition(self):
        if self.user_id:
            return Conversation.user_id == self.user_id
        return (Conversation.session_id == self.session_id) & Conversation.user_id.is_(
            None
        )


current_owner: ContextVar[Owner | None] = ContextVar("owner", default=None)
current_conversation: ContextVar[str | None] = ContextVar("conversation", default=None)
current_run: ContextVar[str | None] = ContextVar("run", default=None)


def require_context() -> Owner:
    owner = current_owner.get()
    if owner is None:
        raise PermissionError("An authenticated execution context is required")
    return owner


async def issue_session(db, user_id=None, guest_id=None):
    settings = get_settings()
    sid = secrets.token_hex(24)
    expiry = datetime.now(timezone.utc) + timedelta(
        minutes=settings.jwt_expire_minutes if user_id else 60 * 24 * 30
    )
    session = AccessSession(
        id=sid,
        user_id=user_id,
        guest_id=guest_id or (None if user_id else secrets.token_hex(24)),
        expires_at=expiry,
    )
    db.add(session)
    await db.flush()
    token = jwt.encode(
        {
            "sub": user_id or session.guest_id,
            "sid": sid,
            "kind": "user" if user_id else "guest",
            "exp": expiry,
        },
        settings.secret_key,
        algorithm="HS256",
    )
    return token, session


async def resolve_owner(db, authorization=None, guest_token=None) -> Owner:
    if authorization is not None and not isinstance(authorization, str):
        raise HTTPException(401, "Invalid authorization")
    token = (
        authorization[7:]
        if authorization and authorization.startswith("Bearer ")
        else guest_token
    )
    if authorization and not authorization.startswith("Bearer "):
        raise HTTPException(401, "Invalid authorization")
    if not token or not isinstance(token, str) or len(token) > 4096:
        raise HTTPException(401, "A session is required")
    try:
        payload = jwt.decode(
            token,
            get_settings().secret_key,
            algorithms=["HS256"],
            options={"require": ["exp", "sub", "sid", "kind"]},
        )
        sid = payload.get("sid")
        session = await db.get(AccessSession, sid) if isinstance(sid, str) else None
        now = datetime.now(timezone.utc)
        if (
            not session
            or session.revoked
            or session.expires_at.replace(tzinfo=timezone.utc) <= now
        ):
            raise ValueError("expired session")
        if payload.get("kind") == "user" and session.user_id == payload.get("sub"):
            return Owner(user_id=session.user_id)
        if (
            payload.get("kind") == "guest"
            and session.guest_id == payload.get("sub")
            and not session.user_id
        ):
            return Owner(session_id=session.guest_id)
    except (InvalidTokenError, ValueError, TypeError):
        pass
    raise HTTPException(401, "Session expired. Please sign in again.")


async def get_owner(
    authorization: str | None = Header(None),
    x_session_id: str | None = Header(None),
    db=Depends(get_db),
):
    return await resolve_owner(db, authorization, x_session_id)


async def owner_context(owner: Owner = Depends(get_owner)):
    token = current_owner.set(owner)
    try:
        yield owner
    finally:
        current_owner.reset(token)
