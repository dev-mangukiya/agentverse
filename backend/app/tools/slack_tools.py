"""Slack integration tools."""

import os
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
    
    token = os.environ.get("SLACK_BOT_TOKEN")
    if not token:
        return "ERROR: SLACK_BOT_TOKEN environment variable is not set. Please set it to use this tool."
        
    try:
        async with httpx.AsyncClient() as client:
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "channel": channel,
                "text": message
            }
            
            response = await client.post(
                "https://slack.com/api/chat.postMessage",
                json=payload,
                headers=headers,
                timeout=10.0
            )
            response.raise_for_status()
            data = response.json()
            
            if not data.get("ok"):
                return f"Slack API Error: {data.get('error')}"
                
            return f"Successfully sent message to {channel}."
            
    except Exception as e:
        return f"Slack Integration Error: {str(e)}"
