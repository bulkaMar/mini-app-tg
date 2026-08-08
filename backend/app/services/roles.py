"""Ролі як дані, а не як код.

`base` — «поводиться як» одна з чотирьох базових ролей. Поки немає тумблерів
розділів по кожній людині (0.5–0.7), саме base вирішує, який екран покажеться
й до яких базових тем (стрічка, фінанси) людина має доступ. Що вона бачить
у задачах — визначає список «хто бачить» у самих розділах.

Системними лишаються owner / manager / assistant / driver: на них тримається
роздача задач («Перевір і роздай») і маршрутизація сповіщень. Їх можна
перейменувати й перефарбувати, але не видалити. Решта — вільно.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Role, User

BASES = ("owner", "manager", "assistant", "driver")

# key, label, color, base, sort, is_system
SYSTEM_ROLES = [
    ("owner", "Власник", "ink", "owner", 0, True),
    ("coowner", "Співвласник", "ink", "manager", 10, False),
    ("manager", "Менеджер", "blue", "manager", 20, True),
    ("assistant", "Асистент", "green", "assistant", 30, True),
    ("driver", "Водій", "gold", "driver", 40, True),
    ("photographer", "Фотограф", "orange", "manager", 50, False),
    ("photo_asst", "Асистент фотографа", "orange", "manager", 60, False),
    ("makeup", "Візажист", "red", "assistant", 70, False),
    ("stylist", "Стиліст", "red", "assistant", 80, False),
    ("helper1", "Помічник 1", "muted", "assistant", 90, False),
    ("helper2", "Помічник 2", "muted", "assistant", 100, False),
    ("helper3", "Помічник 3", "muted", "assistant", 110, False),
]

# запасні підписи, якщо довідник ще не наповнено (бот на старті, легасі-дані)
FALLBACK_LABELS = {
    "owner": "власник", "manager": "менеджер", "assistant": "асистент", "driver": "водій",
}


async def seed_roles(session: AsyncSession, workspace_id: int | None) -> None:
    """Наповнює ролі простору — лише якщо їх ще немає (видалене не воскресає)."""
    has = (await session.execute(
        select(Role.id).where(Role.workspace_id == workspace_id).limit(1)
    )).first()
    if has:
        return
    for key, label, color, base, sort, is_system in SYSTEM_ROLES:
        session.add(Role(
            workspace_id=workspace_id, key=key, label=label, color=color,
            base=base, sort=sort, is_system=is_system,
        ))
    await session.commit()


async def all_roles(session: AsyncSession, workspace_id: int | None) -> list[Role]:
    return list((await session.execute(
        select(Role)
        .where(Role.workspace_id == workspace_id)
        .order_by(Role.sort.asc(), Role.id.asc())
    )).scalars().all())


async def role_labels(session: AsyncSession, workspace_id: int | None) -> dict[str, str]:
    """Підписи ролей простору поверх запасних."""
    out = dict(FALLBACK_LABELS)
    for r in await all_roles(session, workspace_id):
        out[r.key] = r.label
    return out


async def base_of(session: AsyncSession, user: User) -> str:
    """«Поводиться як» для конкретної людини. Невідома роль → assistant
    (найменш повноважна з робочих), щоб застосунок не ламався."""
    if user.role == "owner":
        return "owner"
    row = (await session.execute(
        select(Role).where(Role.workspace_id == user.workspace_id, Role.key == user.role)
    )).scalars().first()
    if row and row.base in BASES:
        return row.base
    return user.role if user.role in BASES else "assistant"


async def members_with_role(session: AsyncSession, workspace_id: int | None, key: str) -> int:
    return (await session.execute(
        select(func.count()).select_from(User).where(
            User.workspace_id == workspace_id, User.role == key
        )
    )).scalar_one()


async def new_role_key(session: AsyncSession, workspace_id: int | None) -> str:
    taken = {r.key for r in await all_roles(session, workspace_id)}
    while True:
        key = f"r_{uuid.uuid4().hex[:6]}"
        if key not in taken:
            return key
