"""Base agent class and LLM provider factory.

Provides a unified way to create agents with different LLM providers and
tool sets. All agents inherit from BaseAgent.
"""

from __future__ import annotations

import asyncio
import time
import threading
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import BaseTool

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


# ── Google API Key Round-Robin Manager ──────────────────────────────────────
class GoogleKeyManager:
    """Thread-safe round-robin manager for multiple Google API keys.
    
    Tracks which keys are available and which are in cooldown (rate-limited).
    Automatically rotates to the next available key on each call.
    """
    
    COOLDOWN_SECONDS = 60  # How long to wait before retrying a rate-limited key

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._keys: list[str] = []
        self._index = 0
        self._cooldowns: dict[str, float] = {}  # key -> timestamp when cooldown expires
        self._initialized = False

    def _ensure_initialized(self) -> None:
        if self._initialized:
            return
        settings = get_settings()
        self._keys = settings.google_api_key_list
        self._initialized = True
        if self._keys:
            logger.info("google_keys.initialized", count=len(self._keys))

    @property
    def key_count(self) -> int:
        self._ensure_initialized()
        return len(self._keys)

    def get_next_key(self) -> str | None:
        """Get the next available API key using round-robin.
        
        Skips keys that are in cooldown. Returns None if all keys are exhausted.
        """
        self._ensure_initialized()
        if not self._keys:
            return None

        with self._lock:
            now = time.monotonic()
            # Try each key once
            for _ in range(len(self._keys)):
                key = self._keys[self._index % len(self._keys)]
                self._index += 1
                
                # Check if this key is in cooldown
                cooldown_until = self._cooldowns.get(key, 0)
                if now >= cooldown_until:
                    self._cooldowns.pop(key, None)
                    logger.info("google_keys.selected", key_index=(self._index - 1) % len(self._keys))
                    return key

            # All keys are in cooldown
            logger.warning("google_keys.all_exhausted", total_keys=len(self._keys))
            return None

    def mark_rate_limited(self, key: str) -> None:
        """Mark a key as rate-limited — it won't be used for COOLDOWN_SECONDS."""
        with self._lock:
            self._cooldowns[key] = time.monotonic() + self.COOLDOWN_SECONDS
            active = sum(1 for k in self._keys if self._cooldowns.get(k, 0) <= time.monotonic())
            logger.warning(
                "google_keys.rate_limited",
                key_suffix=f"...{key[-6:]}",
                cooldown_s=self.COOLDOWN_SECONDS,
                active_keys=active,
                total_keys=len(self._keys),
            )

    def get_available_count(self) -> int:
        """Return how many keys are currently not in cooldown."""
        self._ensure_initialized()
        with self._lock:
            now = time.monotonic()
            return sum(1 for k in self._keys if self._cooldowns.get(k, 0) <= now)


# Singleton key manager
_google_key_manager = GoogleKeyManager()


def get_google_key_manager() -> GoogleKeyManager:
    return _google_key_manager


# ── LLM instance cache ─────────────────────────────────────────────────────
_llm_cache: dict[tuple, BaseChatModel] = {}


def _create_google_llm(api_key: str, model: str = "gemini-2.5-flash", temperature: float = 0.3) -> BaseChatModel:
    """Create a Google Gemini LLM with a specific API key."""
    cache_key = ("google", model, temperature, api_key[-8:])
    if cache_key in _llm_cache:
        return _llm_cache[cache_key]

    from langchain_google_genai import ChatGoogleGenerativeAI
    llm = ChatGoogleGenerativeAI(
        model=model if "gemini" in model else "gemini-2.5-flash",
        google_api_key=api_key,
        temperature=temperature,
        max_retries=2,
    )
    _llm_cache[cache_key] = llm
    return llm


