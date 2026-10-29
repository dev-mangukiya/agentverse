"""Authenticated, durable artifact downloads."""

from datetime import datetime, timezone
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Response
from app.database.session import get_db
from app.database.models.models import Artifact
from app.security.identity import Owner, get_owner

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/download/{file_id}")
async def download_document(
    file_id: str, owner: Owner = Depends(get_owner), db=Depends(get_db)
):
    record = await db.get(Artifact, file_id)
    if (
        not record
        or record.owner_key != owner.key
        or record.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc)
    ):
        raise HTTPException(404, "Document not found or expired")
    return Response(
        record.data,
        media_type=record.content_type,
        headers={
            "Content-Disposition": "attachment; filename*=UTF-8''"
            + quote(record.filename),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox",
        },
    )
