"""Base agent class and LLM provider factory.

Provides a unified way to create agents with different LLM providers and
tool sets. All agents inherit from BaseAgent.
"""

from __future__ import annotations

import asyncio
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import BaseTool

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def get_llm(
    provider: str | None = None,
    model: str | None = None,
    temperature: float = 0.3,
) -> BaseChatModel:
    """Create an LLM instance based on the configured provider.

    Tries providers in order: explicit arg → config default → whatever has a key.
    """
    settings = get_settings()
    provider = provider or settings.default_model_provider
    model = model or settings.default_model

    if provider == "google" and settings.google_api_key:
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=model if "gemini" in model else "gemini-1.5-flash",
            google_api_key=settings.google_api_key,
            temperature=temperature,
            max_retries=3,
        )

    if provider == "openai" and settings.openai_api_key:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=model,
            api_key=settings.openai_api_key,
            temperature=temperature,
        )

    if provider == "anthropic" and settings.anthropic_api_key:
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=model if "claude" in model else "claude-sonnet-4-20250514",
            api_key=settings.anthropic_api_key,
            temperature=temperature,
        )

    # Fallback: try any configured provider
    if settings.google_api_key:
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            google_api_key=settings.google_api_key,
            temperature=temperature,
            max_retries=3,
        )

    if settings.openai_api_key:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model="gpt-4o-mini", api_key=settings.openai_api_key, temperature=temperature)

    if settings.anthropic_api_key:
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model="claude-sonnet-4-20250514", api_key=settings.anthropic_api_key, temperature=temperature)

    raise RuntimeError(
        "No LLM API key configured. Set GOOGLE_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY in .env"
    )


async def _invoke_with_retry(llm, messages, max_retries=0):
    """Invoke LLM without retries so rate limits surface to the user immediately."""
    return await llm.ainvoke(messages)


class BaseAgent:
    """Base class for all AgentVerse agents."""

    name: str = "base"
    role: str = "General-purpose AI agent"
    system_prompt: str = "You are a helpful AI assistant."

    def __init__(self, tools: list[BaseTool] | None = None):
        self.tools = tools or []
        self.llm = get_llm()
        if self.tools:
            self.llm_with_tools = self.llm.bind_tools(self.tools)
        else:
            self.llm_with_tools = self.llm

    async def run(self, user_input: str, context: str = "") -> str:
        """Execute the agent with user input and optional context."""
        messages = [SystemMessage(content=self._build_system_prompt(context))]
        messages.append(HumanMessage(content=user_input))

        logger.info(f"agent.{self.name}.invoke", input_length=len(user_input))

        try:
            response = await _invoke_with_retry(self.llm_with_tools, messages)

            # Handle tool calls
            if hasattr(response, "tool_calls") and response.tool_calls:
                tool_results = await self._execute_tool_calls(response.tool_calls)
                messages.append(response)
                for result in tool_results:
                    messages.append(result)
                response = await _invoke_with_retry(self.llm_with_tools, messages)

            content = response.content if isinstance(response, AIMessage) else str(response)
            logger.info(f"agent.{self.name}.complete", output_length=len(content))
            return content

        except Exception as exc:
            logger.error(f"agent.{self.name}.error", error=str(exc))
            return f"Agent {self.name} encountered an error: {exc}"

    async def _execute_tool_calls(self, tool_calls: list[dict]) -> list:
        """Execute tool calls and return ToolMessage results."""
        from langchain_core.messages import ToolMessage

        results = []
        tool_map = {t.name: t for t in self.tools}

        for call in tool_calls:
            tool_name = call["name"]
            tool_args = call["args"]

            logger.info(f"agent.{self.name}.tool_call", tool=tool_name)

            if tool_name in tool_map:
                try:
                    result = await tool_map[tool_name].ainvoke(tool_args)
                    results.append(ToolMessage(content=str(result), tool_call_id=call["id"]))
                except Exception as exc:
                    results.append(ToolMessage(content=f"Tool error: {exc}", tool_call_id=call["id"]))
            else:
                results.append(ToolMessage(content=f"Unknown tool: {tool_name}", tool_call_id=call["id"]))

        return results

    def _build_system_prompt(self, context: str = "") -> str:
        prompt = self.system_prompt
        if context:
            prompt += f"\n\n## Context from other agents:\n{context}"
        return prompt
