"""Slack integration tools."""

from app.core.config import get_settings
from app.security.identity import require_context
from langchain_core.tools import tool
import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)


@tool
async def send_slack_message(channel: str, message: str) -> str:
    """Send a message to a Slack channel.

    Args:
        channel: The channel name or ID (e.g. '#general' or 'C123456').
        message: The text of the message to send.
    """
    logger.info("tool.send_slack_message", channel=channel)

    from app.services.approvals import require_approved

    require_approved("send_slack_message", {"channel": channel, "message": message})
    settings = get_settings()
    owner = require_context()
    if not owner.user_id or owner.user_id != settings.connector_owner_id:
        raise PermissionError("Connector permission required")
    token = settings.slack_bot_token
    if not token:
        return "ERROR: SLACK_BOT_TOKEN environment variable is not set. Please set it to use this tool."

    try:
        async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            }

            payload = {"channel": channel, "text": message}

            response = await client.post(
                "https://slack.com/api/chat.postMessage",
                json=payload,
                headers=headers,
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()

            if not data.get("ok"):
                return "ERROR: Slack did not confirm message delivery."

            return f"Successfully sent message to {channel}."

    except Exception:
        return "ERROR: Slack did not confirm message delivery. Check the destination before retrying."
