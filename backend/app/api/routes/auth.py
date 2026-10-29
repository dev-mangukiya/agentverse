"""Account and signed guest sessions, with explicit migration and revocation."""

import asyncio
from datetime import datetime, timezone
from uuid import UUID
import bcrypt
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, update, delete
from sqlalchemy.exc import IntegrityError
from app.database.session import get_db
from app.database.models.models import (
    User,
    Conversation,
    AccessSession,
    GuestClaim,
    CustomAgent,
    Artifact,
    BackgroundJob,
    Run,
    Approval,
)
from app.security.identity import get_owner, resolve_owner, issue_session, Owner
from app.core.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    name: str | None = Field(default=None, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class GoogleAuthRequest(BaseModel):
    credential: str = Field(min_length=1, max_length=8192)


class GuestRequest(BaseModel):
    legacy_id: str | None = Field(default=None, max_length=64)


def _hash_password(password):
    if len(password.encode()) > 72:
        raise HTTPException(422, "Password must be at most 72 UTF-8 bytes")
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(plain, hashed):
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False


async def _migrate_session_chats(db, user_id, session_token):
    if not session_token:
        return 0
    try:
        owner = await resolve_owner(db, guest_token=session_token)
    except HTTPException:
        return 0
    if not owner.session_id:
        return 0
    result = await db.execute(
        update(Conversation)
        .where(owner.condition())
        .values(user_id=user_id, session_id=None)
    )
    # Preserve both definitions when the account and guest chose the same name.
    guest_agents = (
        await db.execute(
            select(CustomAgent.id, CustomAgent.name).where(
                CustomAgent.owner_key == owner.key
            )
        )
    ).all()
    for agent_id, name in guest_agents:
        try:
            async with db.begin_nested():
                await db.execute(
                    update(CustomAgent)
                    .where(CustomAgent.id == agent_id)
                    .values(owner_key=f"user:{user_id}")
                )
        except IntegrityError:
            suffix = "_" + agent_id
            await db.execute(
                update(CustomAgent)
                .where(CustomAgent.id == agent_id)
                .values(
                    owner_key=f"user:{user_id}", name=name[: 50 - len(suffix)] + suffix
                )
            )
    for model in (Artifact, BackgroundJob, Run, Approval):
        await db.execute(
            update(model)
            .where(model.owner_key == owner.key)
            .values(owner_key=f"user:{user_id}")
        )
    await db.execute(
        update(AccessSession)
        .where(AccessSession.guest_id == owner.session_id)
        .values(revoked=1)
    )
    return result.rowcount


async def _finish_login(db, user, guest_token):
    migrated = await _migrate_session_chats(db, user.id, guest_token)
    token, _ = await issue_session(db, user_id=user.id)
    await db.commit()
    return {"token": token, "user": user.to_dict(), "migrated_chats": migrated}


@router.post("/guest")
async def guest(
    body: GuestRequest, db=Depends(get_db), x_session_id: str | None = Header(None)
):
    if x_session_id:
        try:
            owner = await resolve_owner(db, guest_token=x_session_id)
            if owner.session_id:
                return {"token": x_session_id}
        except HTTPException:
            pass
    guest_id = None
    if body.legacy_id:
        # Transition old high-entropy bearer IDs once; never claim account chats.
        try:
            parsed = UUID(body.legacy_id)
            if parsed.version != 4 or str(parsed) != body.legacy_id.lower():
                raise ValueError("Not a canonical random UUID")
        except ValueError:
            raise HTTPException(422, "Invalid legacy session")
        claimed = await db.get(GuestClaim, body.legacy_id)
        if not claimed:
            db.add(GuestClaim(legacy_id=body.legacy_id))
            guest_id = body.legacy_id
    token, _ = await issue_session(db, guest_id=guest_id)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        token, _ = await issue_session(db)
        await db.commit()
    return {"token": token}


@router.post("/register")
async def register(
    body: RegisterRequest, db=Depends(get_db), x_session_id: str | None = Header(None)
):
    email = str(body.email).strip().lower()
    if await db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "Email already registered")
    hashed = await asyncio.to_thread(_hash_password, body.password)
    user = User(
        email=email, name=body.name.strip() if body.name else None, password_hash=hashed
    )
    db.add(user)
    try:
        await db.flush()
        return await _finish_login(db, user, x_session_id)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Email already registered")


