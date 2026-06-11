"""Whitelist: пускаємо тільки відомих користувачів, owner створюється автоматично."""

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject
from sqlalchemy import select

from ..config import settings
from ..db import SessionMaker
from ..models import User


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
                allowed = tg_user.id == settings.owner_telegram_id or tg_user.id in settings.allowed_user_ids
                if not allowed:
                    # шукаємо інвайт за username
                    if tg_user.username:
                        invited = (
                            await session.execute(
                                select(User).where(
                                    User.username == tg_user.username, User.status == "invited"
                                )
                            )
                        ).scalar_one_or_none()
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
                else:
                    user = User(
                        telegram_id=tg_user.id,
                        name=tg_user.full_name,
                        username=tg_user.username,
                        role="owner" if tg_user.id == settings.owner_telegram_id else "assistant",
                        status="active",
                    )
                    session.add(user)
                    await session.commit()

        data["db_user"] = user
        return await handler(event, data)
