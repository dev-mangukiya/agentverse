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

# ── LLM instance cache ─────────────────────────────────────────────────────
# Keyed by (provider, model, temperature) so agents reuse LLM connections
# instead of creating new ones on every request.
_llm_cache: dict[tuple[str, str, float], BaseChatModel] = {}


def get_llm(
    provider: str | None = None,
    model: str | None = None,
    temperature: float = 0.3,
) -> BaseChatModel:
    """Create an LLM instance based on the configured provider.

    Tries providers in order: explicit arg → config default → whatever has a key.
    Uses a module-level cache to avoid recreating LLM connections.
    """
    settings = get_settings()
    provider = provider or settings.default_model_provider
    model = model or settings.default_model

    # ── Check cache first ─────────────────────────────────────────────────
    cache_key = (provider, model, temperature)
    if cache_key in _llm_cache:
        logger.info("llm.cache_hit", provider=provider, model=model)
        return _llm_cache[cache_key]

    llm: BaseChatModel | None = None

    # ── HuggingFace (free tier via Serverless Inference API) ──────────────
    if provider == "huggingface" and settings.huggingface_api_key:
        try:
            from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint
            import os
            os.environ.setdefault("HUGGINGFACEHUB_API_TOKEN", settings.huggingface_api_key)
            endpoint = HuggingFaceEndpoint(
                repo_id=model if "/" in model else "Qwen/Qwen2.5-Coder-32B-Instruct",
                temperature=temperature,
                max_new_tokens=2048,
                huggingfacehub_api_token=settings.huggingface_api_key,
                timeout=120,
            )
            llm = ChatHuggingFace(llm=endpoint, verbose=False)
        except ImportError:
            raise RuntimeError(
                "langchain-huggingface not installed. Run: pip install langchain-huggingface"
            )

    if llm is None and provider == "google" and settings.google_api_key:
        from langchain_google_genai import ChatGoogleGenerativeAI
        llm = ChatGoogleGenerativeAI(
            model=model if "gemini" in model else "gemini-1.5-flash",
            google_api_key=settings.google_api_key,
            temperature=temperature,
            max_retries=3,
        )

    if llm is None and provider == "openai" and settings.openai_api_key:
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(
            model=model,
            api_key=settings.openai_api_key,
            temperature=temperature,
        )

    if llm is None and provider == "anthropic" and settings.anthropic_api_key:
        from langchain_anthropic import ChatAnthropic
        llm = ChatAnthropic(
            model=model if "claude" in model else "claude-sonnet-4-20250514",
            api_key=settings.anthropic_api_key,
            temperature=temperature,
        )

    # ── Fallback: try any configured provider in order of preference ──────
    if llm is None and settings.huggingface_api_key:
        try:
            from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint
            import os
            os.environ.setdefault("HUGGINGFACEHUB_API_TOKEN", settings.huggingface_api_key)
            endpoint = HuggingFaceEndpoint(
                repo_id="Qwen/Qwen2.5-Coder-32B-Instruct",
                temperature=temperature,
                max_new_tokens=2048,
                huggingfacehub_api_token=settings.huggingface_api_key,
                timeout=120,
            )
            llm = ChatHuggingFace(llm=endpoint, verbose=False)
        except Exception:
            pass  # fall through to other providers

    if llm is None and settings.google_api_key:
        from langchain_google_genai import ChatGoogleGenerativeAI
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=settings.google_api_key,
            temperature=temperature,
            max_retries=3,
        )

    if llm is None and settings.openai_api_key:
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(model="gpt-4o-mini", api_key=settings.openai_api_key, temperature=temperature)

    if llm is None and settings.anthropic_api_key:
        from langchain_anthropic import ChatAnthropic
        llm = ChatAnthropic(model="claude-sonnet-4-20250514", api_key=settings.anthropic_api_key, temperature=temperature)

    if llm is None:
        raise RuntimeError(
            "No LLM API key configured. Set HUGGINGFACE_API_KEY, GOOGLE_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY in .env"
        )

    # ── Store in cache ────────────────────────────────────────────────────
    _llm_cache[cache_key] = llm
    logger.info("llm.cached", provider=provider, model=model)
    return llm


async def _invoke_with_retry(llm, messages, max_retries=0):
    """Invoke LLM with a timeout so requests don't hang indefinitely."""
    import asyncio
    try:
        return await asyncio.wait_for(llm.ainvoke(messages), timeout=90)
    except asyncio.TimeoutError:
        raise RuntimeError("LLM request timed out after 90 seconds. The model may be loading (cold start). Try again in a moment.")


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
