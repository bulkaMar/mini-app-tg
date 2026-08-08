"""Розділи задач і рівні важливості як дані, а не як код.

Системні записи створюються один раз при першому старті (коли таблиця порожня),
далі власниця сама додає/перейменовує/видаляє свої. Повторний старт нічого не
відновлює — інакше видалене поверталося б після кожного перезапуску.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Task, TaskCategory, TaskPriority, User

# key, label, icon, color, хто бачить, порядок
SYSTEM_CATEGORIES = [
    ("production", "Проєкти", "film", "blue", ["manager"], 10),
    ("life", "Побут", "home", "green", ["assistant"], 20),
    ("dog", "Пес", "dog", "green", ["assistant"], 30),
    ("logistics", "Поїздки", "pin", "gold", ["driver"], 40),
]
# key, label, icon, color, rank (менше — важливіше), за замовчуванням
SYSTEM_PRIORITIES = [
    ("urgent", "Супер термінова", "flame", "red", 0, False),
    ("high", "Важлива", "up", "warn", 10, False),
    ("normal", "Звичайна", None, "muted", 50, True),
]

FALLBACK_PRIORITY = "normal"
FALLBACK_CATEGORY = "life"


async def seed_dictionaries(session: AsyncSession) -> None:
    """Заповнює довідники системними значеннями — тільки якщо вони порожні."""
    if not (await session.execute(select(TaskCategory.id).limit(1))).first():
        for key, label, icon, color, roles, sort in SYSTEM_CATEGORIES:
            session.add(TaskCategory(
                key=key, label=label, icon=icon, color=color,
                roles=roles, is_system=True, sort=sort,
            ))
    if not (await session.execute(select(TaskPriority.id).limit(1))).first():
        for key, label, icon, color, rank, is_default in SYSTEM_PRIORITIES:
            session.add(TaskPriority(
                key=key, label=label, icon=icon, color=color,
                rank=rank, is_default=is_default, is_system=True,
            ))
    await session.commit()


# ---------- читання ----------

async def all_categories(session: AsyncSession) -> list[TaskCategory]:
    return list((await session.execute(
        select(TaskCategory).order_by(TaskCategory.sort.asc(), TaskCategory.id.asc())
    )).scalars().all())


async def all_priorities(session: AsyncSession) -> list[TaskPriority]:
    return list((await session.execute(
        select(TaskPriority).order_by(TaskPriority.rank.asc(), TaskPriority.id.asc())
    )).scalars().all())


async def default_priority_key(session: AsyncSession) -> str:
    row = (await session.execute(
        select(TaskPriority).where(TaskPriority.is_default.is_(True))
    )).scalars().first()
    if row:
        return row.key
    first = (await session.execute(
        select(TaskPriority).order_by(TaskPriority.rank.desc())
    )).scalars().first()
    return first.key if first else FALLBACK_PRIORITY


async def priority_keys(session: AsyncSession) -> set[str]:
    return {p.key for p in await all_priorities(session)}


# ---------- доступ до розділів ----------

async def usable_categories(session: AsyncSession, user: User) -> list[str]:
    """Розділи, у які людина може класти задачі — у порядку відображення."""
    rows = await all_categories(session)
    if user.role == "owner":
        return [c.key for c in rows]
    return [c.key for c in rows if user.role in (c.roles or [])]


async def _assigned_categories(session: AsyncSession, user: User) -> set[str]:
    """Розділи задач, доручених особисто цій ролі — навіть якщо розділ їй закритий."""
    rows = (await session.execute(
        select(Task.category).where(Task.owner_role == user.role).distinct()
    )).scalars().all()
    return {r for r in rows if r}


async def visible_categories(session: AsyncSession, user: User) -> set[str]:
    """Що людина бачить у списках: свої розділи + розділи доручених їй задач."""
    if user.role == "owner":
        return {c.key for c in await all_categories(session)}
    return set(await usable_categories(session, user)) | await _assigned_categories(session, user)


# ---------- створення власних записів ----------

async def new_key(session: AsyncSession, prefix: str, model) -> str:
    """Короткий унікальний ключ (`c_a1b2c3`) — у БД, користувач його не бачить."""
    taken = set((await session.execute(select(model.key))).scalars().all())
    while True:
        key = f"{prefix}_{uuid.uuid4().hex[:6]}"
        if key not in taken:
            return key
