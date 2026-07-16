"""SQLAlchemy ORM models for conversations, messages, and task executions."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database.session import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String(12), primary_key=True, default=_new_id)
    session_id = Column(String(64), nullable=True, index=True)
    title = Column(String(200), nullable=False, default="New conversation")
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
        lazy="selectin",
    )

    def to_dict(self, include_messages: bool = False) -> dict:
        d = {
            "id": self.id,
            "title": self.title,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "message_count": len(self.messages) if self.messages else 0,
        }
        if include_messages:
            d["messages"] = [m.to_dict() for m in (self.messages or [])]
        return d


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(String(12), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(10), nullable=False)  # "user" | "agent" | "system" | "tool"
    agent_name = Column(String(50), nullable=True)
    content = Column(Text, nullable=False)
    tool_name = Column(String(50), nullable=True)
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
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class TaskExecution(Base):
    __tablename__ = "task_executions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(String(12), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
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
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class CustomAgent(Base):
    """User-created custom agents with configurable prompts and tools."""
    __tablename__ = "custom_agents"

    id = Column(String(12), primary_key=True, default=_new_id)
    name = Column(String(50), nullable=False, unique=True)
    emoji = Column(String(10), nullable=False, default="🤖")
    description = Column(String(200), nullable=True)
    system_prompt = Column(Text, nullable=False)
    tools_json = Column(Text, nullable=False, default="[]")  # JSON array of tool names
    model = Column(String(50), nullable=True)  # Optional model override
    is_active = Column(Integer, nullable=False, default=1)  # SQLite-compatible boolean
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

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
