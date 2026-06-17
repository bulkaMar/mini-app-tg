import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings
from .models import Base

log = logging.getLogger(__name__)

engine = create_async_engine(settings.database_url, echo=False)
SessionMaker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db() -> None:
    """Дев-режим: створює таблиці без Alembic. У проді — alembic upgrade head."""
    # друкуємо хост+драйвер БД (без пароля), щоб у логах було видно: Postgres чи SQLite
    url = engine.url
    logging.warning("DB CONNECT → driver=%s host=%s name=%s", url.drivername, url.host, url.database)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logging.warning("DB tables ensured (create_all done)")
