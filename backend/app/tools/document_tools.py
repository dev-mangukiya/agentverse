"""Document-related tools for reading and generating documents."""

import asyncio
import tempfile
import html
import csv
import io
import re
from pathlib import Path

from langchain_core.tools import tool
from app.core.logging import get_logger

logger = get_logger(__name__)


# ── Format converters ─────────────────────────────────────


def _write_markdown(content: str, filepath: Path, title: str) -> None:
    """Write plain markdown content."""
    filepath.write_text(content, encoding="utf-8")


def _write_text(content: str, filepath: Path, title: str) -> None:
    """Write plain text content."""
    filepath.write_text(content, encoding="utf-8")


def _write_html(content: str, filepath: Path, title: str) -> None:
    """Write HTML-wrapped content."""
    title = html.escape(title)
    content = "<pre>" + html.escape(content) + "</pre>"
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


def _write_docx(content: str, filepath: Path, title: str) -> None:
    """Convert markdown-style content to a Word .docx document."""
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = Document()

    # Set default font
    style = doc.styles["Normal"]
    font = style.font
    font.name = "Calibri"
    font.size = Pt(11)

    # Add title
    heading = doc.add_heading(title, level=0)
    heading.alignment = WD_ALIGN_PARAGRAPH.CENTER

    # Parse markdown-like content into paragraphs
    lines = content.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Skip empty lines
        if not stripped:
            i += 1
            continue

        if stripped.startswith("```"):
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            paragraph = doc.add_paragraph()
            run = paragraph.add_run("\n".join(code_lines))
            run.font.name = "Consolas"
            run.font.size = Pt(10)
            i += 1
            continue
        if (
            "|" in stripped
            and i + 1 < len(lines)
            and re.fullmatch(r"[\s|:-]+", lines[i + 1])
        ):
            headers = [cell.strip() for cell in stripped.strip("|").split("|")]
            table = doc.add_table(rows=1, cols=len(headers))
            table.style = "Table Grid"
            for cell, value in zip(table.rows[0].cells, headers):
                cell.text = value
            i += 2
            while i < len(lines) and "|" in lines[i]:
                values = [
                    cell.strip() for cell in lines[i].strip().strip("|").split("|")
                ]
                for cell, value in zip(table.add_row().cells, values):
                    cell.text = value
                i += 1
            continue

        # Headings
        if stripped.startswith("### "):
            doc.add_heading(stripped[4:], level=3)
        elif stripped.startswith("## "):
            doc.add_heading(stripped[3:], level=2)
        elif stripped.startswith("# "):
            doc.add_heading(stripped[2:], level=1)
        # Bullet points
        elif stripped.startswith("- ") or stripped.startswith("* "):
            text = stripped[2:]
            # Bold handling within bullet
            para = doc.add_paragraph(style="List Bullet")
            _add_formatted_text(para, text)
        # Numbered items
        elif re.match(r"^\d+\.\s", stripped):
            text = re.sub(r"^\d+\.\s", "", stripped)
            para = doc.add_paragraph(style="List Number")
            _add_formatted_text(para, text)
        # Horizontal rule
        elif stripped in ("---", "***", "___"):
            doc.add_paragraph("─" * 50)
        # Regular paragraph
        else:
            para = doc.add_paragraph()
            _add_formatted_text(para, stripped)

        i += 1

    doc.save(str(filepath))


def _add_formatted_text(paragraph, text: str) -> None:
    """Parse simple markdown bold/italic in text and add formatted runs."""
    # Split on bold markers (**text**)
    parts = re.split(r"(\*\*[^*]+\*\*)", text)
    for part in parts:
        if part.startswith("**") and part.endswith("**"):
            run = paragraph.add_run(part[2:-2])
            run.bold = True
        else:
            paragraph.add_run(part)


def _write_xlsx(content: str, filepath: Path, title: str) -> None:
    """Convert content to an Excel spreadsheet.

    Tries to detect table-like data (CSV rows, markdown tables, tab-separated).
    Falls back to putting each line in a row if no structure is detected.
    """
    from openpyxl import Workbook
    from openpyxl.styles import Font

    wb = Workbook()
    ws = wb.active
    ws.title = (
        re.sub(r"[\\/*?:\[\]]", "_", title).strip("'")[:31] or "Sheet"
    )  #  # Excel sheet name max 31 chars

    lines = [l for l in content.split("\n") if l.strip()]

    # Try to detect markdown table format (| col1 | col2 |)
    table_lines = [
        l
        for l in lines
        if "|" in l
        and not l.strip().startswith("|--")
        and not re.match(r"^\|[-:| ]+\|$", l.strip())
    ]
    separator_lines = [l for l in lines if re.match(r"^\|[-:| ]+\|$", l.strip())]

    if len(table_lines) >= 2 and len(separator_lines) >= 1:
        # Markdown table detected
        rows = []
        for line in table_lines:
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            rows.append(cells)
        _fill_worksheet(ws, rows)
    else:
        # Try CSV-style (comma-separated with consistent column counts)
        csv_rows = list(csv.reader(io.StringIO(content))) if "," in content else []
        if len(csv_rows) >= 2 and len(set(len(r) for r in csv_rows)) <= 2:
            rows = [[c.strip() for c in r] for r in csv_rows]
            _fill_worksheet(ws, rows)
        else:
            # Try tab-separated
            tsv_rows = [l.split("\t") for l in lines if "\t" in l]
            if len(tsv_rows) >= 2:
                rows = [[c.strip() for c in r] for r in tsv_rows]
                _fill_worksheet(ws, rows)
            else:
                # Fallback: each line is a row with one cell
                for idx, line in enumerate(lines, 1):
                    stripped = (
                        line.strip().lstrip("#").lstrip("- ").lstrip("* ").strip()
                    )
                    ws.cell(row=idx, column=1, value=stripped).data_type = "s"
                    # Bold for lines that look like headers
                    if line.strip().startswith("#") or idx == 1:
                        ws.cell(row=idx, column=1).font = Font(bold=True, size=12)

    # Auto-adjust column widths
    for col in ws.columns:
        max_length = 0
        col_letter = col[0].column_letter
        for cell in col:
            try:
                if cell.value:
                    max_length = max(max_length, len(str(cell.value)))
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = min(max_length + 4, 60)

    wb.save(str(filepath))


