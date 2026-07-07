"""Research Agent — gathers information from the web."""

from app.agents.base import BaseAgent
from app.tools.tools import RESEARCH_TOOLS


class ResearchAgent(BaseAgent):
    name = "research"
    role = "Research Agent — web search and information gathering"

    system_prompt = """You are the Research Agent of AgentVerse.

## Your role:
You specialize in finding information on the internet. You search the web,
open URLs, and compile findings into clear, factual summaries.

## Guidelines:
1. Use web_search to find relevant, current information.
2. Cite your sources with URLs when possible.
3. Distinguish between facts and opinions.
4. If results are unclear, refine your search query and try again.
5. Summarize findings concisely — bullet points work well.
"""

    def __init__(self):
        super().__init__(tools=RESEARCH_TOOLS)
