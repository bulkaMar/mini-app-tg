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
    # кілька власників → кожен зі своїм ізольованим workspace. Приймає список
    # OWNER_TELEGRAM_IDS (через кому або JSON); owner_telegram_id лишається для сумісності
    owner_telegram_ids: Annotated[list[int], NoDecode] = []
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

    @field_validator("owner_telegram_id", mode="before")
    @classmethod
    def _blank_to_zero(cls, v):
        """Порожній OWNER_TELEGRAM_ID в env не валимо — трактуємо як 0 (не задано)."""
        if isinstance(v, str) and not v.strip():
            return 0
        return v

    @field_validator("allowed_user_ids", "owner_telegram_ids", "cors_origins", mode="before")
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

    @property
    def owner_ids(self) -> set[int]:
        """Усі дозволені власники: owner_telegram_id (сумісність) + owner_telegram_ids."""
        ids = set(int(x) for x in self.owner_telegram_ids if x)
        if self.owner_telegram_id:
            ids.add(int(self.owner_telegram_id))
        return ids

    @property
    def primary_owner_id(self) -> int:
        """Детермінований «основний» власник: для легасі-бекфілу, дев-простору, allowed."""
        if self.owner_telegram_id:
            return int(self.owner_telegram_id)
        ids = self.owner_ids
        return min(ids) if ids else 0

    def is_owner(self, tg_id: int | None) -> bool:
        return tg_id is not None and int(tg_id) in self.owner_ids


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