@router.post("/login")
async def login(
    body: LoginRequest, db=Depends(get_db), x_session_id: str | None = Header(None)
):
    user = await db.scalar(
        select(User).where(User.email == str(body.email).strip().lower())
    )
    # Always hash/verify, including unknown accounts, to reduce enumeration timing.
    valid = await asyncio.to_thread(
        _verify_password,
        body.password,
        user.password_hash
        if user
        else "$2b$12$C6UzMDM.H6dfI/f/IKcEe.6IXjsTj1/hQjcPZVwvTrtxq65gfk4I2",
    )
    if not user or not valid:
        raise HTTPException(401, "Invalid email or password")
    return await _finish_login(db, user, x_session_id)


@router.get("/me")
async def get_me(owner: Owner = Depends(get_owner), db=Depends(get_db)):
    user = await db.get(User, owner.user_id) if owner.user_id else None
    if not user:
        raise HTTPException(401, "Not authenticated")
    return {"user": user.to_dict()}


@router.post("/logout")
async def logout(
    owner: Owner = Depends(get_owner),
    db=Depends(get_db),
    authorization: str | None = Header(None),
    x_session_id: str | None = Header(None),
):
    import jwt

    token = authorization[7:] if authorization else x_session_id
    payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    await db.execute(
        update(AccessSession)
        .where(AccessSession.id == payload["sid"])
        .values(revoked=1)
    )
    await db.commit()
    return {"status": "signed_out"}


class PasswordChange(BaseModel):
    current_password: str = Field(max_length=72)
    new_password: str = Field(min_length=8, max_length=72)


@router.post("/change-password")
async def update_password(
    body: PasswordChange, owner: Owner = Depends(get_owner), db=Depends(get_db)
):
    user = await db.get(User, owner.user_id) if owner.user_id else None
    if not user or not await asyncio.to_thread(
        _verify_password, body.current_password, user.password_hash
    ):
        raise HTTPException(401, "Invalid credentials")
    user.password_hash = await asyncio.to_thread(_hash_password, body.new_password)
    await db.execute(
        update(AccessSession).where(AccessSession.user_id == user.id).values(revoked=1)
    )
    return await _finish_login(db, user, None)


@router.post("/google")
async def google_auth(
    body: GoogleAuthRequest, db=Depends(get_db), x_session_id: str | None = Header(None)
):
    if not settings.google_oauth_client_id:
        raise HTTPException(503, "Google sign-in is not configured")
    from google.oauth2 import id_token
    from google.auth.transport.requests import Request

    try:
        info = await asyncio.wait_for(
            asyncio.to_thread(
                id_token.verify_oauth2_token,
                body.credential,
                Request(),
                settings.google_oauth_client_id,
            ),
            10,
        )
    except Exception:
        raise HTTPException(401, "Invalid Google credential")
    if not info.get("email_verified") or not info.get("sub"):
        raise HTTPException(401, "A verified Google identity is required")
    email = str(info.get("email", "")).lower()
    user = await db.scalar(select(User).where(User.google_subject == info["sub"]))
    if not user:
        if await db.scalar(select(User.id).where(User.email == email)):
            raise HTTPException(
                409, "Sign in with your password and link Google in account settings"
            )
        import secrets

        user = User(
            email=email,
            name=str(info.get("name", ""))[:100],
            google_subject=info["sub"],
            password_hash=await asyncio.to_thread(
                _hash_password, secrets.token_urlsafe(32)
            ),
        )
        db.add(user)
        await db.flush()
    return await _finish_login(db, user, x_session_id)


class RecoveryRequest(BaseModel):
    email: EmailStr


class RecoveryConfirm(BaseModel):
    token: str = Field(min_length=32, max_length=100)
    password: str = Field(min_length=8, max_length=72)


