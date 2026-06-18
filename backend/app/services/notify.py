"""Пуші в Telegram: маршрутизація сповіщень між учасниками. Працює і з бота, і з API.

Логіка «вгору/вниз»:
- працівник щось надіслав  → пуш власнику («Менеджер: …»);
- власник дав доручення     → пуш виконавцю за темою («Власник: …»);
- тривога                    → власнику з 🚨.
Бот може писати лише тим, хто вже натиснув /start (інакше Telegram блокує) —
тому шлемо тільки активним користувачам із таблиці users.
"""

import logging

from aiogram import Bot
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import User
from .status import ROLE_LABELS

log = logging.getLogger(__name__)

# тема запису → кому це адресовано, коли доручення дає власник
CATEGORY_TO_ROLE = {
    "production": "manager",
    "life": "assistant",
    "dog": "assistant",
    "logistics": "driver",
}


async def notify_owner(text: str) -> None:
    """Прямий пуш власнику (лишаємо для простих службових повідомлень)."""
    if not settings.bot_token or not settings.owner_telegram_id:
        return
    try:
        async with Bot(token=settings.bot_token) as bot:
            await bot.send_message(settings.owner_telegram_id, text)
    except Exception:
        log.exception("Failed to push owner")


async def _active_ids_by_role(session: AsyncSession, role: str) -> list[int]:
    rows = (
        await session.execute(
            select(User.telegram_id).where(
                User.role == role, User.status == "active", User.telegram_id.is_not(None)
            )
        )
    ).scalars().all()
    return [r for r in rows if r]


def _target_roles(category: str | None, owner: str | None) -> set[str]:
    """Кому адресоване доручення власника: спершу явний owner, інакше — за темою."""
    if owner in ("manager", "assistant", "driver"):
        return {owner}
    role = CATEGORY_TO_ROLE.get(category or "")
    return {role} if role else set()


async def route_notifications(session: AsyncSession, sender: User, c) -> None:
    """Розсилає Telegram-пуш за результатом класифікації запису `c` від `sender`."""
    if not settings.bot_token:
        return

    sender_label = ROLE_LABELS.get(sender.role, sender.role).capitalize()
    prefix = "🚨 " if c.type == "risk" else ""
    body = f"{prefix}{sender_label}: {c.text}"

    recipients: set[int] = set()
    if sender.role == "owner":
        # доручення вниз — конкретному виконавцю за темою / явним адресатом
        for role in _target_roles(c.category, getattr(c, "owner", None)):
            recipients.update(await _active_ids_by_role(session, role))
    else:
        # звіт/інфо/тривога вгору — власнику
        if settings.owner_telegram_id:
            recipients.add(settings.owner_telegram_id)

    if sender.telegram_id:
        recipients.discard(sender.telegram_id)  # не шлемо самому собі
    if not recipients:
        return

    try:
        async with Bot(token=settings.bot_token) as bot:
            for uid in recipients:
                try:
                    await bot.send_message(uid, body)
                except Exception:
                    log.exception("push failed for %s", uid)
    except Exception:
        log.exception("route_notifications: bot init failed")
