"""Linear integration tools."""

import os
import json
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
        team_id: The ID of the team to create the issue in. (Optional, uses first team if omitted).
    """
    logger.info("tool.create_linear_issue", title=title)
    
    token = os.environ.get("LINEAR_API_KEY")
    if not token:
        return "ERROR: LINEAR_API_KEY environment variable is not set. Please set it to use this tool."
        
    try:
        async with httpx.AsyncClient() as client:
            headers = {
                "Authorization": token,
                "Content-Type": "application/json"
            }
            
            # If team_id is missing, fetch the first team
            if not team_id:
                query = """query { teams { nodes { id name } } }"""
                res = await client.post("https://api.linear.app/graphql", json={"query": query}, headers=headers)
                res.raise_for_status()
                teams = res.json().get("data", {}).get("teams", {}).get("nodes", [])
                if not teams:
                    return "ERROR: No teams found in Linear."
                team_id = teams[0]["id"]
                
            mutation = """
            mutation IssueCreate($title: String!, $description: String, $teamId: String!) {
              issueCreate(input: {title: $title, description: $description, teamId: $teamId}) {
                success
                issue { id identifier title url }
              }
            }
            """
            
            variables = {
                "title": title,
                "description": description,
                "teamId": team_id
            }
            
            response = await client.post(
                "https://api.linear.app/graphql",
                json={"query": mutation, "variables": variables},
                headers=headers,
                timeout=10.0
            )
            response.raise_for_status()
            data = response.json()
            
            if "errors" in data:
                return f"Linear API Error: {json.dumps(data['errors'])}"
                
            issue = data["data"]["issueCreate"]["issue"]
            return f"Successfully created issue {issue['identifier']}: {issue['title']}\nURL: {issue['url']}"
            
    except Exception as e:
        return f"Linear Integration Error: {str(e)}"
