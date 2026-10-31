"""Base agent class and LLM provider factory.

Provides a unified way to create agents with different LLM providers and
tool sets. All agents inherit from BaseAgent.
"""

from __future__ import annotations

import asyncio
import time
import threading

from langchain_core.language_models import BaseChatModel
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
                    logger.info(
                        "google_keys.selected",
                        key_index=(self._index - 1) % len(self._keys),
                    )
                    return key

            # All keys are in cooldown
            logger.warning("google_keys.all_exhausted", total_keys=len(self._keys))
            return None

    def mark_rate_limited(self, key) -> None:
        """Mark a key as rate-limited — it won't be used for COOLDOWN_SECONDS."""
        # LangChain may pass a pydantic SecretStr; unwrap to plain str
        if hasattr(key, "get_secret_value"):
            key = key.get_secret_value()
        key = str(key)
        with self._lock:
            for project_key in self._keys:
                self._cooldowns[project_key] = time.monotonic() + self.COOLDOWN_SECONDS
            active = sum(
                1 for k in self._keys if self._cooldowns.get(k, 0) <= time.monotonic()
            )
            logger.warning(
                "google_keys.rate_limited",
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


def _cache_model(key, model):
    if key not in _llm_cache and len(_llm_cache) >= 32:
        _llm_cache.pop(next(iter(_llm_cache)))
    _llm_cache[key] = model
    return model


def _create_google_llm(
    api_key: str, model: str = "gemini-2.5-flash", temperature: float = 0.3
) -> BaseChatModel:
    """Create a Google Gemini LLM with a specific API key."""
    cache_key = ("google", model, temperature, api_key)
    if cache_key in _llm_cache:
        return _llm_cache[cache_key]

    from langchain_google_genai import ChatGoogleGenerativeAI

    llm = ChatGoogleGenerativeAI(
        model=model if "gemini" in model else "gemini-2.5-flash",
        google_api_key=api_key,
        temperature=temperature,
        max_output_tokens=get_settings().max_output_tokens,
        max_retries=0,  # Don't let LangChain retry the same rate-limited key; our rotation handles it
    )
    return _cache_model(cache_key, llm)


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
    from app.core.config import validate_provider_model

    validate_provider_model(provider, model)
    configured = {
        "google": bool(settings.google_api_key_list),
        "openai": bool(settings.openai_api_key),
        "anthropic": bool(settings.anthropic_api_key),
        "huggingface": bool(settings.huggingface_api_key),
    }
    if not configured.get(provider):
        raise RuntimeError(f"The selected {provider} provider is not configured")

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

            endpoint = HuggingFaceEndpoint(
                repo_id=model if "/" in model else "Qwen/Qwen2.5-Coder-32B-Instruct",
                temperature=temperature,
                max_new_tokens=settings.max_output_tokens,
                huggingfacehub_api_token=settings.huggingface_api_key,
                timeout=120,
            )
            llm = ChatHuggingFace(llm=endpoint, temperature=temperature, verbose=False)
            _cache_model(cache_key, llm)
        except ImportError:
            raise RuntimeError("langchain-huggingface not installed.")

    # ── OpenAI ───────────────────────────────────────────────────────────
    if llm is None and provider == "openai" and settings.openai_api_key:
        from langchain_openai import ChatOpenAI

        llm = ChatOpenAI(
            model=model,
            api_key=settings.openai_api_key,
            temperature=temperature,
            max_tokens=settings.max_output_tokens,
            max_retries=0,
        )

    # ── Anthropic ────────────────────────────────────────────────────────
    if llm is None and provider == "anthropic" and settings.anthropic_api_key:
        from langchain_anthropic import ChatAnthropic

        llm = ChatAnthropic(
            model=model if "claude" in model else "claude-sonnet-4-20250514",
            api_key=settings.anthropic_api_key,
            temperature=temperature,
            max_tokens=settings.max_output_tokens,
            max_retries=0,
        )

    # ── Fallback chain ───────────────────────────────────────────────────
    if llm is None and _google_key_manager.key_count > 0:
        key = _google_key_manager.get_next_key()
        if key:
            llm = _create_google_llm(key, "gemini-2.5-flash", temperature)

    if llm is None and settings.huggingface_api_key:
        try:
            from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint

            endpoint = HuggingFaceEndpoint(
                repo_id="Qwen/Qwen2.5-Coder-32B-Instruct",
                temperature=temperature,
                max_new_tokens=settings.max_output_tokens,
                huggingfacehub_api_token=settings.huggingface_api_key,
                timeout=120,
            )
            llm = ChatHuggingFace(llm=endpoint, temperature=temperature, verbose=False)
        except Exception:
            pass

    if llm is None:
        raise RuntimeError(
            "No LLM API key configured. Set GOOGLE_API_KEYS, GOOGLE_API_KEY, HUGGINGFACE_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY."
        )

    return llm


def _is_transient_error(exc: Exception) -> bool:
    """Check if an exception is a transient error that should trigger fallback.

    Covers: rate limits (429), quota exhaustion, server overload (503),
    and Gemini-specific UNAVAILABLE errors.
    """
    status = getattr(exc, "status_code", None) or getattr(
        getattr(exc, "response", None), "status_code", None
    )
    if isinstance(status, int):
        return status == 429 or 500 <= status < 600
    if isinstance(exc, (TimeoutError, ConnectionError)):
        return True
    err = str(exc).lower()
    return any(
        marker in err
        for marker in [
            "429",
            "resource_exhausted",
            "quota",
            "rate limit",
            "too many requests",
            "rate_limit",
            "503",
            "unavailable",
            "overloaded",
            "service_unavailable",
            "server error",
            "internal error",
            "temporarily",
            "high demand",
            "capacity",
        ]
    )


def _is_model_unavailable_error(exc: Exception) -> bool:
    """Recognize HF's explicit unavailable-model response, not arbitrary 400s."""
    response = getattr(exc, "response", None)
    if getattr(response, "status_code", None) != 400:
        return False
    try:
        body = response.json()
        error = body.get("error", body)
        return isinstance(error, dict) and error.get("code") == "model_not_supported"
    except (ValueError, AttributeError, TypeError):
        return False


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

            endpoint = HuggingFaceEndpoint(
                repo_id="Qwen/Qwen2.5-Coder-32B-Instruct",
                temperature=temperature,
                max_new_tokens=settings.max_output_tokens,
                huggingfacehub_api_token=settings.huggingface_api_key,
                timeout=120,
            )
            llm = ChatHuggingFace(llm=endpoint, temperature=temperature, verbose=False)
            return _cache_model(cache_key, llm)
        except Exception as exc:
            logger.warning("llm.hf_fallback_unavailable", error=str(exc))

    return None


def _underlying_model(llm):
    while getattr(llm, "bound", None) is not None:
        llm = llm.bound
    return llm


def _preserve_bindings(original, replacement, tools=None):
    # Tool schemas and routing options live on RunnableBinding, not the model.
    # Losing these on fallback turns a tool-using request into an ungrounded answer.
    bindings = {}
    layers = []
    while getattr(original, "bound", None) is not None:
        layers.append(getattr(original, "kwargs", {}))
        original = original.bound
    for layer in reversed(layers):
        bindings.update(layer)
    # Thinking controls are model-specific; never forward them to another model.
    if getattr(original, "model", None) != getattr(replacement, "model", None):
        for name in ("thinking_budget", "thinking_level", "include_thoughts"):
            bindings.pop(name, None)
    if tools:
        # Rebuild schemas with the replacement provider's own adapter.
        bindings.pop("tools", None)
        bindings.pop("tool_choice", None)
        replacement = replacement.bind_tools(tools)
    return replacement.bind(**bindings) if bindings else replacement


async def _invoke_with_retry(
    llm, messages, max_retries=None, *, initial_error=None, tools=None
):
    """Bound fallback time and preserve tools; never replay a known failed stream."""
    attempts = get_settings().max_retries if max_retries is None else max_retries
    current = llm
    error = initial_error
    seen = {id(_underlying_model(llm))}
    try:
        # One deadline for the whole request, not a fresh 120s for every key.
        async with asyncio.timeout(120):
            for attempt in range(attempts + 1):
                if error is None:
                    try:
                        from app.services.runs import count_model_call

                        count_model_call()
                        from app.services.provider_limits import model_slot

                        async with model_slot(current):
                            response = await current.ainvoke(messages)
                            from app.agents.telemetry import record_usage

                            record_usage(response)
                            return response
                    except Exception as exc:
                        error = exc
                unavailable_model = _is_model_unavailable_error(error)
                if (
                    not (_is_transient_error(error) or unavailable_model)
                    or attempt == attempts
                ):
                    raise error
                model = _underlying_model(current)
                key = getattr(model, "google_api_key", None)
                if key is not None and not unavailable_model:
                    _google_key_manager.mark_rate_limited(key)
                logger.warning(
                    "llm.model_unavailable"
                    if unavailable_model
                    else "llm.transient_error",
                    attempt=attempt + 1,
                    error_type=type(error).__name__,
                )
                temperature = getattr(model, "temperature", None)
                replacement = _get_fallback_llm(
                    temperature=temperature if temperature is not None else 0.3
                )
                if replacement is None or id(_underlying_model(replacement)) in seen:
                    raise error
                seen.add(id(_underlying_model(replacement)))
                current = _preserve_bindings(llm, replacement, tools)
                error = None
    except asyncio.TimeoutError:
        raise RuntimeError("LLM request timed out after 120 seconds.") from None


class BaseAgent:
    """Base class for all AgentVerse agents."""

    name: str = "base"
    role: str = "General-purpose AI agent"
    system_prompt: str = "You are a helpful AI assistant."
    max_tool_rounds: int = 5  # Override in subclasses that need more rounds

    def __init__(self, tools: list[BaseTool] | None = None):
        self.tools = tools or []

    def _get_fresh_llm(self):
        """Get a fresh LLM instance so the key manager's round-robin rotates keys."""
        llm = get_llm()
        if self.tools:
            return llm.bind_tools(self.tools)
        return llm

    @staticmethod
    def _clean_markdown(text: str) -> str:
        """Post-process LLM output to fix common markdown formatting issues.

        Gemini and other models sometimes produce markdown that doesn't render
        well: missing blank lines before headings, code fences glued to text,
        or headings without the ### prefix. This method fixes those patterns.
        """
        import re

        if not text:
            return text

        # 1. Fix code fences glued to preceding text (e.g. "Code```python" → "Code\n\n```python")
        text = re.sub(r"([^\n`])```", r"\1\n\n```", text)

        # 2. Ensure blank line before headings (###, ##, #) if not already present
        text = re.sub(r"([^\n])\n(#{1,6}\s)", r"\1\n\n\2", text)

        # 3. Ensure blank line after code fence closing ``` before next content
        text = re.sub(r"```\n([^\n])", r"```\n\n\1", text)

        # 4. Ensure blank line before code fences if not already present
        text = re.sub(r"([^\n])\n```", r"\1\n\n```", text)

        # 5. Fix emoji headings without ### prefix (e.g. "🧠 Approach" → "### 🧠 Approach")
        text = re.sub(
            r"^((?:🧠|💻|▶️|📝|⚙️|📋|🔍|📊|🔗|✍️|✅|⚠️|💡|🏁|📄|🔑|📖|❓|🔎|📈|📥)\s.+)$",
            r"### \1",
            text,
            flags=re.MULTILINE,
        )
        # Avoid double ### if the LLM already prefixed it
        text = text.replace("### ### ", "### ")

        # 6. Normalize excessive blank lines (3+ → 2)
        text = re.sub(r"\n{4,}", "\n\n\n", text)

        return text.strip()

    async def run(self, user_input: str, context: str = "") -> str:
        """Use the same bounded tool loop as chat and propagate real failures."""
        from app.api.routes.chat import _run_agent_with_streaming

        class SilentSocket:
            async def send_json(self, _):
                pass

        return await _run_agent_with_streaming(
            self, user_input, context, SilentSocket(), stream=False
        )

    async def _execute_tool_calls(self, tool_calls: list[dict]) -> list:
        """Execute tool calls and return ToolMessage results."""
        from langchain_core.messages import ToolMessage

        from app.agents.tool_execution import execute_tool_calls

        results = await execute_tool_calls(tool_calls, self.tools)
        return [
            ToolMessage(content=result, tool_call_id=call["id"])
            for call, result in zip(tool_calls, results)
        ]

    # Shared formatting rules appended to every agent's system prompt so
    # the frontend MarkdownRenderer always receives well-structured markdown.
    _FORMATTING_RULES = """

## Answer quality
Follow the user's actual format, length, language, audience, and constraints.
Answer the request directly; match the amount of detail to the task. Use headings,
lists, or tables only when useful. Do not add mandatory introductions, conclusions,
process commentary, or decorative sections to short answers.
Use valid Markdown and fenced code blocks. Preserve code indentation and citations.
Distinguish verified facts, assumptions, and missing information. Never invent
sources, statistics, executed tests, or successful tool actions. If a tool fails,
explain the relevant limitation and use the evidence available.
Before answering, check that you addressed every requested part, preserved key
constraints, and supported factual claims with available evidence.
"""

    def _build_identity_clause(self) -> str:
        settings = get_settings()
        return f"You are {self.role}, part of AgentVerse. Configured provider: {settings.default_model_provider}; model: {settings.default_model}. Do not invent capabilities.\n"

    def _build_system_prompt(self, context: str = "") -> str:
        from datetime import datetime, timezone

        prompt = (
            f"Current UTC date: {datetime.now(timezone.utc).date().isoformat()}\n"
            + self._build_identity_clause()
            + self.system_prompt
            + self._FORMATTING_RULES
        )
        if context:
            prompt += f"\n\n## Context from other agents:\n{context}"
        return prompt
