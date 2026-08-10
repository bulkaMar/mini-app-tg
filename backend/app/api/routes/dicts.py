"""Категорії задач і рівні важливості."""




from fastapi import APIRouter, Depends, HTTPException, Query

from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession



from ...models import Task, TaskCategory, TaskPriority, User
from ...services.dictionaries import (
    all_categories,
    all_priorities,
    default_priority_key,
    new_key,
    usable_categories,
    visible_categories,
)


from ...services.roles import (
    all_roles,
)



from ..deps import get_current_user, get_session, require_owner


from .common import COLORS

router = APIRouter()


async def _visible_role_keys(session: AsyncSession, user: User) -> set[str]:
    """Ролі, яким можна відкрити розділ (роль власниці не перелічуємо — вона
    бачить усе завжди)."""
    return {r.key for r in await all_roles(session, user.workspace_id) if r.base != "owner"}


# ---------- довідники: розділи задач і рівні важливості ----------
# Читати може будь-хто (без назв не намалювати списки), змінювати — тільки власниця.


def _cat_out(c: TaskCategory, usable: set[str]) -> dict:
    return {
        "id": c.id, "key": c.key, "label": c.label, "icon": c.icon, "color": c.color,
        "roles": c.roles or [], "is_system": c.is_system, "can_use": c.key in usable,
    }


def _prio_out(p: TaskPriority) -> dict:
    return {
        "id": p.id, "key": p.key, "label": p.label, "icon": p.icon, "color": p.color,
        "rank": p.rank, "is_default": p.is_default, "is_system": p.is_system,
    }


