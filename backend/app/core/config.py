"""
Centralized application configuration.

All environment-dependent values flow through this module — nothing else in the
codebase should call `os.environ` directly. This keeps configuration testable
(override via `Settings(**overrides)`) and makes the full list of required env
vars discoverable in one place.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _find_env_file() -> str:
    """Look for .env in cwd, then parent directories."""
    candidates = [
        Path.cwd() / ".env",
        Path.cwd().parent / ".env",
        Path(__file__).resolve().parent.parent.parent / ".env",
        Path(__file__).resolve().parent.parent.parent.parent / ".env",
    ]
    for p in candidates:
        if p.exists():
            return str(p)
    return ".env"


def validate_provider_model(provider: str, model: str):
    """Reject mismatched families without hard-coding a list of current releases."""
    normalized = model.removeprefix("models/")
    if not model.strip() or (
        provider == "google"
        and not normalized.startswith("gemini-")
        or provider == "anthropic"
        and not normalized.startswith("claude-")
        or provider == "huggingface"
        and "/" not in model
        or provider == "openai"
        and normalized.startswith(("gemini-", "claude-"))
    ):
        raise ValueError("Model name does not match the selected provider")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_find_env_file(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────
    app_name: str = "AgentVerse"
    app_env: str = "development"
    app_debug: bool = True
    secret_key: str = "change-me"
    api_v1_prefix: str = "/api/v1"

    # ── LLM providers ────────────────────────────────────
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    google_api_key: str | None = None
    google_api_keys: str | None = (
        None  # Comma-separated list of Google API keys for round-robin
    )
    huggingface_api_key: str | None = (
        None  # HuggingFace token (HUGGINGFACEHUB_API_TOKEN)
    )
    # Explicitly selected provider; credentials do not silently change it.
    default_model_provider: str = "google"
    default_model: str = "gemini-2.5-flash"

    @property
    def google_api_key_list(self) -> list[str]:
        """Return all available Google API keys as a list (deduped, non-empty)."""
        keys: list[str] = []
        # Add keys from comma-separated GOOGLE_API_KEYS
        if self.google_api_keys:
            keys.extend(k.strip() for k in self.google_api_keys.split(",") if k.strip())
        # Add single GOOGLE_API_KEY if not already present
        if self.google_api_key and self.google_api_key not in keys:
            keys.append(self.google_api_key)
        return list(dict.fromkeys(keys))

    # ── PostgreSQL ───────────────────────────────────────
    database_url: str = ""

    # ── Redis ────────────────────────────────────────────
    redis_url: str = ""
    redis_cache_ttl: int = 3600  # LLM response cache TTL in seconds

    # ── Vector DB ────────────────────────────────────────
    qdrant_url: str = ""
    qdrant_api_key: str | None = None
    qdrant_collection: str = "agentverse_memory_v2"
    embedding_model: str = "gemini-embedding-001"

    # ── Tools ────────────────────────────────────────────

    # ── Auth ─────────────────────────────────────────────
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440
    google_oauth_client_id: str | None = None  # For "Sign in with Google"

    # ── Agent limits ─────────────────────────────────────
    routing_timeout_seconds: float = Field(default=25, gt=0)
    tool_timeout_seconds: float = Field(default=25, gt=0)
    max_parallel_tools: int = Field(default=4, ge=1, le=8)
    max_retries: int = Field(default=2, ge=0, le=3)

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def effective_database_url(self) -> str:
        """Return configured DB URL or fallback to SQLite in the backend dir."""
        if self.database_url:
            url = self.database_url
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql+asyncpg://", 1)
            elif url.startswith("postgresql://"):
                url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

            from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

            parts = urlsplit(url)
            query = [
                ("ssl" if key == "sslmode" else key, value)
                for key, value in parse_qsl(parts.query)
            ]
            url = urlunsplit(
                (
                    parts.scheme,
                    parts.netloc,
                    parts.path,
                    urlencode(query),
                    parts.fragment,
                )
            )
            return url
        db_path = Path(__file__).resolve().parent.parent.parent / "agentverse.db"
        return f"sqlite+aiosqlite:///{db_path}"

    @property
    def llm_configured(self) -> bool:
        """Configuration status for the selected provider, not a health probe."""
        return bool(
            {
                "google": self.google_api_key_list,
                "openai": self.openai_api_key,
                "anthropic": self.anthropic_api_key,
                "huggingface": self.huggingface_api_key,
            }.get(self.default_model_provider)
        )

    allowed_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,https://agentverse-psi.vercel.app"
    )
    turn_timeout_seconds: float = Field(default=180, gt=0, le=600)
    max_concurrent_turns: int = Field(default=4, ge=1, le=32)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_from: str | None = None
    smtp_username: str | None = None
    smtp_password: str | None = None
    public_frontend_url: str | None = None
    google_quota_group: str = "default-project"
    max_output_tokens: int = Field(default=4096, ge=256, le=16384)
    max_model_calls_per_turn: int = Field(default=16, ge=1, le=40)
    execution_url: str | None = None
    execution_token: str | None = None
    connector_owner_id: str | None = None
    slack_bot_token: str | None = None
    linear_api_key: str | None = None
    github_token: str | None = None
    artifact_ttl_hours: int = Field(default=168, ge=1, le=720)

    @model_validator(mode="after")
    def validate_production(self):
        if self.default_model_provider not in (
            "google",
            "openai",
            "anthropic",
            "huggingface",
        ):
            raise ValueError("Unsupported model provider")
        if self.jwt_algorithm != "HS256":
            raise ValueError("Only HS256 is supported")
        validate_provider_model(self.default_model_provider, self.default_model)
        if self.is_production and (
            len(self.secret_key) < 32 or self.secret_key == "change-me"
        ):
            raise ValueError(
                "Production requires a random SECRET_KEY of at least 32 characters"
            )
        if self.is_production and not self.database_url:
            raise ValueError("Production requires a durable DATABASE_URL")
        if self.is_production and not self.effective_database_url.startswith(
            "postgresql+asyncpg://"
        ):
            raise ValueError("Production requires PostgreSQL storage")
        if self.is_production and self.app_debug:
            raise ValueError("APP_DEBUG must be false in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
