"""Ролі як дані."""




from fastapi import APIRouter, Depends, HTTPException

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession



from ...models import Role, User


from ...services.roles import (
    all_roles,
    members_with_role,
    new_role_key,
)



from ..deps import get_current_user, get_session, require_owner


from .common import COLORS

router = APIRouter()


# ---------- ролі ----------
# Ролі — дані простору. Читати може будь-хто (без підписів не намалювати
# бейджі), змінювати — тільки власниця.


def _role_out(r: Role, used: int) -> dict:
    return {
        "id": r.id, "key": r.key, "label": r.label, "color": r.color,
        "base": r.base, "is_system": r.is_system, "members": used,
    }


@router.get("/roles")
async def roles(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> dict:
    rows = await all_roles(session, user.workspace_id)
    counts = dict((await session.execute(
        select(User.role, func.count()).where(User.workspace_id == user.workspace_id).group_by(User.role)
    )).all())
    return {
        "roles": [_role_out(r, counts.get(r.key, 0)) for r in rows],
        "can_manage": getattr(user, "base_role", user.role) == "owner",
    }


class RoleIn(BaseModel):
    label: str
    color: str = "muted"
    base: str = "assistant"


@router.post("/roles")
async def create_role(
    body: RoleIn,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    label = body.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="Назва ролі не може бути порожньою")
    rows = await all_roles(session, user.workspace_id)
    if any(r.label.lower() == label.lower() for r in rows):
        raise HTTPException(status_code=409, detail="Роль із такою назвою вже є")
    base = body.base if body.base in ("manager", "assistant", "driver") else "assistant"
    role = Role(
        workspace_id=user.workspace_id,
        key=await new_role_key(session, user.workspace_id),
        label=label,
        color=body.color if body.color in COLORS else "muted",
        base=base,
        is_system=False,
        sort=max((r.sort for r in rows), default=100) + 10,
    )
    session.add(role)
    await session.commit()
    return {"id": role.id, "key": role.key, "ok": True}


@router.patch("/roles/{role_id}")
async def update_role(
    role_id: int,
    body: dict,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    role = (await session.execute(select(Role).where(
        Role.id == role_id, Role.workspace_id == user.workspace_id
    ))).scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404)
    if isinstance(body.get("label"), str) and body["label"].strip():
        role.label = body["label"].strip()
    if body.get("color") in COLORS:
        role.color = body["color"]
    # у власника «поводиться як» не міняємо — це єдина роль із повними правами
    if body.get("base") in ("manager", "assistant", "driver") and role.base != "owner":
        role.base = body["base"]
    await session.commit()
    return {"ok": True}


@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: int,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Роль із людьми не видаляємо: спершу треба перевести їх на іншу."""
    role = (await session.execute(select(Role).where(
        Role.id == role_id, Role.workspace_id == user.workspace_id
    ))).scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404)
    if role.is_system:
        raise HTTPException(
            status_code=409,
            detail="Це базова роль — на ній тримається роздача задач і сповіщення. "
                   "Її можна перейменувати, але не видалити",
        )
    used = await members_with_role(session, user.workspace_id, role.key)
    if used:
        raise HTTPException(
            status_code=409,
            detail=f"Цю роль має людей: {used}. Спершу переведіть їх на іншу роль",
        )
    await session.delete(role)
    await session.commit()
    return {"ok": True}