def get_llm(
    provider: str | None = None,
    model: str | None = None,
    temperature: float = 0.3,
) -> BaseChatModel:
    """Create an LLM instance based on the configured provider.

    For Google provider with multiple keys, uses the round-robin key manager.
    """
    settings = get_settings()
    provider = provider or settings.default_model_provider
    model = model or settings.default_model

    llm: BaseChatModel | None = None

    # ── Google with round-robin keys ─────────────────────────────────────
    if provider == "google" and _google_key_manager.key_count > 0:
        key = _google_key_manager.get_next_key()
        if key:
            llm = _create_google_llm(key, model, temperature)

    # ── HuggingFace ──────────────────────────────────────────────────────
    if llm is None and provider == "huggingface" and settings.huggingface_api_key:
        cache_key = ("huggingface", model, temperature)
        if cache_key in _llm_cache:
            return _llm_cache[cache_key]
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
            _llm_cache[cache_key] = llm
        except ImportError:
            raise RuntimeError("langchain-huggingface not installed.")

    # ── OpenAI ───────────────────────────────────────────────────────────
    if llm is None and provider == "openai" and settings.openai_api_key:
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(model=model, api_key=settings.openai_api_key, temperature=temperature)

    # ── Anthropic ────────────────────────────────────────────────────────
    if llm is None and provider == "anthropic" and settings.anthropic_api_key:
        from langchain_anthropic import ChatAnthropic
        llm = ChatAnthropic(
            model=model if "claude" in model else "claude-sonnet-4-20250514",
            api_key=settings.anthropic_api_key, temperature=temperature,
        )

    # ── Fallback chain ───────────────────────────────────────────────────
    if llm is None and _google_key_manager.key_count > 0:
        key = _google_key_manager.get_next_key()
        if key:
            llm = _create_google_llm(key, "gemini-2.5-flash", temperature)

    if llm is None and settings.huggingface_api_key:
        try:
            from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint
            import os
            os.environ.setdefault("HUGGINGFACEHUB_API_TOKEN", settings.huggingface_api_key)
            endpoint = HuggingFaceEndpoint(
                repo_id="Qwen/Qwen2.5-Coder-32B-Instruct", temperature=temperature,
                max_new_tokens=2048, huggingfacehub_api_token=settings.huggingface_api_key, timeout=120,
            )
            llm = ChatHuggingFace(llm=endpoint, verbose=False)
        except Exception:
            pass

    if llm is None:
        raise RuntimeError(
            "No LLM API key configured. Set GOOGLE_API_KEYS, GOOGLE_API_KEY, HUGGINGFACE_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY."
        )

    return llm


def _is_rate_limit_error(exc: Exception) -> bool:
    """Check if an exception is a rate-limit / quota-exhausted error."""
    err = str(exc).lower()
    return any(marker in err for marker in [
        "429", "resource_exhausted", "quota", "rate limit",
        "too many requests", "rate_limit",
    ])


def _get_fallback_llm(temperature: float = 0.3) -> BaseChatModel | None:
    """Get a fallback LLM — try next Google key first, then HuggingFace."""
    settings = get_settings()
    
    # Try another Google key if available
    if _google_key_manager.get_available_count() > 0:
        key = _google_key_manager.get_next_key()
        if key:
            logger.info("llm.fallback_to_next_google_key")
            return _create_google_llm(key, settings.default_model, temperature)

    # Fall back to HuggingFace
    if settings.huggingface_api_key:
        cache_key = ("huggingface", "Qwen/Qwen2.5-Coder-32B-Instruct", temperature)
        if cache_key in _llm_cache:
            return _llm_cache[cache_key]
        try:
            from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint
            import os
            os.environ.setdefault("HUGGINGFACEHUB_API_TOKEN", settings.huggingface_api_key)
            endpoint = HuggingFaceEndpoint(
                repo_id="Qwen/Qwen2.5-Coder-32B-Instruct", temperature=temperature,
                max_new_tokens=2048, huggingfacehub_api_token=settings.huggingface_api_key, timeout=120,
            )
            llm = ChatHuggingFace(llm=endpoint, verbose=False)
            _llm_cache[cache_key] = llm
            return llm
        except Exception as exc:
            logger.warning("llm.hf_fallback_unavailable", error=str(exc))
    
    return None


async def _invoke_with_retry(llm, messages, max_retries=0):
    """Invoke LLM with timeout and automatic key rotation + fallback on rate limits.
    
    On rate limit:
    1. Mark the current Google key as rate-limited
    2. Try the next available Google key  
    3. If all Google keys exhausted, fall back to HuggingFace
    """
    try:
        return await asyncio.wait_for(llm.ainvoke(messages), timeout=90)
    except asyncio.TimeoutError:
        raise RuntimeError("LLM request timed out after 90 seconds.")
    except Exception as exc:
        if _is_rate_limit_error(exc):
            # Mark the current key as rate-limited if it's a Google LLM
            if hasattr(llm, 'google_api_key'):
                _google_key_manager.mark_rate_limited(llm.google_api_key)
            
            logger.warning("llm.rate_limited", error=str(exc)[:200])
            
            # Try up to N more keys (all remaining Google keys + 1 HuggingFace attempt)
            for attempt in range(max(_google_key_manager.key_count, 1) + 1):
                fallback = _get_fallback_llm()
                if fallback is None:
                    break
                try:
                    logger.info("llm.retry_with_fallback", attempt=attempt + 1)
                    return await asyncio.wait_for(fallback.ainvoke(messages), timeout=120)
                except asyncio.TimeoutError:
                    raise RuntimeError("Fallback LLM timed out after 120 seconds.")
                except Exception as fb_exc:
                    if _is_rate_limit_error(fb_exc):
                        if hasattr(fallback, 'google_api_key'):
                            _google_key_manager.mark_rate_limited(fallback.google_api_key)
                        logger.warning("llm.fallback_also_limited", attempt=attempt + 1)
                        continue
                    raise fb_exc
            
            # All keys exhausted
            raise
        raise


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
