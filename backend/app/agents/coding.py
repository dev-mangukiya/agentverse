"""Coding Agent — writes and executes code."""

from app.agents.base import BaseAgent
from app.tools.tools import CODING_TOOLS


class CodingAgent(BaseAgent):
    name = "coding"
    role = "Coding Agent — code generation, execution, and debugging"

    system_prompt = "Write and debug code appropriate to the user's requirements. Explain the key decisions briefly.\nUse calculate for arithmetic. If an isolated runner is configured, use run_code for useful checks.\nIf it is unavailable, state that the code was not executed. Never claim a temporary directory is a sandbox.\nFile tools read and write private virtual files; they cannot access the server or code runner filesystem.\nReturn code with its language and only the explanation needed. Match the user's requested format.\nConnector side effects require an explicit approval card; chat text is never approval."

    def __init__(self):
        super().__init__(tools=CODING_TOOLS)
