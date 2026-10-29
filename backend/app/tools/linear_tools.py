"""Linear integration tools."""

from app.core.config import get_settings
from app.security.identity import require_context
from langchain_core.tools import tool
import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)


@tool
async def create_linear_issue(title: str, description: str, team_id: str = "") -> str:
    """Create an issue in Linear.

    Args:
        title: The title of the issue.
        description: The description of the issue.
        team_id: The ID of the team to create the issue in. Required; never choose a team automatically.
    """
    logger.info("tool.create_linear_issue")

    from app.services.approvals import require_approved

    require_approved(
        "create_linear_issue",
        {"title": title, "description": description, "team_id": team_id},
    )
    settings = get_settings()
    owner = require_context()
    if not owner.user_id or owner.user_id != settings.connector_owner_id:
        raise PermissionError("Connector permission required")
    token = settings.linear_api_key
    if not token:
        return "ERROR: LINEAR_API_KEY environment variable is not set. Please set it to use this tool."

    try:
        async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
            headers = {"Authorization": token, "Content-Type": "application/json"}

            if not team_id:
                return "ERROR: An explicit Linear team_id is required."

            mutation = """
            mutation IssueCreate($title: String!, $description: String, $teamId: String!) {
              issueCreate(input: {title: $title, description: $description, teamId: $teamId}) {
                success
                issue { id identifier title url }
              }
            }
            """

            variables = {"title": title, "description": description, "teamId": team_id}

            response = await client.post(
                "https://api.linear.app/graphql",
                json={"query": mutation, "variables": variables},
                headers=headers,
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()

            if "errors" in data:
                return "ERROR: Linear rejected the action."

            result = data.get("data", {}).get("issueCreate", {})
            if not result.get("success") or not result.get("issue"):
                return "ERROR: Linear did not confirm issue creation."
            issue = result["issue"]
            return f"Successfully created issue {issue['identifier']}: {issue['title']}\nURL: {issue['url']}"

    except Exception:
        return "ERROR: Linear did not confirm issue creation. Check the destination before retrying."
