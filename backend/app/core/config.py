"""
Centralized application configuration.

All environment-dependent values flow through this module — nothing else in the
codebase should call `os.environ` directly. This keeps configuration testable
(override via `Settings(**overrides)`) and makes the full list of required env
vars discoverable in one place.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
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
    google_api_keys: str | None = None  # Comma-separated list of Google API keys for round-robin
    huggingface_api_key: str | None = None  # HuggingFace token (HUGGINGFACEHUB_API_TOKEN)
    # Force google provider to fix Render deployment issue where env vars override
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
        return keys

    # ── PostgreSQL ───────────────────────────────────────
    database_url: str = ""

    # ── Redis ────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── Vector DB ────────────────────────────────────────
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "agentverse_memory"

    # ── Tools ────────────────────────────────────────────
    tavily_api_key: str | None = None

    # ── Auth ─────────────────────────────────────────────
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

    # ── Agent limits ─────────────────────────────────────
    max_retries: int = 2
    max_plan_steps: int = 10
    critic_pass_threshold: float = 0.75

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
            
            if "sslmode=" in url:
                url = url.replace("sslmode=", "ssl=")
            return url
        db_path = Path(__file__).resolve().parent.parent.parent / "agentverse.db"
        return f"sqlite+aiosqlite:///{db_path}"

    @property
    def llm_configured(self) -> bool:
        """Check if at least one LLM provider has a key."""
        return bool(
            self.openai_api_key
            or self.anthropic_api_key
            or self.google_api_key
            or self.huggingface_api_key
        )

    @model_validator(mode="after")
    def _prefer_google_when_available(self) -> "Settings":
        """Always prefer Google Gemini when a key is available.

        Render's env vars may set DEFAULT_MODEL_PROVIDER to 'huggingface',
        but HuggingFace free tier is extremely slow for large models. When we
        have a Google API key, force the fast path.
        """
        if self.google_api_key and self.default_model_provider != "google":
            self.default_model_provider = "google"
            self.default_model = "gemini-2.5-flash"
        return self


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton — import this, not Settings() directly."""
    return Settings()