@router.get("/dictionaries")
async def dictionaries(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> dict:
    """Розділи (лише ті, що людині видно) + усі рівні важливості."""
    visible = await visible_categories(session, user)
    usable = set(await usable_categories(session, user))
    return {
        "categories": [
            _cat_out(c, usable) for c in await all_categories(session, user.workspace_id) if c.key in visible
        ],
        "priorities": [_prio_out(p) for p in await all_priorities(session, user.workspace_id)],
    }


class CategoryIn(BaseModel):
    label: str
    icon: str = "task"
    color: str = "orange"
    roles: list[str] = []


@router.post("/categories")
async def create_category(
    body: CategoryIn,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    label = body.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="Назва категорії не може бути порожньою")
    rows = await all_categories(session, user.workspace_id)
    if any(c.label.lower() == label.lower() for c in rows):
        raise HTTPException(status_code=409, detail="Категорія з такою назвою вже є")
    cat = TaskCategory(
        workspace_id=user.workspace_id,
        key=await new_key(session, "c", TaskCategory, user.workspace_id),
        label=label,
        icon=body.icon or "task",
        color=body.color if body.color in COLORS else "orange",
        roles=[r for r in body.roles if r in await _visible_role_keys(session, user)],
        is_system=False,
        sort=max((c.sort for c in rows), default=100) + 10,
    )
    session.add(cat)
    await session.commit()
    return {"id": cat.id, "key": cat.key, "ok": True}


@router.patch("/categories/{cat_id}")
async def update_category(
    cat_id: int,
    body: dict,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Перейменувати / змінити вигляд і те, хто бачить. Системний розділ — теж можна."""
    cat = (await session.execute(select(TaskCategory).where(
        TaskCategory.id == cat_id, TaskCategory.workspace_id == user.workspace_id
    ))).scalar_one_or_none()
    if cat is None:
        raise HTTPException(status_code=404)
    if isinstance(body.get("label"), str) and body["label"].strip():
        cat.label = body["label"].strip()
    if isinstance(body.get("icon"), str) and body["icon"].strip():
        cat.icon = body["icon"].strip()
    if body.get("color") in COLORS:
        cat.color = body["color"]
    if isinstance(body.get("roles"), list):
        valid = await _visible_role_keys(session, user)
        cat.roles = [r for r in body["roles"] if r in valid]
    await session.commit()
    return {"ok": True}


@router.delete("/categories/{cat_id}")
async def delete_category(
    cat_id: int,
    move_to: str | None = Query(default=None),
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Видаляє свій розділ. Якщо в ньому є справи — просимо вказати, куди їх перенести."""
    cat = (await session.execute(select(TaskCategory).where(
        TaskCategory.id == cat_id, TaskCategory.workspace_id == user.workspace_id
    ))).scalar_one_or_none()
    if cat is None:
        raise HTTPException(status_code=404)
    if cat.is_system:
        raise HTTPException(
            status_code=409,
            detail="Це системна категорія — на ній побудовані екрани. Її можна перейменувати, але не видалити",
        )

    count = (await session.execute(
        select(func.count()).select_from(Task).where(Task.category == cat.key, Task.deleted_at.is_(None))
    )).scalar_one()
    if count:
        others = [c.key for c in await all_categories(session, user.workspace_id) if c.key != cat.key]
        if move_to not in others:
            raise HTTPException(
                status_code=409,
                detail=f"tasks_present:{count}",  # фронт спитає, куди перенести
            )
        await session.execute(
            update(Task).where(Task.category == cat.key).values(category=move_to)
        )
    await session.delete(cat)
    await session.commit()
    return {"ok": True, "moved": count}


class PriorityIn(BaseModel):
    label: str
    icon: str | None = None
    color: str = "muted"


@router.post("/priorities")
async def create_priority(
    body: PriorityIn,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Новий рівень стає найменш важливим — далі його можна підняти стрілками."""
    label = body.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="Назва рівня не може бути порожньою")
    rows = await all_priorities(session, user.workspace_id)
    if any(p.label.lower() == label.lower() for p in rows):
        raise HTTPException(status_code=409, detail="Рівень із такою назвою вже є")
    prio = TaskPriority(
        workspace_id=user.workspace_id,
        key=await new_key(session, "p", TaskPriority, user.workspace_id),
        label=label,
        icon=(body.icon or None),
        color=body.color if body.color in COLORS else "muted",
        rank=max((p.rank for p in rows), default=50) + 10,
        is_default=False,
        is_system=False,
    )
    session.add(prio)
    await session.commit()
    return {"id": prio.id, "key": prio.key, "ok": True}


@router.patch("/priorities/{prio_id}")
async def update_priority(
    prio_id: int,
    body: dict,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    prio = (await session.execute(select(TaskPriority).where(
        TaskPriority.id == prio_id, TaskPriority.workspace_id == user.workspace_id
    ))).scalar_one_or_none()
    if prio is None:
        raise HTTPException(status_code=404)
    if isinstance(body.get("label"), str) and body["label"].strip():
        prio.label = body["label"].strip()
    if "icon" in body:
        icon = body["icon"]
        prio.icon = icon.strip() if isinstance(icon, str) and icon.strip() else None
    if body.get("color") in COLORS:
        prio.color = body["color"]
    await session.commit()
    return {"ok": True}


class PriorityOrderIn(BaseModel):
    ids: list[int]


@router.put("/priorities/order")
async def reorder_priorities(
    body: PriorityOrderIn,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Порядок згори вниз: перший — найважливіший."""
    rows = {p.id: p for p in await all_priorities(session, user.workspace_id)}
    for i, pid in enumerate(body.ids):
        if pid in rows:
            rows[pid].rank = i * 10
    await session.commit()
    return {"ok": True}


@router.delete("/priorities/{prio_id}")
async def delete_priority(
    prio_id: int,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Задачі з цим рівнем стають звичайними — нічого не губиться."""
    prio = (await session.execute(select(TaskPriority).where(
        TaskPriority.id == prio_id, TaskPriority.workspace_id == user.workspace_id
    ))).scalar_one_or_none()
    if prio is None:
        raise HTTPException(status_code=404)
    if prio.is_default:
        raise HTTPException(
            status_code=409,
            detail="Це рівень за замовчуванням — на нього падають задачі з видалених рівнів",
        )
    fallback = await default_priority_key(session, user.workspace_id)
    await session.execute(
        update(Task).where(Task.priority == prio.key).values(priority=fallback)
    )
    await session.delete(prio)
    await session.commit()
    return {"ok": True}
