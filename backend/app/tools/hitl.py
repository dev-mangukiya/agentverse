"""Human-in-the-Loop (HITL) tools.

Provides mechanisms for agents to request user approval before taking
irreversible or sensitive actions.
"""

from langchain_core.tools import tool

from app.core.logging import get_logger

logger = get_logger(__name__)


@tool
async def request_user_approval(action: str, reason: str) -> str:
    """Use this tool to ask the user for explicit permission before taking irreversible actions 
    like deploying to production, deleting databases, or spending money.

    Args:
        action: A short string describing the action (e.g. 'deploy_production', 'delete_table').
        reason: Why the action is necessary.
    """
    logger.info("tool.request_user_approval", action=action, reason=reason)
    
    # We return a specific structured format that the frontend will parse to show an approval UI.
    # The agent receives this string and outputs it to the user.
    return (
        "STOP IMMEDIATELY. Output the following exact string in your response to the user so they can approve the action:\n\n"
        f"[APPROVAL_REQUIRED:{action}:{reason}]\n\n"
        "Do not execute the action until the user has explicitly responded with 'APPROVED' or 'REJECTED'."
    )
