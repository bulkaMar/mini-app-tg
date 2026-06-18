import json
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    bot_token: str = ""
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    webapp_url: str = "http://localhost:5173"
    database_url: str = "sqlite+aiosqlite:///./pult.db"

    owner_telegram_id: int = 0
    # NoDecode: не даємо pydantic JSON-парсити env — розбираємо самі (нижче)
    allowed_user_ids: Annotated[list[int], NoDecode] = []

    claude_model: str = "claude-opus-4-8"
    monthly_budget: float = 17000.0
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    init_data_max_age: int = 86400  # сек, свіжість auth_date
    dev_auth: bool = False  # ТІЛЬКИ ДЕВ: пускати запити без initData з роллю з X-Dev-Role

    @field_validator("database_url", mode="before")
    @classmethod
    def _async_driver(cls, v: str) -> str:
        """Railway/Heroku дають postgresql://… — додаємо async-драйвер для SQLAlchemy."""
        if not isinstance(v, str):
            return v
        # Railway/копіпаст лишають зайві пробіли/перенос рядка → asyncpg бачить ім'я БД як "postgres\n"
        v = v.strip()
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        if v.startswith("postgres://"):  # старий формат Heroku
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        return v

    @field_validator("allowed_user_ids", "cors_origins", mode="before")
    @classmethod
    def _split_list(cls, v):
        """Приймає і JSON-список ["a","b"], і простий рядок через кому a, b."""
        if v is None:
            return []
        if not isinstance(v, str):
            return v  # уже список (дефолт)
        s = v.strip()
        if not s:
            return []
        if s.startswith("["):
            return json.loads(s)
        return [item.strip() for item in s.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