@router.post("/recovery")
async def recovery(body: RecoveryRequest, db=Depends(get_db)):
    """Send a one-time recovery link only when mail delivery is configured."""
    if (
        not settings.smtp_host
        or not settings.smtp_from
        or not settings.public_frontend_url
    ):
        raise HTTPException(
            503, "Password recovery is not configured. Contact the app administrator."
        )
    user = await db.scalar(select(User).where(User.email == str(body.email).lower()))
    if user:
        import hashlib, secrets
        from datetime import timedelta
        from app.database.models.models import RecoveryToken
        from app.services.mail import send_recovery

        raw = secrets.token_urlsafe(32)
        db.add(
            RecoveryToken(
                token_hash=hashlib.sha256(raw.encode()).hexdigest(),
                user_id=user.id,
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
            )
        )
        await db.commit()
        try:
            await asyncio.wait_for(
                asyncio.to_thread(send_recovery, user.email, raw), 15
            )
        except Exception:
            # Same response as an unknown email; never reveal account existence.
            from app.core.logging import get_logger

            get_logger(__name__).warning("auth.recovery_delivery_failed")
    return {"status": "If the account exists, a recovery link will be sent."}


@router.post("/reset-password")
async def reset_password(body: RecoveryConfirm, db=Depends(get_db)):
    import hashlib
    from app.database.models.models import RecoveryToken

    digest = hashlib.sha256(body.token.encode()).hexdigest()
    record = await db.get(RecoveryToken, digest)
    hashed = await asyncio.to_thread(_hash_password, body.password)
    if not record:
        raise HTTPException(400, "Recovery link is invalid or expired")
    changed = await db.execute(
        update(RecoveryToken)
        .where(
            RecoveryToken.token_hash == digest,
            RecoveryToken.consumed == 0,
            RecoveryToken.expires_at > datetime.now(timezone.utc),
        )
        .values(consumed=1)
        .execution_options(synchronize_session=False)
    )
    if changed.rowcount != 1:
        await db.rollback()
        raise HTTPException(400, "Recovery link is invalid or expired")
    await db.execute(
        update(User).where(User.id == record.user_id).values(password_hash=hashed)
    )
    await db.execute(
        update(AccessSession)
        .where(AccessSession.user_id == record.user_id)
        .values(revoked=1)
    )
    await db.commit()
    return {"status": "Password changed. Sign in with your new password."}


@router.post("/google/link")
async def link_google(
    body: GoogleAuthRequest, owner: Owner = Depends(get_owner), db=Depends(get_db)
):
    if not owner.user_id or not settings.google_oauth_client_id:
        raise HTTPException(403, "Sign in before linking Google")
    from google.oauth2 import id_token
    from google.auth.transport.requests import Request

    try:
        info = await asyncio.wait_for(
            asyncio.to_thread(
                id_token.verify_oauth2_token,
                body.credential,
                Request(),
                settings.google_oauth_client_id,
            ),
            10,
        )
    except Exception:
        raise HTTPException(401, "Invalid Google credential")
    user = await db.get(User, owner.user_id)
    if (
        not info.get("email_verified")
        or not info.get("sub")
        or info.get("email", "").lower() != user.email
    ):
        raise HTTPException(400, "Google account email must match this account")
    user.google_subject = info["sub"]
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "This Google identity is already linked")
    return {"status": "linked"}


class DeleteAccount(BaseModel):
    password: str = Field(min_length=1, max_length=72)


@router.delete("/account")
async def delete_account(
    body: DeleteAccount, owner: Owner = Depends(get_owner), db=Depends(get_db)
):
    user = await db.get(User, owner.user_id) if owner.user_id else None
    if not user or not await asyncio.to_thread(
        _verify_password, body.password, user.password_hash
    ):
        raise HTTPException(401, "Confirm your password before deleting the account")
    # Explicitly remove conversations first; legacy FKs may use SET NULL.
    from app.services.memory_cleanup import schedule_deletion

    ids = await db.scalars(
        select(Conversation.id).where(Conversation.user_id == user.id)
    )
    for conversation_id in ids:
        await schedule_deletion(db, conversation_id)
    await db.execute(delete(Conversation).where(Conversation.user_id == user.id))
    for model in (CustomAgent, Artifact, BackgroundJob):
        await db.execute(delete(model).where(model.owner_key == owner.key))
    await db.delete(user)
    await db.commit()
    return {"status": "deleted"}
