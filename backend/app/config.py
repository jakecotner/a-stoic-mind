from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://stoa:stoa@localhost:5433/stoa"

    # Read from .env and passed to the SDK explicitly (pydantic-settings does
    # not export .env values to os.environ, so the SDK can't see them itself).
    # Leave unset to fall back to the ANTHROPIC_API_KEY env var / `ant` profile.
    anthropic_api_key: str | None = None
    voyage_api_key: str | None = None

    anthropic_model: str = "claude-opus-4-8"
    chat_effort: str = "medium"
    chat_max_tokens: int = 8192

    retrieval_top_k: int = 6
    history_max_messages: int = 20

    cors_origins: list[str] = ["http://localhost:5173"]

    # Production: directory of built frontend assets to serve at "/"
    # (set by the Dockerfile; unset in dev, where Vite serves the frontend).
    static_dir: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
