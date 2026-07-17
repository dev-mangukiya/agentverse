"""Qdrant-backed semantic memory for agents.

Embeds conversation messages using Google's text-embedding-004 model and
stores them in Qdrant for semantic retrieval. Gracefully degrades when
Qdrant or the embedding model are unavailable.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_qdrant_client = None
_qdrant_available: bool | None = None


async def _get_qdrant():
    """Get or create the async Qdrant client singleton."""
    global _qdrant_client, _qdrant_available

    if _qdrant_available is False:
        return None
    if _qdrant_client is not None:
        return _qdrant_client

    try:
        from qdrant_client import AsyncQdrantClient

        settings = get_settings()
        _qdrant_client = AsyncQdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key,
            timeout=10,
        )
        # Quick health check
        await _qdrant_client.get_collections()
        _qdrant_available = True
        logger.info("qdrant.connected", url=settings.qdrant_url[:40])
        return _qdrant_client
    except Exception as exc:
        _qdrant_available = False
        _qdrant_client = None
        logger.warning("qdrant.unavailable", error=str(exc)[:200])
        return None


async def close_qdrant():
    """Close the Qdrant client. Call on app shutdown."""
    global _qdrant_client, _qdrant_available
    if _qdrant_client is not None:
        await _qdrant_client.close()
        _qdrant_client = None
        _qdrant_available = None
        logger.info("qdrant.closed")


def _embed_text(text: str, api_key: str, model: str = "text-embedding-004") -> list[float] | None:
    """Synchronous embedding call using Google GenAI (runs in thread pool)."""
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        result = genai.embed_content(model=f"models/{model}", content=text)
        return result["embedding"]
    except Exception as exc:
        logger.warning("embedding.failed", error=str(exc)[:200])
        return None


async def _async_embed(text: str) -> list[float] | None:
    """Async wrapper for embedding."""
    settings = get_settings()
    api_key = settings.google_api_key
    if not api_key:
        keys = settings.google_api_key_list
        api_key = keys[0] if keys else None
    if not api_key:
        return None
    return await asyncio.to_thread(_embed_text, text[:2000], api_key, settings.embedding_model)


async def ensure_collection() -> bool:
    """Create the Qdrant collection if it doesn't exist. Returns True on success."""
    client = await _get_qdrant()
    if client is None:
        return False

    settings = get_settings()
    try:
        collections = await client.get_collections()
        names = [c.name for c in collections.collections]
        if settings.qdrant_collection not in names:
            from qdrant_client.models import Distance, VectorParams
            await client.create_collection(
                collection_name=settings.qdrant_collection,
                vectors_config=VectorParams(size=768, distance=Distance.COSINE),
            )
            logger.info("qdrant.collection_created", name=settings.qdrant_collection)
        return True
    except Exception as exc:
        logger.warning("qdrant.collection_setup_failed", error=str(exc)[:200])
        return False


async def store_message(
    conversation_id: str,
    role: str,
    content: str,
    agent_name: str | None = None,
) -> bool:
    """Embed and store a message in Qdrant. Returns True on success."""
    client = await _get_qdrant()
    if client is None:
        return False

    # Skip very short messages
    if len(content.strip()) < 10:
        return False

    vector = await _async_embed(content)
    if vector is None:
        return False

    settings = get_settings()
    try:
        from qdrant_client.models import PointStruct
        point = PointStruct(
            id=str(uuid.uuid4()),
            vector=vector,
            payload={
                "conversation_id": conversation_id,
                "role": role,
                "agent_name": agent_name or "",
                "content": content[:5000],  # Limit stored content size
                "timestamp": time.time(),
            },
        )
        await client.upsert(
            collection_name=settings.qdrant_collection,
            points=[point],
        )
        return True
    except Exception as exc:
        logger.warning("qdrant.store_failed", error=str(exc)[:200])
        return False


async def search_memory(
    query: str,
    top_k: int = 5,
    conversation_id: str | None = None,
) -> list[dict[str, Any]]:
    """Search semantic memory. Returns list of {content, role, agent_name, score, conversation_id}."""
    client = await _get_qdrant()
    if client is None:
        return []

    vector = await _async_embed(query)
    if vector is None:
        return []

    settings = get_settings()
    try:
        from qdrant_client.models import Filter, FieldCondition, MatchValue

        query_filter = None
        if conversation_id:
            query_filter = Filter(
                must=[FieldCondition(key="conversation_id", match=MatchValue(value=conversation_id))]
            )

        results = await client.search(
            collection_name=settings.qdrant_collection,
            query_vector=vector,
            query_filter=query_filter,
            limit=top_k,
            score_threshold=0.5,
        )

        return [
            {
                "content": hit.payload.get("content", ""),
                "role": hit.payload.get("role", ""),
                "agent_name": hit.payload.get("agent_name", ""),
                "conversation_id": hit.payload.get("conversation_id", ""),
                "timestamp": hit.payload.get("timestamp", 0),
                "score": round(hit.score, 3),
            }
            for hit in results
        ]
    except Exception as exc:
        logger.warning("qdrant.search_failed", error=str(exc)[:200])
        return []
