"""Команда: додавання людей, ролі, доступи, строк."""

from datetime import datetime, timezone


from fastapi import APIRouter, Depends, HTTPException

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession



from ...models import User
from ...services.access import access_expired, parse_access_hours
from ...services.finance import (
    all_sheets,
    normalize_finance_perms,
)

from ...services.permissions import (
    fields_of,
    normalize as normalize_perms,
    require_section,
    sections_of,
)
from ...services.roles import (
    all_roles,
    role_labels,
)



from ..deps import get_current_user, get_session, require_owner




router = APIRouter()


# ---------- team (owner) ----------


async def _check_member_role(session: AsyncSession, user: User, key: str) -> None:
    """Роль має існувати в цьому просторі й не бути роллю власниці."""
    rows = {r.key: r for r in await all_roles(session, user.workspace_id)}
    role = rows.get(key)
    if role is None:
        raise HTTPException(status_code=400, detail="Такої ролі немає")
    if role.base == "owner":
        raise HTTPException(status_code=403, detail="Роль власниці не призначається")


class MemberIn(BaseModel):
    username: str
    name: str = ""
    phone: str = ""
    role: str = "assistant"
    employment: str = "permanent"          # permanent | temporary
    finance_scope: str = "all"             # all | sheets
    finance_sheets: list[int] = []
    access_hours: int = 0                  # 0 = безстроково
    sections: dict = {}                    # розділ → full | list | none
    fields: dict = {}                      # поле → чи показувати


def member_card(u: User, labels: dict[str, str]) -> dict:
    """Те, що видно кожному, кому відкритий розділ «Люди»: як звати, ким працює
    і як зв'язатись. Нічого про доступи — це справа власниці."""
    return {
        "id": u.id,
        "name": u.name,
        "username": u.username,
        "phone": u.phone,
        "role": u.role,
        "role_label": labels.get(u.role, u.role),
        "status": u.status,
    }


@router.get("/team")
async def team(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> list[dict]:
    """Список людей простору.

    Власниця бачить усе, зокрема налаштування доступу кожного. Решта — лише
    картку (ім'я, роль, як зв'язатись), і тільки якщо розділ їй відкритий:
    хто які розділи бачить і доки — не їхня справа.
    """
    require_section(user, "team")
    owner_view = getattr(user, "base_role", user.role) == "owner"
    rows = (
        await session.execute(
            select(User).where(User.workspace_id == user.workspace_id).order_by(User.created_at.asc())
        )
    ).scalars().all()
    labels = await role_labels(session, user.workspace_id)
    out = []
    for u in rows:
        card = member_card(u, labels)
        if owner_view:
            card |= {
                "permissions": u.permissions or {},
                "employment": u.employment or "permanent",
                "visible_from": u.visible_from.isoformat() if u.visible_from else None,
                "access_until": u.access_until.isoformat() if u.access_until else None,
                "access_expired": access_expired(u),
                "sections": sections_of(u),
                "fields": fields_of(u),
            }
        out.append(card)
    return out


@router.post("/team")
async def invite_member(
    body: MemberIn,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await _check_member_role(session, user, body.role)
    username = body.username.lstrip("@")
    valid = {s.id for s in await all_sheets(session, user.workspace_id)}
    temporary = body.employment == "temporary"
    member = User(
        workspace_id=user.workspace_id,  # запрошений приєднується до простору власника
        username=username, name=body.name or username, phone=body.phone.strip() or None,
        role=body.role, status="invited",
        employment="temporary" if temporary else "permanent",
        # тимчасовий бачить лише те, що зʼявилось після його додавання
        visible_from=datetime.now(timezone.utc) if temporary else None,
        access_until=parse_access_hours(body.access_hours),
        permissions={
            "finance": normalize_finance_perms(body.finance_scope, body.finance_sheets, valid),
            **normalize_perms(body.sections, body.fields),
        },
    )
    session.add(member)
    await session.commit()
    return {"id": member.id, "ok": True}


@router.patch("/team/{member_id}")
async def update_member(
    member_id: int,
    body: dict,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    member = (
        await session.execute(
            select(User).where(User.id == member_id, User.workspace_id == user.workspace_id)
        )
    ).scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404)
    if member.role == "owner" and (body.get("role") or body.get("deleted")):
        raise HTTPException(status_code=403, detail="cannot modify owner")
    if isinstance(body.get("name"), str) and body["name"].strip():
        member.name = body["name"].strip()
    if isinstance(body.get("phone"), str):
        member.phone = body["phone"].strip() or None  # порожнє поле = прибрати номер
    if isinstance(body.get("username"), str) and body["username"].strip():
        new_username = body["username"].strip().lstrip("@")
        # зміна тега в активного = заміна людини: відвʼязуємо старий акаунт,
        # нова людина активується через /start у боті
        if new_username != (member.username or "") and member.status == "active" and member.role != "owner":
            member.telegram_id = None
            member.status = "invited"
        member.username = new_username
    if body.get("role") and body["role"] != member.role:
        await _check_member_role(session, user, body["role"])
        member.role = body["role"]
    if isinstance(body.get("permissions"), dict):
        member.permissions = body["permissions"]
    if body.get("employment") in ("permanent", "temporary"):
        became_temp = body["employment"] == "temporary" and member.employment != "temporary"
        member.employment = body["employment"]
        if became_temp and member.visible_from is None:
            member.visible_from = datetime.now(timezone.utc)
        if body["employment"] == "permanent":
            member.visible_from = None  # постійному відкривається лист цілком
    if "access_hours" in body:
        # 0 (або порожньо) — зняти строк; інакше відлік починається від зараз
        member.access_until = parse_access_hours(body["access_hours"])
    if "sections" in body or "fields" in body:
        perms = dict(member.permissions or {})
        perms.update(normalize_perms(body.get("sections"), body.get("fields")))
        member.permissions = perms
    if "finance_scope" in body or "finance_sheets" in body:
        valid = {s.id for s in await all_sheets(session, user.workspace_id)}
        perms = dict(member.permissions or {})
        perms["finance"] = normalize_finance_perms(
            body.get("finance_scope"), body.get("finance_sheets"), valid
        )
        member.permissions = perms
    if body.get("deleted"):
        await session.delete(member)
    await session.commit()
    return {"ok": True}
