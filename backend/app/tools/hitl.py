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
    from app.services.approvals import ApprovalRequired

    raise ApprovalRequired()
