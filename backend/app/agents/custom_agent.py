"""Dynamic custom agent — loads config from database."""

import json

from app.agents.base import BaseAgent
from app.tools.tools import (
    web_search, run_code, calculate, read_file, write_file,
    get_current_time, open_url,
)
from app.tools.hitl import request_user_approval
from app.tools.github_tools import search_github_repos
from app.tools.linear_tools import create_linear_issue
from app.tools.slack_tools import send_slack_message

# Map tool names to actual tool functions
TOOL_REGISTRY = {
    "web_search": web_search,
    "run_code": run_code,
    "calculate": calculate,
    "read_file": read_file,
    "write_file": write_file,
    "get_current_time": get_current_time,
    "open_url": open_url,
    "request_user_approval": request_user_approval,
    "search_github_repos": search_github_repos,
    "create_linear_issue": create_linear_issue,
    "send_slack_message": send_slack_message,
}


class DynamicCustomAgent(BaseAgent):
    """An agent created by the user at runtime via the Agent Builder UI.
    
    Unlike built-in agents whose name/prompt are class attributes,
    DynamicCustomAgent instances are configured from database records.
    """

    def __init__(
        self,
        agent_name: str,
        agent_role: str,
        agent_system_prompt: str,
        tool_names: list[str] | None = None,
        model: str | None = None,
    ):
        self.name = agent_name
        self.role = agent_role
        self.system_prompt = agent_system_prompt
        self._model_override = model

        # Resolve tool names to actual tool objects
        tools = []
        for name in (tool_names or []):
            if name in TOOL_REGISTRY:
                tools.append(TOOL_REGISTRY[name])

        super().__init__(tools=tools if tools else None)

    def _get_fresh_llm(self):
        """Override to use custom model if specified."""
        if self._model_override:
            from app.agents.base import create_llm
            return create_llm(model=self._model_override)
        return super()._get_fresh_llm()
