import asyncio
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import update
from app.database.session import get_db
from app.database.models.models import Approval, Message
from app.security.identity import Owner, owner_context
from app.core.config import get_settings

router = APIRouter(prefix="/approvals", tags=["approvals"])


class Decision(BaseModel):
    approved: bool


@router.get("/{approval_id}")
async def approval_status(
    approval_id: str, owner: Owner = Depends(owner_context), db=Depends(get_db)
):
    record = await db.get(Approval, approval_id)
    if not record or record.owner_key != owner.key:
        raise HTTPException(404, "Approval not found")
    status = record.status
    if status == "pending" and record.expires_at.replace(
        tzinfo=timezone.utc
    ) <= datetime.now(timezone.utc):
        status = "expired"
    return {"status": status, "content": record.result}


@router.post("/{approval_id}")
async def decide(
    approval_id: str,
    body: Decision,
    owner: Owner = Depends(owner_context),
    db=Depends(get_db),
):
    if not owner.user_id or owner.user_id != get_settings().connector_owner_id:
        raise HTTPException(403, "Connector permission required")
    record = await db.get(Approval, approval_id)
    if not record or record.owner_key != owner.key:
        raise HTTPException(404, "Approval not found")
    result = await db.execute(
        update(Approval)
        .where(
            Approval.id == approval_id,
            Approval.status == "pending",
            Approval.expires_at > datetime.now(timezone.utc),
        )
        .values(status="executing" if body.approved else "rejected")
        .execution_options(synchronize_session=False)
    )
    await db.commit()
    if result.rowcount != 1:
        raise HTTPException(409, "Approval expired or already handled")
    if not body.approved:
        return {"status": "rejected"}
    from app.tools.slack_tools import send_slack_message
    from app.tools.linear_tools import create_linear_issue

    tools = {t.name: t for t in (send_slack_message, create_linear_issue)}
    from app.services.approvals import approved_action, action_digest

    action_token = approved_action.set(
        action_digest(record.tool_name, json.loads(record.arguments))
    )
    try:
        output = str(
            await asyncio.wait_for(
                tools[record.tool_name].ainvoke(json.loads(record.arguments)), 25
            )
        )
        status = (
            "failed" if output.lower().startswith(("error", "failed")) else "completed"
        )
    except Exception:
        output = "The action did not return a confirmed result. Check the destination before retrying."
        status = "unknown"
    finally:
        approved_action.reset(action_token)
    await db.execute(
        update(Approval)
        .where(Approval.id == approval_id)
        .values(status=status, result=output[:10000])
    )
    if record.conversation_id:
        db.add(
            Message(
                conversation_id=record.conversation_id,
                role="agent",
                agent_name="orchestrator",
                content=output[:10000],
            )
        )
    await db.commit()
    return {"status": status, "content": output}
