import logging
from datetime import datetime, time

from sqlalchemy import func, inspect, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings
from .models import (
    Base,
    BudgetItem,
    DailySnapshot,
    Expense,
    Message,
    Risk,
    Task,
    TaskItem,
    User,
    Workspace,
)

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
    ("tasks", "priority", "VARCHAR(10)"),
    ("tasks", "due_at", "TIMESTAMP"),
    ("tasks", "due_time_set", "BOOLEAN"),
    # листи витрат + тип зайнятості
    ("expenses", "sheet_id", "INTEGER"),
    ("budget_items", "sheet_id", "INTEGER"),
    ("users", "employment", "VARCHAR(10)"),
    ("users", "visible_from", "TIMESTAMP"),
    ("users", "access_until", "TIMESTAMP"),
    # workspaces (мультитенантність): кожна таблиця даних отримує workspace_id
    ("users", "workspace_id", "INTEGER"),
    ("messages", "workspace_id", "INTEGER"),
    ("tasks", "workspace_id", "INTEGER"),
    ("risks", "workspace_id", "INTEGER"),
    ("expenses", "workspace_id", "INTEGER"),
    ("budget_items", "workspace_id", "INTEGER"),
    ("daily_snapshots", "workspace_id", "INTEGER"),
]

# таблиці, рядки яких треба прив'язати до workspace при міграції наявної БД.
# Довідники (розділи/важливість) сюди не входять: вони зʼявились уже з
# workspace_id і наповнюються окремо для кожного простору.
_WS_MODELS = [User, Message, Task, TaskItem, Risk, Expense, BudgetItem, DailySnapshot]


def _column_missing(sync_conn, table: str, column: str) -> bool:
    insp = inspect(sync_conn)
    if table not in insp.get_table_names():
        return False
    return column not in {c["name"] for c in insp.get_columns(table)}


async def _backfill_workspaces() -> None:
    """Наявні дані без workspace → у «легасі» простір першого власника (із env)."""
    async with SessionMaker() as session:
        orphan = 0
        for model in _WS_MODELS:
            orphan += (
                await session.execute(
                    select(func.count()).select_from(model).where(model.workspace_id.is_(None))
                )
            ).scalar() or 0
        if not orphan:
            return
        primary = settings.primary_owner_id
        ws = (
            await session.execute(select(Workspace).where(Workspace.owner_telegram_id == primary))
        ).scalar_one_or_none()
        if ws is None:
            ws = Workspace(owner_telegram_id=primary, name="Робочий простір")
            session.add(ws)
            await session.flush()
        for model in _WS_MODELS:
            await session.execute(
                update(model).where(model.workspace_id.is_(None)).values(workspace_id=ws.id)
            )
        await session.commit()
        logging.warning("DB migrate → backfilled %s orphan rows into workspace %s", orphan, ws.id)


async def _backfill_due_at() -> None:
    """Старі дедлайни (тільки дата) переносимо в due_at як «на весь день»."""
    try:
        async with SessionMaker() as session:
            rows = (await session.execute(
                select(Task).where(Task.due.is_not(None), Task.due_at.is_(None))
            )).scalars().all()
            if not rows:
                return
            for t in rows:
                t.due_at = datetime.combine(t.due, time(0, 0))
                t.due_time_set = False
            await session.commit()
            logging.warning("DB migrate → %s дедлайнів перенесено в due_at", len(rows))
    except Exception:
        logging.warning("DB migrate skip due_at backfill")


async def _backfill_sheets() -> None:
    """Наявні витрати й секції бюджету кладемо в «Загальний бюджет» свого простору."""
    from .services.finance import seed_general_sheet

    try:
        async with SessionMaker() as session:
            ws_ids = (await session.execute(select(Workspace.id))).scalars().all()
            moved = 0
            for ws_id in ws_ids:
                sheet = await seed_general_sheet(session, ws_id)
                for model in (Expense, BudgetItem):
                    res = await session.execute(
                        update(model)
                        .where(model.workspace_id == ws_id, model.sheet_id.is_(None))
                        .values(sheet_id=sheet.id)
                    )
                    moved += res.rowcount or 0
            await session.commit()
            if moved:
                logging.warning("DB migrate -> %s записів у «Загальний бюджет»", moved)
    except Exception:
        logging.warning("DB migrate skip sheets backfill")


async def _seed_existing_workspaces() -> None:
    """Кожен простір має власні розділи й рівні важливості. Наповнюємо ті,
    де їх ще немає (простори, створені до появи довідників). Ідемпотентно:
    у просторі з бодай одним записом нічого не чіпаємо, тож видалене не воскресає."""
    from .services.dictionaries import seed_dictionaries
    from .services.roles import seed_roles

    try:
        async with SessionMaker() as session:
            ws_ids = (await session.execute(select(Workspace.id))).scalars().all()
            for ws_id in ws_ids:
                await seed_dictionaries(session, ws_id)
                await seed_roles(session, ws_id)
    except Exception:
        logging.warning("DB seed dictionaries skipped (гонка старту?)")


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

    await _backfill_workspaces()
    await _backfill_due_at()
    await _backfill_sheets()
    await _seed_existing_workspaces()
    logging.warning("DB tables ensured (create_all + workspace migration done)")
