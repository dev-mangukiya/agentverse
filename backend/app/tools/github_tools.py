"""GitHub integration tools."""

from langchain_core.tools import tool
import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)


@tool
async def search_github_repos(query: str) -> str:
    """Search for public GitHub repositories.

    Args:
        query: The search query (e.g., 'machine learning language:python').
    """
    logger.info("tool.search_github_repos")
    try:
        async with httpx.AsyncClient() as client:
            headers = {"Accept": "application/vnd.github.v3+json"}
            from app.security.identity import current_owner
            from app.core.config import get_settings

            settings = get_settings()
            owner = current_owner.get()
            if (
                owner
                and owner.user_id
                and owner.user_id == settings.connector_owner_id
                and settings.github_token
            ):
                headers["Authorization"] = f"Bearer {settings.github_token}"

            response = await client.get(
                "https://api.github.com/search/repositories",
                params={"q": query + " is:public", "per_page": 5},
                headers=headers,
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()

            if not data.get("items"):
                return f"No repositories found for '{query}'"

            results = []
            for item in data["items"]:
                results.append(
                    f"- **{item['full_name']}** (⭐ {item['stargazers_count']})\n"
                    f"  {item['description'] or 'No description'}\n"
                    f"  URL: {item['html_url']}"
                )
            return "\n".join(results)
    except Exception as e:
        return f"GitHub API Error: {str(e)}"