def _fill_worksheet(ws, rows: list[list[str]]) -> None:
    """Fill a worksheet with rows, styling the first row as a header."""
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    header_fill = PatternFill(
        start_color="4472C4", end_color="4472C4", fill_type="solid"
    )
    header_font = Font(bold=True, color="FFFFFF", size=11)
    thin_border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin"),
    )

    for row_idx, row in enumerate(rows, 1):
        for col_idx, value in enumerate(row, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.data_type = (
                "s"  # Generated content is data, never executable formulas.
            )
            if (
                row_idx > 1
                and re.fullmatch(r"-?\d+(?:\.\d+)?", value)
                and not re.fullmatch(r"0\d+", value)
            ):
                cell.value = float(value) if "." in value else int(value)
            cell.border = thin_border
            cell.alignment = Alignment(wrap_text=True, vertical="top")
            if row_idx == 1:
                cell.fill = header_fill
                cell.font = header_font


def _write_pdf(content: str, filepath: Path, title: str) -> None:
    """Unicode PDF with embedded, licensed fonts and Indic text shaping."""
    from fpdf import FPDF

    fonts = Path(__file__).resolve().parents[2] / "assets" / "fonts"
    pdf = FPDF()
    for family in ("NotoSans", "NotoSansDevanagari", "NotoSansGujarati"):
        pdf.add_font(family, fname=str(fonts / (family + ".ttf")))
    pdf.set_fallback_fonts(
        ["NotoSansDevanagari", "NotoSansGujarati"], exact_match=False
    )
    pdf.set_text_shaping(True)
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_font("NotoSans", size=18)
    pdf.multi_cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    for line in content.splitlines():
        text = re.sub(r"\*\*([^*]+)\*\*", r"\1", line)
        heading = re.match(r"^(#{1,3})\s+(.*)", text)
        pdf.set_font("NotoSans", size=15 if heading else 11)
        text = heading[2] if heading else re.sub(r"^[-*] ", "• ", text)
        pdf.multi_cell(0, 7, text or " ", new_x="LMARGIN", new_y="NEXT")
    pdf.output(str(filepath))


# ── Main tool ─────────────────────────────────────────────

FORMAT_CONFIG = {
    "markdown": {"ext": ".md", "writer": _write_markdown},
    "text": {"ext": ".txt", "writer": _write_text},
    "html": {"ext": ".html", "writer": _write_html},
    "docx": {"ext": ".docx", "writer": _write_docx},
    "xlsx": {"ext": ".xlsx", "writer": _write_xlsx},
    "pdf": {"ext": ".pdf", "writer": _write_pdf},
}

# Aliases so the LLM can say "word", "doc", "excel", "spreadsheet", etc.
FORMAT_ALIASES = {
    "doc": "docx",
    "word": "docx",
    "excel": "xlsx",
    "spreadsheet": "xlsx",
    "csv": "xlsx",
    "md": "markdown",
    "txt": "text",
}


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
        format: Output format — 'markdown', 'text', 'html', 'docx', 'xlsx', or 'pdf'. Also accepts aliases like 'word', 'doc', 'excel'. Defaults to 'markdown'.
    """
    # Resolve aliases
    fmt = format.lower().strip()
    fmt = FORMAT_ALIASES.get(fmt, fmt)

    if fmt not in FORMAT_CONFIG:
        return f"Error: Unsupported format '{format}'. Supported: {', '.join(FORMAT_CONFIG.keys())}"

    if len(content) > 100000 or len(title) > 160:
        return "Error: document exceeds the 100,000 character or title limit."
    config = FORMAT_CONFIG[fmt]
    safe_title = (
        "".join(c if c.isalnum() or c in " -_" else "_" for c in title).strip()[:100]
        or "document"
    )
    filename = safe_title + config["ext"]

    def render():
        with tempfile.TemporaryDirectory(prefix="agentverse-document-") as directory:
            path = Path(directory) / filename
            config["writer"](content, path, title)
            return path.read_bytes()

    from app.services.files import save_artifact
    import mimetypes

    data = await asyncio.to_thread(render)
    record = await save_artifact(
        filename, data, mimetypes.guess_type(filename)[0] or "application/octet-stream"
    )
    return f"Created {filename} ({len(data)} bytes). [DOWNLOAD_LINK:{record.id}:{filename}]"


# Tool collections for document agents
DOC_READER_TOOLS = []  # Analyze supplied text directly; echo tools add no evidence.
DOC_GENERATOR_TOOLS = [generate_document]
