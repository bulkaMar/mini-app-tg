import logging

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings
from .models import Base

log = logging.getLogger(__name__)

engine = create_async_engine(settings.database_url, echo=False)
SessionMaker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# легкі «міграції» нових стовпців без Alembic: (таблиця, стовпець, тип DDL)
# create_all не змінює наявні таблиці, тож додаємо колонки руками — ідемпотентно.
_ADD_COLUMNS = [
    ("messages", "target_role", "VARCHAR(20)"),
    ("expenses", "approved_at", "TIMESTAMP"),
    ("tasks", "done_at", "TIMESTAMP"),
    ("tasks", "updated_at", "TIMESTAMP"),
    ("expenses", "updated_at", "TIMESTAMP"),
]


def _column_missing(sync_conn, table: str, column: str) -> bool:
    insp = inspect(sync_conn)
    if table not in insp.get_table_names():
        return False
    return column not in {c["name"] for c in insp.get_columns(table)}


async def init_db() -> None:
    """Дев-режим: створює таблиці без Alembic. У проді — alembic upgrade head."""
    # друкуємо хост+драйвер БД (без пароля), щоб у логах було видно: Postgres чи SQLite
    url = engine.url
    logging.warning("DB CONNECT → driver=%s host=%s name=%s", url.drivername, url.host, url.database)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # доганяємо нові колонки на наявній БД — кожна окремо й толерантно до гонок
    # (бот і API можуть стартувати одночасно та намагатись додати ту саму колонку)
    for table, column, ddl in _ADD_COLUMNS:
        try:
            async with engine.begin() as conn:
                if await conn.run_sync(_column_missing, table, column):
                    await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
                    logging.warning("DB migrate → %s.%s added", table, column)
        except Exception:
            logging.warning("DB migrate skip %s.%s (вже існує?)", table, column)

    logging.warning("DB tables ensured (create_all done)")
