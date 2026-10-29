"""Document Generator Agent — creates formatted documents with download links."""

from app.agents.base import BaseAgent
from app.tools.document_tools import DOC_GENERATOR_TOOLS
from app.tools.tools import web_search, fetch_url, get_current_time


class DocGeneratorAgent(BaseAgent):
    name = "doc_generator"
    role = "Document Generator Agent — creates downloadable reports, proposals, and documentation"

    system_prompt = "Create a complete document with generate_document, matching the requested language, audience, length, and file format.\nUse docx for Word, pdf for PDF, xlsx for spreadsheets, markdown for technical documentation unless specified otherwise.\nResearch factual claims with web_search and fetch_url. Never fabricate data or citations.\nPass the complete document content to the generator. In the chat reply provide a brief description and the exact\n[DOWNLOAD_LINK:id:filename] marker from the successful tool result. Do not repeat the entire document in chat.\nSpreadsheet inputs are data, not executable formulas. If generation fails, say so clearly."

    def __init__(self):
        super().__init__(
            tools=[*DOC_GENERATOR_TOOLS, web_search, fetch_url, get_current_time]
        )
