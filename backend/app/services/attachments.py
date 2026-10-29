"""Validate and persist uploaded bytes under the authenticated conversation."""

import asyncio
import base64
import binascii
import io
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
