"""Owner-scoped, chunked semantic memory; SQL ownership is checked on every read."""

import asyncio
import math
import time
import uuid
from sqlalchemy import select
from app.core.config import get_settings
from app.database.session import async_session_factory
from app.database.models.models import Conversation
from app.security.identity import require_context
from app.core.logging import get_logger

logger = get_logger(__name__)
_qdrant_client = None
_retry_at = 0.0
_lock = asyncio.Lock()


async def _get_qdrant():
    global _qdrant_client, _retry_at
    async with _lock:
        if _qdrant_client is not None:
            return _qdrant_client
        if time.monotonic() < _retry_at or not get_settings().qdrant_url:
            return None
        from qdrant_client import AsyncQdrantClient

        settings = get_settings()
        client = AsyncQdrantClient(
            url=settings.qdrant_url, api_key=settings.qdrant_api_key, timeout=5
        )
        try:
            await client.get_collections()
            _qdrant_client = client
            return client
        except asyncio.CancelledError:
            await client.close()
            raise
        except Exception:
            await client.close()
            _retry_at = time.monotonic() + 30
            return None


async def close_qdrant():
    global _qdrant_client
    if _qdrant_client:
        await _qdrant_client.close()
        _qdrant_client = None


async def _async_embed(text):
    settings = get_settings()
    if not settings.google_api_key_list:
        return None
    from google import genai
    from google.genai import types

    async with genai.Client(
        api_key=settings.google_api_key_list[0],
        http_options=types.HttpOptions(timeout=10000),
    ).aio as client:
        response = await client.models.embed_content(
            model=settings.embedding_model,
            contents=text,
            config=types.EmbedContentConfig(output_dimensionality=768),
        )
    vector = response.embeddings[0].values
    norm = math.sqrt(sum(v * v for v in vector))
    return [v / norm for v in vector] if norm else None


async def ensure_collection():
    client = await _get_qdrant()
    if not client:
        return False
    from qdrant_client.models import Distance, VectorParams

    name = get_settings().qdrant_collection
    if not await client.collection_exists(name):
        await client.create_collection(
            name, vectors_config=VectorParams(size=768, distance=Distance.COSINE)
        )
    return True


async def store_message(
    conversation_id, role, content, agent_name=None, message_id=None
):
    owner = require_context()
    async with async_session_factory() as db:
        if not await db.scalar(
            select(Conversation.id).where(
                Conversation.id == conversation_id, owner.condition()
            )
        ):
            return False
    if len(content.strip()) < 10 or not await ensure_collection():
        return False
    client = await _get_qdrant()
    from qdrant_client.models import PointStruct

    # Six overlapping chunks cap both provider expense and context size.
    chunks = [content[i : i + 3500] for i in range(0, min(len(content), 18000), 3200)]
    for i, chunk in enumerate(chunks):
        vector = await _async_embed(chunk)
        if vector is None:
            return False
        key = f"{conversation_id}:{message_id or role + content}:{i}"
        point = PointStruct(
            id=str(uuid.uuid5(uuid.NAMESPACE_URL, key)),
            vector=vector,
            payload={
                "owner_key": owner.key,
                "conversation_id": conversation_id,
                "message_id": message_id,
                "chunk": i,
                "role": role,
                "agent_name": agent_name or "",
                "content": chunk,
                "timestamp": time.time(),
            },
        )
        await client.upsert(get_settings().qdrant_collection, points=[point])
    return True


async def search_memory(query, top_k=5, conversation_id=None):
    owner = require_context()
    async with async_session_factory() as db:
        stmt = select(Conversation.id).where(owner.condition())
        if conversation_id:
            stmt = stmt.where(Conversation.id == conversation_id)
        ids = list((await db.scalars(stmt.limit(5000))).all())
    if not ids:
        return []
    client = await _get_qdrant()
    if not client:
        return []
    from qdrant_client.models import Filter, FieldCondition, MatchAny, MatchValue

    try:
        vector = await _async_embed(query[:3500])
        if vector is None:
            return []
        condition = Filter(
            must=[
                FieldCondition(key="owner_key", match=MatchValue(value=owner.key)),
                FieldCondition(key="conversation_id", match=MatchAny(any=ids)),
            ]
        )
        hits = await client.search(
            get_settings().qdrant_collection,
            query_vector=vector,
            query_filter=condition,
            limit=min(max(top_k, 1), 10),
            score_threshold=0.5,
        )
        return [{**hit.payload, "score": round(hit.score, 3)} for hit in hits]
    except Exception:
        logger.warning("memory.search_unavailable")
        return []


async def delete_conversation_memory(conversation_id):
    client = await _get_qdrant()
    if client:
        from qdrant_client.models import (
            Filter,
            FieldCondition,
            MatchValue,
            FilterSelector,
        )

        await client.delete(
            get_settings().qdrant_collection,
            points_selector=FilterSelector(
                filter=Filter(
                    must=[
                        FieldCondition(
                            key="conversation_id",
                            match=MatchValue(value=conversation_id),
                        )
                    ]
                )
            ),
        )
