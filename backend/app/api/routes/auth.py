"""Authentication routes — register, login, and user profile.

Supports optional auth: anonymous sessions work without login.
When a user registers/logs in, their anonymous session's chats
are migrated to their account for cross-device persistence.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.database.models.models import User, Conversation
from app.database.session import get_db

logger = get_logger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


# ── Schemas ───────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict


# ── Password hashing ─────────────────────────────────────

from passlib.context import CryptContext

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _hash_password(password: str) -> str:
    return _pwd_ctx.hash(password)


def _verify_password(plain: str, hashed: str) -> bool:
    return _pwd_ctx.verify(plain, hashed)


# ── JWT helpers ───────────────────────────────────────────

from jose import JWTError, jwt


def _create_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_token(token: str) -> str | None:
    """Decode a JWT and return the user_id, or None if invalid."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        return payload.get("sub")
    except JWTError:
        return None


async def get_current_user_optional(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """FastAPI dependency: extract user from JWT if present. Returns None for anonymous."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    user_id = decode_token(token)
    if not user_id:
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


# ── Session migration ────────────────────────────────────

async def _migrate_session_chats(db: AsyncSession, user_id: str, session_id: str | None) -> int:
    """Move anonymous session chats to the user's account. Returns count migrated."""
    if not session_id:
        return 0
    result = await db.execute(
        update(Conversation)
        .where(Conversation.session_id == session_id, Conversation.user_id.is_(None))
        .values(user_id=user_id)
    )
    return result.rowcount  # type: ignore[return-value]


# ── Routes ────────────────────────────────────────────────

@router.post("/register")
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
    x_session_id: str | None = Header(None),
) -> dict:
    """Create a new account and migrate anonymous chats."""
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email address")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    # Check if email already exists
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    # Create user
    user = User(
        email=email,
        name=body.name.strip() if body.name else None,
        password_hash=_hash_password(body.password),
    )
    db.add(user)
    await db.flush()  # Get user.id

    # Migrate anonymous chats
    migrated = await _migrate_session_chats(db, user.id, x_session_id)
    await db.commit()

    logger.info("auth.register", user_id=user.id, email=email, migrated_chats=migrated)

    return {
        "token": _create_token(user.id),
        "user": user.to_dict(),
        "migrated_chats": migrated,
    }


@router.post("/login")
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
    x_session_id: str | None = Header(None),
) -> dict:
    """Authenticate and migrate any anonymous chats from the current session."""
    email = body.email.strip().lower()

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not _verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Migrate anonymous chats from this session
    migrated = await _migrate_session_chats(db, user.id, x_session_id)
    if migrated:
        await db.commit()

    logger.info("auth.login", user_id=user.id, email=email, migrated_chats=migrated)

    return {
        "token": _create_token(user.id),
        "user": user.to_dict(),
        "migrated_chats": migrated,
    }


@router.get("/me")
async def get_me(
    user: User | None = Depends(get_current_user_optional),
) -> dict:
    """Get current user profile. Returns null user for anonymous sessions."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user": user.to_dict()}
