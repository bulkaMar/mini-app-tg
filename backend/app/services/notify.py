"""Миттєвий пуш owner (тривоги). Працює і з бота, і з API."""

import logging

from aiogram import Bot

from ..config import settings

log = logging.getLogger(__name__)


async def notify_owner(text: str) -> None:
    if not settings.bot_token or not settings.owner_telegram_id:
        return
    try:
        async with Bot(token=settings.bot_token) as bot:
            await bot.send_message(settings.owner_telegram_id, text)
    except Exception:
        log.exception("Failed to push owner")
