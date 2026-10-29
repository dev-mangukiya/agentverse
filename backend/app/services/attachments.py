"""Validate and persist uploaded bytes under the authenticated conversation."""

import asyncio
import base64
import binascii
import io
import json
from datetime import datetime, timezone

from sqlalchemy import select, func
from app.database.models.models import Artifact, Conversation
from app.security.identity import current_owner
from app.services.files import save_artifact


async def persist_attachments(attachments):
    records = []
    if len(attachments or []) > 3:
        raise ValueError("At most three attachments are supported")
    for attachment in attachments or []:
        data = attachment.get("data", "")
        if not data.startswith("data:") or "," not in data:
            raise ValueError("Invalid attachment data")
        header, encoded = data.split(",", 1)
        mime = header.removeprefix("data:").split(";")[0]
        if (
            ";base64" not in header
            or mime not in ("image/png", "image/jpeg", "image/webp", "application/pdf")
            or len(encoded) > 2_800_000
        ):
            raise ValueError("Unsupported attachment type or size")
        try:
            raw = base64.b64decode(encoded, validate=True)
        except binascii.Error:
            raise ValueError("Invalid attachment encoding")
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError("Attachment exceeds 2 MB")
        if mime.startswith("image/"):

            def verify():
                from PIL import Image

                with Image.open(io.BytesIO(raw)) as image:
                    if image.width * image.height > 20_000_000:
                        raise ValueError("Image resolution is too large")
                    image.verify()

            try:
                await asyncio.to_thread(verify)
            except (OSError, ValueError) as exc:
                raise ValueError("Invalid or oversized image") from exc
        elif not raw.startswith(b"%PDF-"):
            raise ValueError("Invalid PDF")
        import re

        name = re.sub(r"[^\w. -]", "_", str(attachment.get("name", "attachment")))[:120]
        record = await save_artifact(name or "attachment", raw, mime)
        records.append({"id": record.id, "name": record.filename, "content_type": mime})
    return records


async def historical_images(db, conversation_id, messages):
    """Restore only recent, live, owned uploads; never trust JSON metadata as access."""
    owner = current_owner.get()
    if owner is None:
        return {}
    references = []
    # messages are newest first; favor the latest images within a 3-image budget.
    for message in messages:
        if message.role != "user":
            continue
        try:
            metadata = json.loads(message.attachments_json or "[]")
        except (TypeError, ValueError):
            continue
        if not isinstance(metadata, list):
            continue
        for item in metadata[:3]:
            if (
                isinstance(item, dict)
                and isinstance(item.get("id"), str)
                and str(item.get("content_type", "")).startswith("image/")
            ):
                references.append((message.id, item["id"]))
    ids = list(dict.fromkeys(artifact_id for _, artifact_id in references))[:3]
    if not ids:
        return {}
    records = (
        await db.scalars(
            select(Artifact)
            .join(Conversation)
            .where(
                Artifact.id.in_(ids),
                Artifact.conversation_id == conversation_id,
                Artifact.owner_key == owner.key,
                owner.condition(),
                Artifact.expires_at > datetime.now(timezone.utc),
                Artifact.content_type.in_(["image/png", "image/jpeg", "image/webp"]),
                func.length(Artifact.data) <= 2 * 1024 * 1024,
            )
        )
    ).all()
    by_id = {record.id: record for record in records}
    result = {}
    for message_id, artifact_id in references:
        parts = result.setdefault(message_id, [])
        record = by_id.pop(artifact_id, None)
        if record:
            parts.extend(
                [
                    {
                        "type": "text",
                        "text": "Previously uploaded image: " + record.filename,
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": "data:"
                            + record.content_type
                            + ";base64,"
                            + base64.b64encode(record.data).decode()
                        },
                    },
                ]
            )
        else:
            parts.append(
                {
                    "type": "text",
                    "text": "[Earlier image unavailable or omitted by the image limit. Ask for it again if needed; do not infer its contents.]",
                }
            )
    return result
