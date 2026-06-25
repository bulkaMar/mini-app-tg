"""Залежності FastAPI: сесія БД і current_user з перевіркою initData та ролі."""

from typing import AsyncIterator

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import SessionMaker
from ..models import User
from ..services.workspace import get_or_create_workspace
from .auth import InitDataError, validate_init_data

# фейкові telegram_id для дев-користувачів (owner мапиться на справжнього)
DEV_USERS = {
    "manager": (-2, "Марія К. (dev)"),
    "assistant": (-3, "Оля Л. (dev)"),
    "driver": (-4, "Віктор Д. (dev)"),
}


async def _get_dev_user(session, role: str) -> "User":
    primary = settings.primary_owner_id
    ws = await get_or_create_workspace(session, primary)  # усі дев-ролі в одному просторі
    if role == "owner":
        user = (
            await session.execute(select(User).where(User.telegram_id == primary))
        ).scalar_one_or_none()
        if user is None:
            user = User(workspace_id=ws.id, telegram_id=primary, name="Owner (dev)", role="owner")
            session.add(user)
            await session.commit()
        return user
    if role not in DEV_USERS:
        raise HTTPException(status_code=400, detail=f"unknown dev role: {role}")
    tg_id, name = DEV_USERS[role]
    user = (await session.execute(select(User).where(User.telegram_id == tg_id))).scalar_one_or_none()
    if user is None:
        user = User(workspace_id=ws.id, telegram_id=tg_id, name=name, role=role)
        session.add(user)
        await session.commit()
    return user

async def _provision_user(session, tg_id: int, tg_user: dict) -> "User | None":
    """Створює owner/allowed-користувача або активує інвайт за username.

    Дзеркало WhitelistMiddleware: дозволяє входити через Mini App без попереднього
    звернення до бота. Повертає None, якщо tg_id не у whitelist і немає інвайту.
    """
    username = tg_user.get("username")
    full_name = (
        " ".join(p for p in (tg_user.get("first_name"), tg_user.get("last_name")) if p)
        or username
        or ""
    )

    if settings.is_owner(tg_id):  # власник → свій ізольований простір
        ws = await get_or_create_workspace(session, tg_id)
        user = User(
            workspace_id=ws.id, telegram_id=tg_id, name=full_name,
            username=username, role="owner", status="active",
        )
        session.add(user)
        await session.commit()
        return user

    if tg_id in settings.allowed_user_ids:  # допущені — у простір першого власника
        primary = settings.primary_owner_id
        ws = await get_or_create_workspace(session, primary)
        user = User(
            workspace_id=ws.id, telegram_id=tg_id, name=full_name,
            username=username, role="assistant", status="active",
        )
        session.add(user)
        await session.commit()
        return user

    if username:  # запрошений власником член команди — активуємо за username
        invited = (
            await session.execute(
                select(User).where(User.username == username, User.status == "invited").limit(1)
            )
        ).scalars().first()
        if invited is not None:  # workspace_id успадковується з інвайту
            invited.telegram_id = tg_id
            invited.name = full_name
            invited.status = "active"
            await session.commit()
            return invited
    return None


# що бачить/вносить кожна роль (owner — все)
ROLE_CATEGORIES: dict[str, set[str]] = {
    "owner": {"production", "life", "dog", "finance", "logistics"},
    "manager": {"production", "finance"},
    "assistant": {"life", "dog", "finance"},
    "driver": {"logistics", "finance"},
}


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionMaker() as session:
        yield session


async def get_current_user(
    authorization: str | None = Header(default=None),
    x_telegram_init_data: str | None = Header(default=None),
    x_dev_role: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> User:
    init_data = x_telegram_init_data
    if not init_data and authorization and authorization.lower().startswith("tma "):
        init_data = authorization[4:]
    if not init_data:
        if settings.dev_auth:
            return await _get_dev_user(session, x_dev_role or "owner")
        raise HTTPException(status_code=401, detail="initData required")

    try:
        data = validate_init_data(init_data)
    except InitDataError as e:
        raise HTTPException(status_code=401, detail=f"invalid initData: {e}") from e

    tg_user = data.get("user") or {}
    tg_id = tg_user.get("id")
    if not tg_id:
        raise HTTPException(status_code=401, detail="no user in initData")

    user = (await session.execute(select(User).where(User.telegram_id == tg_id))).scalar_one_or_none()
    if user is None:  # перший вхід через Mini App — провіжнимо owner/allowed/інвайт
        user = await _provision_user(session, tg_id, tg_user)
    if user is None or user.status != "active":
        raise HTTPException(status_code=403, detail="not whitelisted")
    return user


def require_owner(user: User = Depends(get_current_user)) -> User:
    if user.role != "owner":
        raise HTTPException(status_code=403, detail="owner only")
    return user


def allowed_categories(user: User) -> set[str]:
    return ROLE_CATEGORIES.get(user.role, set())
