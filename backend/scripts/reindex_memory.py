"""Explicit, scoped reindex after migrating to owner-filtered memory v2."""

import argparse
import asyncio
from sqlalchemy import select
from app.database.session import async_session_factory
from app.database.models.models import Conversation, Message
from app.memory.vector_store import store_message, close_qdrant
from app.security.identity import Owner, current_owner


async def main(user_id, limit):
    token = current_owner.set(Owner(user_id=user_id))
    try:
        async with async_session_factory() as db:
            rows = (
                await db.scalars(
                    select(Message)
                    .join(Conversation)
                    .where(Conversation.user_id == user_id)
                    .order_by(Message.id.desc())
                    .limit(limit)
                )
            ).all()
        count = 0
        for message in rows:
            if await store_message(
                message.conversation_id,
                message.role,
                message.content,
                agent_name=message.agent_name,
                message_id=message.id,
            ):
                count += 1
        print(f"Indexed {count} of {len(rows)} messages for the requested account.")
        if rows and count == 0:
            raise SystemExit(
                "Indexing unavailable. Check Qdrant and embedding credentials."
            )
    finally:
        current_owner.reset(token)
        await close_qdrant()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--limit", type=int, default=200)
    args = parser.parse_args()
    if not 1 <= args.limit <= 1000:
        parser.error("--limit must be between 1 and 1000")
    asyncio.run(main(args.user_id, args.limit))
