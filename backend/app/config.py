from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    bot_token: str = ""
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    webapp_url: str = "http://localhost:5173"
    database_url: str = "sqlite+aiosqlite:///./pult.db"

    owner_telegram_id: int = 0
    allowed_user_ids: list[int] = []

    claude_model: str = "claude-opus-4-8"
    monthly_budget: float = 17000.0
    cors_origins: list[str] = ["http://localhost:5173"]
    init_data_max_age: int = 86400  # сек, свіжість auth_date
    dev_auth: bool = False  # ТІЛЬКИ ДЕВ: пускати запити без initData з роллю з X-Dev-Role


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
