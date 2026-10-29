"""SQLAlchemy ORM models for conversations, messages, and task executions."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database.session import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


class User(Base):
    """Registered user — optional; anonymous sessions work without one."""

    __tablename__ = "users"

    id = Column(String(12), primary_key=True, default=_new_id)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=True)
    google_subject = Column(String(255), nullable=True, unique=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    conversations = relationship("Conversation", back_populates="user", lazy="dynamic")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String(12), primary_key=True, default=_new_id)
    session_id = Column(String(64), nullable=True, index=True)
    user_id = Column(
        String(12),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title = Column(String(200), nullable=False, default="New conversation")
    is_pinned = Column(Integer, nullable=False, default=0)  # SQLite-compatible boolean
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    user = relationship("User", back_populates="conversations")
    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
        lazy="raise",
    )

    def to_dict(self, include_messages: bool = False) -> dict:
        d = {
            "id": self.id,
            "title": self.title,
            "is_pinned": bool(self.is_pinned) if self.is_pinned else False,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "message_count": self.message_count or 0,
        }
        if include_messages:
            d["messages"] = [m.to_dict() for m in (self.messages or [])]
        return d


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(
        String(12),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String(10), nullable=False)  # "user" | "agent" | "system" | "tool"
    agent_name = Column(String(50), nullable=True)
    content = Column(Text, nullable=False)
    attachments_json = Column(Text, nullable=True)
    tool_name = Column(String(50), nullable=True)
    feedback = Column(String(10), nullable=True)  # "up", "down", or null
    interrupted = Column(Integer, nullable=False, default=0, server_default="0")
    critic_score = Column(
        Integer, nullable=True
    )  # 1-10 quality score from Critic agent
    review_status = Column(
        String(24),
        nullable=False,
        default="not_requested",
        server_default="not_requested",
    )
    critic_review = Column(Text, nullable=True)  # Full critic review markdown
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    conversation = relationship("Conversation", back_populates="messages")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "role": self.role,
            "agent_name": self.agent_name,
            "content": self.content,
            "tool_name": self.tool_name,
            "attachments": __import__("json").loads(self.attachments_json or "[]"),
            "feedback": self.feedback,
            "interrupted": bool(self.interrupted),
            "review_status": self.review_status,
            "critic_score": self.critic_score,
            "critic_review": self.critic_review,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class TaskExecution(Base):
    __tablename__ = "task_executions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(
        String(12),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status = Column(String(20), nullable=False, default="pending")
    goal = Column(Text, nullable=True)
    plan_json = Column(Text, nullable=True)
    result_json = Column(Text, nullable=True)
    score = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "status": self.status,
            "goal": self.goal,
            "score": self.score,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat()
            if self.completed_at
            else None,
        }


class CustomAgent(Base):
    """User-created custom agents with configurable prompts and tools."""

    __tablename__ = "custom_agents"
    __table_args__ = (
        UniqueConstraint("owner_key", "name", name="uq_custom_agent_owner_name"),
    )

    id = Column(String(12), primary_key=True, default=_new_id)
    owner_key = Column(String(80), nullable=True, index=True)
    name = Column(String(50), nullable=False)
    emoji = Column(String(10), nullable=False, default="AG")
    description = Column(String(200), nullable=True)
    system_prompt = Column(Text, nullable=False)
    tools_json = Column(Text, nullable=False, default="[]")  # JSON array of tool names
    model = Column(String(50), nullable=True)  # Optional model override
    is_active = Column(Integer, nullable=False, default=1)  # SQLite-compatible boolean
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    def to_dict(self) -> dict:
        import json

        return {
            "id": self.id,
            "name": self.name,
            "emoji": self.emoji,
            "description": self.description,
            "system_prompt": self.system_prompt,
            "tools": json.loads(self.tools_json) if self.tools_json else [],
            "model": self.model,
            "is_active": bool(self.is_active),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class AccessSession(Base):
    __tablename__ = "access_sessions"
    id = Column(String(48), primary_key=True)
    user_id = Column(
        String(12),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    guest_id = Column(String(64), nullable=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked = Column(Integer, nullable=False, default=0)


class GuestClaim(Base):
    __tablename__ = "guest_claims"
    legacy_id = Column(String(64), primary_key=True)


class Run(Base):
    __tablename__ = "runs"
    id = Column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    owner_key = Column(String(80), nullable=False, index=True)
    conversation_id = Column(
        String(12),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    metrics_json = Column(Text, nullable=True)
    request_id = Column(String(64), nullable=False, unique=True)
    active_conversation = Column(String(12), nullable=True, unique=True)
    status = Column(String(24), nullable=False, default="running")
    agent_name = Column(String(50), nullable=True)
    first_token_ms = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    error_code = Column(String(80), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class ToolExecution(Base):
    __tablename__ = "tool_executions"
    id = Column(Integer, primary_key=True)
    run_id = Column(
        String(32),
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(80), nullable=False)
    status = Column(String(24), nullable=False)
    duration_ms = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)


class Artifact(Base):
    __tablename__ = "artifacts"
    id = Column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    owner_key = Column(String(80), nullable=False, index=True)
    conversation_id = Column(
        String(12),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    filename = Column(String(180), nullable=False)
    content_type = Column(String(100), nullable=False)
    data = Column(__import__("sqlalchemy").LargeBinary, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)


class Approval(Base):
    __tablename__ = "approvals"
    id = Column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    owner_key = Column(String(80), nullable=False, index=True)
    conversation_id = Column(
        String(12), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=True
    )
    tool_name = Column(String(80), nullable=False)
    arguments = Column(Text, nullable=False)
    status = Column(String(24), nullable=False, default="pending")
    expires_at = Column(DateTime(timezone=True), nullable=False)
    result = Column(Text, nullable=True)


class BackgroundJob(Base):
    __tablename__ = "background_jobs"
    id = Column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    available_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    kind = Column(String(30), nullable=False)
    conversation_id = Column(
        String(12),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    owner_key = Column(String(80), nullable=False)
    payload = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="pending", index=True)
    attempts = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)


class RecoveryToken(Base):
    __tablename__ = "recovery_tokens"
    token_hash = Column(String(64), primary_key=True)
    user_id = Column(
        String(12), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    expires_at = Column(DateTime(timezone=True), nullable=False)
    consumed = Column(Integer, nullable=False, default=0)


class MemoryDeletion(Base):
    """Deletion outbox intentionally survives conversation and account deletion."""

    __tablename__ = "memory_deletions"
    __table_args__ = (UniqueConstraint("conversation_id", "collection"),)
    id = Column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    conversation_id = Column(String(12), nullable=False)
    collection = Column(String(255), nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    available_at = Column(DateTime(timezone=True), nullable=False, index=True)
    lease_until = Column(DateTime(timezone=True), nullable=True)
    lease_token = Column(String(32), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)


# Count summaries in SQL without loading every message body.
from sqlalchemy.orm import column_property
from sqlalchemy import select, func

Conversation.message_count = column_property(
    select(func.count(Message.id))
    .where(Message.conversation_id == Conversation.id)
    .correlate_except(Message)
    .scalar_subquery()
)
