"""Exact-action approval records. Chat text cannot authorize side effects."""

import json
from contextvars import ContextVar
import hashlib
from datetime import datetime, timedelta, timezone
from app.database.models.models import Approval
from app.database.session import async_session_factory
from app.security.identity import require_context, current_conversation
from app.core.config import get_settings

SIDE_EFFECTS = {"send_slack_message", "create_linear_issue"}


class ApprovalRequired(Exception):
    def __init__(self, record=None):
        self.record = record
        super().__init__("This action needs approval before it can run.")


async def request_action(name, args):
    owner = require_context()
    if not owner.user_id or owner.user_id != get_settings().connector_owner_id:
        raise PermissionError("This account has no connector permission")
    if name == "create_linear_issue":
        args = {"team_id": "", **args}
    encoded = json.dumps(args, sort_keys=True)
    if len(encoded) > 20000:
        raise ValueError("Action is too large")
    async with async_session_factory() as db:
        record = Approval(
            owner_key=owner.key,
            conversation_id=current_conversation.get(),
            tool_name=name,
            arguments=encoded,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        )
        db.add(record)
        await db.commit()
    raise ApprovalRequired({"id": record.id, "tool": name, "arguments": args})


approved_action = ContextVar("approved_action", default=None)


def action_digest(name, args):
    return hashlib.sha256(json.dumps([name, args], sort_keys=True).encode()).hexdigest()


def require_approved(name, args):
    if approved_action.get() != action_digest(name, args):
        raise PermissionError("An approved exact action is required")
