"""Concrete tool implementations for agents.

Each tool is a plain async function decorated with @tool so LangChain can
bind it to the LLM's function-calling interface.
"""

from datetime import datetime

from langchain_core.tools import tool

from app.core.logging import get_logger
from app.tools.hitl import request_user_approval
from app.tools.github_tools import search_github_repos
from app.tools.linear_tools import create_linear_issue
from app.tools.slack_tools import send_slack_message
from app.tools.memory_tools import search_memory

logger = get_logger(__name__)


@tool
async def web_search(query: str) -> str:
    """Search the web for current information. Use this when you need to find
    up-to-date facts, news, or answers that require internet access.

    Args:
        query: The search query string.
    """
    logger.info("tool.web_search", query_chars=len(query))

    import asyncio

    def _search():
        from ddgs import DDGS

        results = []
        with DDGS(timeout=12) as ddgs:
            for r in ddgs.text(query, max_results=6):
                date_info = f"\nPublished: {r['date']}" if r.get("date") else ""
                results.append(
                    f"**{r['title']}**\n{r['body']}{date_info}\nSource: {r['href']}"
                )
        return results

    try:
        results = await asyncio.to_thread(_search)
        if results:
            return "\n\n---\n\n".join(results)
    except Exception as exc:
        logger.warning("tool.web_search.ddg_failed", error=str(exc))

    return f"Search completed for '{query}' but no results were returned. Please try a different query."


@tool
async def fetch_url(url: str) -> str:
    """Fetch and extract the main text content from a web page URL.
    Use this after web_search to read the full content of promising results
    so you can cite accurate facts, dates, and details instead of guessing.

    Args:
        url: The full URL to fetch content from (e.g., 'https://example.com/article').
    """
    from app.security.fetch import fetch_public
    import asyncio

    try:
        final_url, html = await fetch_public(url)
        import trafilatura

        text = await asyncio.to_thread(
            trafilatura.extract, html, include_comments=False, include_tables=True
        )
        return (
            f"Source: {final_url}\n{text[:8000]}"
            if text
            else "No readable text was found. Do not infer page contents."
        )
    except Exception:
        return "This URL could not be safely retrieved. Do not invent its contents."


@tool
async def open_url(url: str) -> str:
    """Return a web link the user can open. This does not control the browser.

    Args:
        url: The full URL to open (e.g., 'https://youtube.com').
    """
    logger.info("tool.open_url", url=url)

    # Normalize URL
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        # On a cloud server, webbrowser.open will launch terminal browsers and hang.
        # Just return the URL so the LLM can give it to the user.
        return f"I cannot open URLs directly in the cloud. Please provide this link to the user to click: {url}"
    except Exception as exc:
        return f"Failed to open {url}: {exc}"


@tool
async def run_code(code: str, language: str = "python") -> str:
    """Execute code in an isolated runner when configured and return the output. Supports Python,
    JavaScript, and Bash. The code runs in an isolated temporary directory with
    a 30-second timeout. If execution is unavailable, clearly say the code was not tested.

    Args:
        code: The source code to execute.
        language: Programming language — 'python', 'javascript', or 'bash'. Defaults to 'python'.
    """
    from app.tools.code_sandbox import CodeSandbox

    logger.info("tool.run_code", language=language, code_length=len(code))
    result = await CodeSandbox.execute(code, language=language, timeout=30)
    return result.to_display()


# Keep legacy name as alias for backward compatibility
execute_python = run_code


@tool
async def calculate(expression: str) -> str:
    """Safely evaluate a mathematical expression and return the result.

    Args:
        expression: A math expression like '2 + 2', 'sqrt(16)', '3.14 * (5**2)'.
    """
    from app.security.arithmetic import evaluate

    try:
        return f"Result: {evaluate(expression)}"
    except (ValueError, SyntaxError, ArithmeticError, RecursionError) as exc:
        return f"Error: {exc}"


@tool
async def get_current_time(timezone_name: str = "UTC") -> str:
    """Return current time in an IANA timezone supplied by the user; default UTC."""
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    try:
        if len(timezone_name) > 80:
            raise ValueError("Invalid timezone")
        zone = ZoneInfo(timezone_name)
    except (ValueError, ZoneInfoNotFoundError):
        return "Unknown timezone. Ask for an IANA timezone such as Asia/Kolkata."
    return datetime.now(zone).isoformat() + " (" + timezone_name + ")"


@tool
async def read_file(file_path: str) -> str:
    """Read the contents of a file. Limited to text files under 50KB.

    Args:
        file_path: Path to the file to read.
    """
    from app.services.files import read_private_file

    return await read_private_file(file_path)


@tool
async def write_file(file_path: str, content: str) -> str:
    """Write content to a file. Creates parent directories if needed.

    Args:
        file_path: Path where the file will be created/overwritten.
        content: The text content to write.
    """
    from app.services.files import save_artifact

    record = await save_artifact(file_path, content.encode(), "text/plain")
    return f"Saved {record.filename}. [DOWNLOAD_LINK:{record.id}:{record.filename}]"


# ── Tool collections per agent role ──────────────────────

RESEARCH_TOOLS = [web_search, fetch_url, open_url, get_current_time, search_memory]
CODING_TOOLS = [run_code, read_file, write_file, calculate, request_user_approval]
GENERAL_TOOLS = [
    web_search,
    open_url,
    run_code,
    calculate,
    get_current_time,
    read_file,
    write_file,
    request_user_approval,
    search_github_repos,
    create_linear_issue,
    send_slack_message,
    search_memory,
]
