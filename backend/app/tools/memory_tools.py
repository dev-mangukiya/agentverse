"""Memory tools — allow agents to search their semantic knowledge base.

These tools give agents the ability to recall past conversations and
retrieve relevant context from Qdrant.
"""

from __future__ import annotations

from datetime import datetime, timezone

from langchain_core.tools import tool

from app.core.logging import get_logger

logger = get_logger(__name__)


@tool
async def search_memory(query: str) -> str:
    """Search the agent's semantic memory for relevant past conversations and
    context. Use this when you need to recall what was discussed previously,
    find relevant context from past interactions, or when the user references
    something discussed earlier.

    Args:
        query: A natural language search query describing what you're looking for.
    """
    logger.info("tool.search_memory", query=query[:100])

    from app.memory.vector_store import search_memory as _search

    try:
        results = await _search(query, top_k=5)
        if not results:
            return "No relevant memories found. This might be a new topic."

        formatted = []
        for i, r in enumerate(results, 1):
            ts = r.get("timestamp", 0)
            when = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M") if ts else "unknown"
            role = r.get("role", "unknown")
            agent = r.get("agent_name", "")
            speaker = f"{agent} ({role})" if agent else role
            content = r.get("content", "")[:500]
            score = r.get("score", 0)
            formatted.append(
                f"**Memory {i}** (relevance: {score}, from: {when}, by: {speaker}):\n{content}"
            )

        return "\n\n---\n\n".join(formatted)
    except Exception as exc:
        logger.warning("tool.search_memory.failed", error=str(exc)[:200])
        return f"Memory search failed: {exc}"
