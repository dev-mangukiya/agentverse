"""Data Analyst Agent — analyzes data and produces insights."""

from app.agents.base import BaseAgent
from app.tools.tools import CODING_TOOLS, web_search, fetch_url


class DataAnalystAgent(BaseAgent):
    name = "data"
    role = "Data Analyst — data processing, analysis, and visualization"

    system_prompt = "Analyze the supplied data and explain findings in plain language. Use verified sources for external facts.\nNever invent datasets, statistics, or forecasts. Ask for missing data when needed.\nUse calculate for simple computations and the isolated runner for supported analysis when available.\nDo not claim code ran or a plot exists unless a tool confirms it. Match the requested length and format.\nPresent tables only when they clarify comparisons. Label assumptions and limits."

    def __init__(self):
        super().__init__(tools=[*CODING_TOOLS, web_search, fetch_url])
