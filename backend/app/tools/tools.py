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
            for r in ddgs.text(query, max_results=5):
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
        webbrowser.open(url)
        return f"Successfully opened {url} in the default browser."
    except Exception as exc:
        return f"Failed to open {url}: {exc}"


@tool
async def execute_python(code: str) -> str:
    """Execute Python code and return the output. Use this for calculations,
    data processing, or running scripts. The code runs in a subprocess with
    a 30-second timeout.

    Args:
        code: The Python code to execute.
    """
    logger.info("tool.execute_python", code_length=len(code))

    import asyncio

    def _run():
        return subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            text=True,
            timeout=30,
            cwd="/tmp",
        )

    try:
        result = await asyncio.to_thread(_run)
        output_parts = []
        if result.stdout.strip():
            output_parts.append(f"**Output:**\n```\n{result.stdout.strip()}\n```")
        if result.stderr.strip():
            output_parts.append(f"**Errors:**\n```\n{result.stderr.strip()}\n```")
        if not output_parts:
            output_parts.append("Code executed successfully with no output.")
        if result.returncode != 0:
            output_parts.append(f"Exit code: {result.returncode}")
        return "\n\n".join(output_parts)
    except subprocess.TimeoutExpired:
        return "Error: Code execution timed out after 30 seconds."
    except Exception as exc:
        return f"Error executing code: {exc}"


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

RESEARCH_TOOLS = [web_search, open_url, get_current_time]
CODING_TOOLS = [execute_python, read_file, write_file, calculate]
GENERAL_TOOLS = [web_search, open_url, execute_python, calculate, get_current_time, read_file, write_file]
