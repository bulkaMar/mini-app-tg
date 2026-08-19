"""Вхід, панель і стрічка."""

import asyncio



from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


from ...config import settings
from ...models import Message, User, Workspace
from ...services.dictionaries import (
    usable_categories,
    visible_categories,
)
from ...services.access import visible_since
from ...services.permissions import (
    fields_of,
    require_section,
    sections_of,
)

from ...services.roles import (
    role_labels,
)
from ...services.saver import (
    resolve_target_role,
)
from ...services.status import compute_dashboard

from ..auth import InitDataError, validate_init_data
from ..deps import allowed_categories, get_current_user, get_session, require_owner
from ..events import subscribe, unsubscribe



router = APIRouter()


async def _events_workspace_id(auth: str | None) -> int | None:
    """Визначає workspace для SSE-підписки за initData (або дев-простір)."""
    from ...db import SessionMaker

    async with SessionMaker() as session:
        if auth:
            try:
                data = validate_init_data(auth)
            except InitDataError:
                raise HTTPException(status_code=401, detail="invalid initData")
            tg_id = (data.get("user") or {}).get("id")
            user = (
                await session.execute(select(User).where(User.telegram_id == tg_id))
            ).scalar_one_or_none() if tg_id else None
            return user.workspace_id if user else None
        if settings.dev_auth:
            ws = (
                await session.execute(
                    select(Workspace).where(Workspace.owner_telegram_id == settings.primary_owner_id)
                )
            ).scalar_one_or_none()
            return ws.id if ws else None
        raise HTTPException(status_code=401, detail="initData required")


@router.get("/events")
async def events(request: Request, auth: str | None = Query(default=None)):
    """SSE-стрім: пушить подію `change`, коли в просторі користувача щось змінилось.
    EventSource не вміє слати кастомні заголовки → initData приходить у query."""
    ws_id = await _events_workspace_id(auth)
    queue = subscribe(ws_id)

    async def gen():
        try:
            yield "event: ready\ndata: 1\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    rev = await asyncio.wait_for(queue.get(), timeout=20)
                    yield f"event: change\ndata: {rev}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"  # heartbeat, щоб проксі не рвало зʼєднання
        finally:
            unsubscribe(queue)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # вимкнути буферизацію на проксі (Railway/nginx)
        },
    )


# ---------- me / dashboard ----------

@router.get("/me")
async def me(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> dict:
    return {
        "id": user.id,  # щоб розділ «Люди» впізнав власну картку
        "telegram_id": user.telegram_id,
        "name": user.name,
        "username": user.username,
        "role": user.role,
        "role_label": (await role_labels(session, user.workspace_id)).get(user.role, user.role),
        # яким екраном користуватись, поки немає тумблерів розділів (0.5–0.7)
        "base": getattr(user, "base_role", user.role),
        "permissions": user.permissions or {},
        # що людині відкрито — з цього фронт будує вкладки й ховає суми
        "sections": sections_of(user),
        "fields": fields_of(user),
        # у які розділи ця людина може класти задачі — з цього фронт будує вибір
        "task_categories": await usable_categories(session, user),
    }


@router.get("/dashboard")
async def dashboard(
    user: User = Depends(require_owner), session: AsyncSession = Depends(get_session)
) -> dict:
    return await compute_dashboard(session, user.workspace_id)


@router.get("/feed")
async def feed(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> list[dict]:
    """Стрічка повідомлень: owner — усі, інші — тільки свої категорії."""
    require_section(user, "feed")
    where = [Message.workspace_id == user.workspace_id]
    since = visible_since(user)  # тимчасовому старий архів закритий
    if since is not None:
        where.append(Message.created_at >= since)
    q = (
        select(Message)
        .where(*where)
        .order_by(Message.created_at.desc())
        .limit(30)
    )
    if user.role != "owner":
        # базові теми ролі (зокрема finance) + розділи задач, які їй видно
        cats = allowed_categories(user) | await visible_categories(session, user)
        q = q.where(Message.category.in_(cats))
    rows = (await session.execute(q)).scalars().all()
    labels = await role_labels(session, user.workspace_id)
    return [
        {
            "id": m.id,
            "role": m.sender_role,
            "role_label": labels.get(m.sender_role, m.sender_role),
            "target_role": m.target_role or resolve_target_role(m.sender_role, m.category),
            "type": m.classified_type,
            "category": m.category,
            "text": m.clean_text or m.raw_text,
            "time": m.created_at.isoformat() if m.created_at else None,
        }
        for m in rows
    ]
