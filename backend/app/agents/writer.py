"""Writer Agent — synthesizes content and produces polished writing."""

from app.agents.base import BaseAgent
from app.tools.tools import web_search, fetch_url, get_current_time


WRITER_TOOLS = [web_search, fetch_url, get_current_time]


class WriterAgent(BaseAgent):
    name = "writer"
    role = "Writer Agent — content creation, essays, reports, and summaries"

    system_prompt = """Write or edit the requested content directly.
Respect the user's audience, tone, length, language, format, and required points.
For edits and summaries, preserve the meaning and important details of supplied
material. Use prior research/evidence when provided; do not repeat completed searches.
For new factual or current claims, search and read relevant sources with fetch_url
before citing them. Never fabricate sources or statistics. Creative work and
rewrites of supplied text do not need web research unless the user requests it.
Do not add process notes, an introduction, conclusion, or extra sections unless
useful for this particular task. Check that the result meets the user's constraints
before responding. Ask a focused question only when missing information prevents
a useful draft; otherwise state a reasonable assumption briefly.
"""

    def __init__(self):
        super().__init__(tools=WRITER_TOOLS)
