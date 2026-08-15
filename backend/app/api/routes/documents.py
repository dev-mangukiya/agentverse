"""Document download API routes."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path

from app.tools.document_tools import get_generated_doc
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/download/{file_id}")
async def download_document(file_id: str):
    """Download a generated document by its file ID."""
    doc = get_generated_doc(file_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found or expired")

    filepath = Path(doc["path"])
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Document file not found")

    # Determine media type
    media_types = {
        "markdown": "text/markdown",
        "text": "text/plain",
        "html": "text/html",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "pdf": "application/pdf",
    }
    media_type = media_types.get(doc.get("format", "markdown"), "application/octet-stream")

    logger.info("documents.download", file_id=file_id, filename=doc["filename"])

    return FileResponse(
        path=str(filepath),
        filename=doc["filename"],
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{doc["filename"]}"',
        },
    )
