"""Whitelist: пускаємо тільки відомих користувачів, owner створюється автоматично."""

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject
from sqlalchemy import select

from ..config import settings
from ..db import SessionMaker
from ..models import User
from ..services.workspace import get_or_create_workspace


class WhitelistMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        tg_user = None
        if isinstance(event, (Message, CallbackQuery)):
            tg_user = event.from_user
        if tg_user is None:
            return await handler(event, data)

        async with SessionMaker() as session:
            user = (
                await session.execute(select(User).where(User.telegram_id == tg_user.id))
            ).scalar_one_or_none()

            if user is None:
                if settings.is_owner(tg_user.id):  # власник → свій ізольований простір
                    ws = await get_or_create_workspace(session, tg_user.id)
                    user = User(
                        workspace_id=ws.id, telegram_id=tg_user.id, name=tg_user.full_name,
                        username=tg_user.username, role="owner", status="active",
                    )
                    session.add(user)
                    await session.commit()
                elif tg_user.id in settings.allowed_user_ids:  # допущені — у простір першого власника
                    primary = settings.primary_owner_id
                    ws = await get_or_create_workspace(session, primary)
                    user = User(
                        workspace_id=ws.id, telegram_id=tg_user.id, name=tg_user.full_name,
                        username=tg_user.username, role="assistant", status="active",
                    )
                    session.add(user)
                    await session.commit()
                elif tg_user.username:  # запрошений за username — успадковує workspace інвайту
                    invited = (
                        await session.execute(
                            select(User).where(
                                User.username == tg_user.username, User.status == "invited"
                            ).limit(1)
                        )
                    ).scalars().first()
                    if invited is not None:
                        invited.telegram_id = tg_user.id
                        invited.name = tg_user.full_name
                        invited.status = "active"
                        await session.commit()
                        user = invited
                if user is None:
                    if isinstance(event, Message):
                        await event.answer("⛔ Немає доступу. Звернись до власника.")
                    return None

        data["db_user"] = user
        return await handler(event, data)
