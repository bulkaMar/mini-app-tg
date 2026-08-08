"""Розділи задач і рівні важливості як дані, а не як код.

У кожного простору (workspace) — свій власний набір: власниця може перейменувати
«Побут» на «Дім», і це не зачепить нікого іншого. Системні записи створюються
один раз при появі простору. Повторний старт нічого не відновлює — інакше
видалене поверталося б після кожного перезапуску.
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


async def seed_dictionaries(session: AsyncSession, workspace_id: int | None) -> None:
    """Наповнює довідники простору системними значеннями — лише якщо вони порожні."""
    has_cats = (await session.execute(
        select(TaskCategory.id).where(TaskCategory.workspace_id == workspace_id).limit(1)
    )).first()
    if not has_cats:
        for key, label, icon, color, roles, sort in SYSTEM_CATEGORIES:
            session.add(TaskCategory(
                workspace_id=workspace_id, key=key, label=label, icon=icon,
                color=color, roles=roles, is_system=True, sort=sort,
            ))
    has_prios = (await session.execute(
        select(TaskPriority.id).where(TaskPriority.workspace_id == workspace_id).limit(1)
    )).first()
    if not has_prios:
        for key, label, icon, color, rank, is_default in SYSTEM_PRIORITIES:
            session.add(TaskPriority(
                workspace_id=workspace_id, key=key, label=label, icon=icon,
                color=color, rank=rank, is_default=is_default, is_system=True,
            ))
    if not has_cats or not has_prios:
        await session.commit()


# ---------- читання ----------

async def all_categories(session: AsyncSession, workspace_id: int | None) -> list[TaskCategory]:
    return list((await session.execute(
        select(TaskCategory)
        .where(TaskCategory.workspace_id == workspace_id)
        .order_by(TaskCategory.sort.asc(), TaskCategory.id.asc())
    )).scalars().all())


async def all_priorities(session: AsyncSession, workspace_id: int | None) -> list[TaskPriority]:
    return list((await session.execute(
        select(TaskPriority)
        .where(TaskPriority.workspace_id == workspace_id)
        .order_by(TaskPriority.rank.asc(), TaskPriority.id.asc())
    )).scalars().all())


async def default_priority_key(session: AsyncSession, workspace_id: int | None) -> str:
    rows = await all_priorities(session, workspace_id)
    for p in rows:
        if p.is_default:
            return p.key
    return rows[-1].key if rows else FALLBACK_PRIORITY


async def priority_keys(session: AsyncSession, workspace_id: int | None) -> set[str]:
    return {p.key for p in await all_priorities(session, workspace_id)}


# ---------- доступ до розділів ----------

async def usable_categories(session: AsyncSession, user: User) -> list[str]:
    """Розділи, у які людина може класти задачі — у порядку відображення."""
    rows = await all_categories(session, user.workspace_id)
    if getattr(user, "base_role", user.role) == "owner":
        return [c.key for c in rows]
    return [c.key for c in rows if user.role in (c.roles or [])]


async def _assigned_categories(session: AsyncSession, user: User) -> set[str]:
    """Розділи задач, доручених особисто цій ролі — навіть якщо розділ їй закритий."""
    rows = (await session.execute(
        select(Task.category)
        .where(Task.workspace_id == user.workspace_id, Task.owner_role == user.role)
        .distinct()
    )).scalars().all()
    return {r for r in rows if r}


async def visible_categories(session: AsyncSession, user: User) -> set[str]:
    """Що людина бачить у списках: свої розділи + розділи доручених їй задач."""
    if getattr(user, "base_role", user.role) == "owner":
        return {c.key for c in await all_categories(session, user.workspace_id)}
    return set(await usable_categories(session, user)) | await _assigned_categories(session, user)


# ---------- створення власних записів ----------

async def new_key(session: AsyncSession, prefix: str, model, workspace_id: int | None) -> str:
    """Короткий унікальний ключ (`c_a1b2c3`) у межах простору — користувач його не бачить."""
    taken = set((await session.execute(
        select(model.key).where(model.workspace_id == workspace_id)
    )).scalars().all())
    while True:
        key = f"{prefix}_{uuid.uuid4().hex[:6]}"
        if key not in taken:
            return key
