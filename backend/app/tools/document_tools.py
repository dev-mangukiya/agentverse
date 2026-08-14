"""Document-related tools for reading and generating documents."""

import os
import uuid
import time
from pathlib import Path

from langchain_core.tools import tool
from app.core.logging import get_logger

logger = get_logger(__name__)

# Temporary document storage — cleaned up periodically
DOCS_DIR = Path("/tmp/agentverse_docs")
DOCS_DIR.mkdir(parents=True, exist_ok=True)

# Track generated documents for cleanup
_generated_docs: dict[str, dict] = {}  # file_id -> {path, created_at, filename}


@tool
async def analyze_document(document_text: str) -> str:
    """Analyze a document and provide a structured analysis including key points,
    themes, and a summary. Use this when asked to analyze, review, or break down
    a document.

    Args:
        document_text: The full text content of the document to analyze.
    """
    logger.info("tool.analyze_document", text_length=len(document_text))

    if not document_text.strip():
        return "Error: No document text provided."

    # Truncate very long documents
    if len(document_text) > 50000:
        document_text = document_text[:50000] + "\n\n[Document truncated at 50,000 characters]"

    word_count = len(document_text.split())
    char_count = len(document_text)
    line_count = document_text.count("\n") + 1

    return (
        f"Document Statistics:\n"
        f"- Words: {word_count:,}\n"
        f"- Characters: {char_count:,}\n"
        f"- Lines: {line_count:,}\n\n"
        f"Document Content:\n{document_text}\n\n"
        f"Please provide your analysis of this document."
    )


@tool
async def extract_key_points(document_text: str, max_points: int = 10) -> str:
    """Extract key points, facts, figures, and dates from a document.
    Returns them as a structured list.

    Args:
        document_text: The text content to extract key points from.
        max_points: Maximum number of key points to extract (default: 10).
    """
    logger.info("tool.extract_key_points", text_length=len(document_text))

    if not document_text.strip():
        return "Error: No text provided for key point extraction."

    return (
        f"Please extract up to {max_points} key points from the following document:\n\n"
        f"{document_text[:30000]}\n\n"
        f"Format each key point clearly with a bullet point."
    )


@tool
async def generate_document(
    content: str,
    title: str = "Document",
    format: str = "markdown",
) -> str:
    """Generate a downloadable document file from the given content.
    Creates the file and returns a download link.

    Args:
        content: The full text content for the document.
        title: The title/filename for the document (without extension).
        format: Output format — 'markdown', 'text', or 'html'. Defaults to 'markdown'.
    """
    logger.info("tool.generate_document", title=title, format=format, content_length=len(content))

    # Clean filename
    safe_title = "".join(c if c.isalnum() or c in " -_" else "_" for c in title).strip()
    if not safe_title:
        safe_title = "document"

    # Determine extension and content type
    ext_map = {"markdown": ".md", "text": ".txt", "html": ".html"}
    ext = ext_map.get(format, ".md")

    # Generate unique file ID
    file_id = uuid.uuid4().hex[:16]
    filename = f"{safe_title}{ext}"
    filepath = DOCS_DIR / f"{file_id}_{filename}"

    # Write content
    if format == "html":
        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; color: #1a1a2e; line-height: 1.7; }}
        h1, h2, h3 {{ color: #16213e; }}
        pre {{ background: #f0f0f5; padding: 1rem; border-radius: 8px; overflow-x: auto; }}
        code {{ background: #f0f0f5; padding: 2px 6px; border-radius: 4px; }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ border: 1px solid #ddd; padding: 8px 12px; text-align: left; }}
        th {{ background: #f5f5fa; }}
    </style>
</head>
<body>
{content}
</body>
</html>"""
        filepath.write_text(html_content, encoding="utf-8")
    else:
        filepath.write_text(content, encoding="utf-8")

    # Track for cleanup and serving
    _generated_docs[file_id] = {
        "path": str(filepath),
        "filename": filename,
        "created_at": time.time(),
        "format": format,
    }

    # Cleanup old files (older than 1 hour)
    _cleanup_old_docs()

    api_url = os.environ.get("RENDER_EXTERNAL_URL", "")
    if not api_url:
        api_url = os.environ.get("API_URL", "http://localhost:8000")

    download_url = f"{api_url}/api/v1/documents/download/{file_id}"

    return (
        f"Document generated successfully!\n\n"
        f"**Title:** {title}\n"
        f"**Format:** {format.upper()}\n"
        f"**Size:** {len(content):,} characters\n\n"
        f"Download link: {download_url}\n\n"
        f"[DOWNLOAD_LINK:{file_id}:{filename}]"
    )


def get_generated_doc(file_id: str) -> dict | None:
    """Retrieve a generated document by its file ID."""
    return _generated_docs.get(file_id)


def _cleanup_old_docs():
    """Remove documents older than 1 hour."""
    now = time.time()
    expired = [fid for fid, info in _generated_docs.items()
               if now - info["created_at"] > 3600]
    for fid in expired:
        info = _generated_docs.pop(fid)
        try:
            Path(info["path"]).unlink(missing_ok=True)
        except Exception:
            pass
    if expired:
        logger.info("docs.cleanup", removed=len(expired))


# Tool collections for document agents
DOC_READER_TOOLS = [analyze_document, extract_key_points]
DOC_GENERATOR_TOOLS = [generate_document]
