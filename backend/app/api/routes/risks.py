"""Тривоги."""




from fastapi import APIRouter, Depends, HTTPException


from sqlalchemy import select, true as True_
from sqlalchemy.ext.asyncio import AsyncSession



from ...models import Risk, User
from ...services.access import visible_since




from ..deps import get_current_user, get_session




router = APIRouter()


# ---------- risks ----------

@router.get("/risks")
async def list_risks(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> list[dict]:
    since = visible_since(user)  # тимчасовому старий архів закритий
    rows = (
        await session.execute(
            select(Risk)
            .where(
                Risk.workspace_id == user.workspace_id,
                Risk.deleted_at.is_(None),
                Risk.created_at >= since if since is not None else True_(),
            )
            .order_by(Risk.resolved.asc(), Risk.created_at.desc())
            .limit(50)
        )
    ).scalars().all()
    if user.role not in ("owner", "manager"):
        rows = [r for r in rows if r.telegram_id == user.telegram_id]
    return [
        {
            "id": r.id,
            "text": r.text,
            "level": r.level,
            "resolved": r.resolved,
            "keyword_hit": r.keyword_hit,
            "owner_role": r.owner_role,
            "time": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/risks/{risk_id}/resolve")
async def resolve_risk(
    risk_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if user.role not in ("owner", "manager"):
        raise HTTPException(status_code=403)
    risk = (
        await session.execute(
            select(Risk).where(Risk.id == risk_id, Risk.workspace_id == user.workspace_id)
        )
    ).scalar_one_or_none()
    if risk is None:
        raise HTTPException(status_code=404)
    risk.resolved = True
    await session.commit()
    return {"ok": True}
