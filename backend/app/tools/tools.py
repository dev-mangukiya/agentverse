"""Concrete tool implementations for agents.

Each tool is a plain async function decorated with @tool so LangChain can
bind it to the LLM's function-calling interface.
"""

import ast
import io
import subprocess
import sys
import webbrowser
from datetime import datetime, timezone
from pathlib import Path

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
    logger.info("tool.web_search", query=query)

    import asyncio

    def _search():
        from ddgs import DDGS
        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=10):
                results.append(f"**{r['title']}**\n{r['body']}\nSource: {r['href']}")
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
    logger.info("tool.fetch_url", url=url)

    import asyncio

    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    def _fetch():
        import urllib.request
        import ssl

        # Generous but bounded timeout
        ctx = ssl.create_default_context()
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; AgentVerse/1.0)"})
        try:
            with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
                # Limit download to 50KB to avoid memory issues
                raw = resp.read(50_000)
                html = raw.decode("utf-8", errors="replace")
        except Exception as exc:
            return f"Failed to fetch URL: {exc}"

        # Try trafilatura first (best at extracting article text)
        try:
            import trafilatura
            text = trafilatura.extract(
                html,
                include_comments=False,
                include_tables=True,
                favor_recall=True,
            )
            if text and len(text.strip()) > 100:
                # Truncate to keep context window manageable
                if len(text) > 8000:
                    text = text[:8000] + "\n\n[Content truncated — 8000 char limit]"
                return f"Content from {url}:\n\n{text}"
        except ImportError:
            pass
        except Exception:
            pass

        # Fallback: basic tag stripping
        import re as _re
        text = _re.sub(r'<script[^>]*>.*?</script>', '', html, flags=_re.DOTALL | _re.IGNORECASE)
        text = _re.sub(r'<style[^>]*>.*?</style>', '', html, flags=_re.DOTALL | _re.IGNORECASE)
        text = _re.sub(r'<[^>]+>', ' ', text)
        text = _re.sub(r'\s+', ' ', text).strip()
        if len(text) > 8000:
            text = text[:8000] + "\n\n[Content truncated — 8000 char limit]"
        if len(text) > 100:
            return f"Content from {url}:\n\n{text}"
        return f"Could not extract meaningful text from {url}. The page may require JavaScript or login."

    try:
        return await asyncio.to_thread(_fetch)
    except Exception as exc:
        return f"Error fetching {url}: {exc}"


@tool
async def open_url(url: str) -> str:
    """Open a URL in the user's default web browser. Use this when the user asks
    to open a website, navigate to a page, or visit a link.

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
    """Execute code in a secure sandbox and return the output. Supports Python,
    JavaScript, and Bash. The code runs in an isolated temporary directory with
    a 30-second timeout. Always test your code using this tool before returning
    it to the user.

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
    logger.info("tool.calculate", expression=expression)

    import math

    allowed_names = {
        k: v for k, v in math.__dict__.items()
        if not k.startswith("_")
    }
    allowed_names.update({"abs": abs, "round": round, "min": min, "max": max, "sum": sum})

    try:
        tree = ast.parse(expression, mode="eval")
        # Only allow safe node types
        for node in ast.walk(tree):
            if isinstance(node, (ast.Call,)):
                if isinstance(node.func, ast.Name) and node.func.id not in allowed_names:
                    return f"Error: Function '{node.func.id}' is not allowed."
        result = eval(compile(tree, "<calc>", "eval"), {"__builtins__": {}}, allowed_names)  # noqa: S307
        return f"Result: {result}"
    except Exception as exc:
        return f"Error evaluating '{expression}': {exc}"


@tool
async def get_current_time() -> str:
    """Get the current date and time. Use this when the user asks about the
    current time, date, or when time-awareness is needed.
    """
    now = datetime.now(timezone.utc)
    local = datetime.now()
    return (
        f"Current UTC time: {now.strftime('%Y-%m-%d %H:%M:%S %Z')}\n"
        f"Local time: {local.strftime('%Y-%m-%d %H:%M:%S')}"
    )


@tool
async def read_file(file_path: str) -> str:
    """Read the contents of a file. Limited to text files under 50KB.

    Args:
        file_path: Path to the file to read.
    """
    logger.info("tool.read_file", path=file_path)
    path = Path(file_path).resolve()
    if not path.exists():
        return f"Error: File '{file_path}' does not exist."
    if not path.is_file():
        return f"Error: '{file_path}' is not a file."
    if path.stat().st_size > 50_000:
        return f"Error: File is too large ({path.stat().st_size} bytes). Max 50KB."
    try:
        return path.read_text(encoding="utf-8")
    except Exception as exc:
        return f"Error reading file: {exc}"


@tool
async def write_file(file_path: str, content: str) -> str:
    """Write content to a file. Creates parent directories if needed.

    Args:
        file_path: Path where the file will be created/overwritten.
        content: The text content to write.
    """
    logger.info("tool.write_file", path=file_path, length=len(content))
    try:
        path = Path(file_path).resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return f"Successfully wrote {len(content)} characters to {file_path}"
    except Exception as exc:
        return f"Error writing file: {exc}"


# ── Tool collections per agent role ──────────────────────

RESEARCH_TOOLS = [web_search, fetch_url, open_url, get_current_time, search_memory]
CODING_TOOLS = [run_code, read_file, write_file, calculate, request_user_approval]
GENERAL_TOOLS = [web_search, open_url, run_code, calculate, get_current_time, read_file, write_file, request_user_approval, search_github_repos, create_linear_issue, send_slack_message, search_memory]
