"""Пуші в Telegram: маршрутизація сповіщень між учасниками. Працює і з бота, і з API.

Логіка «вгору/вниз» (у межах одного workspace):
- працівник щось надіслав  → пуш власнику цього простору («Менеджер: …»);
- власник дав доручення     → пуш виконавцю за темою («Власник: …»);
- тривога                    → власнику з 🚨.
Бот може писати лише тим, хто вже натиснув /start (інакше Telegram блокує) —
тому шлемо тільки активним користувачам із таблиці users (того ж простору).
"""

import logging

from aiogram import Bot
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import User, Workspace
from .status import ROLE_LABELS

log = logging.getLogger(__name__)

# тема запису → кому це адресовано, коли доручення дає власник
CATEGORY_TO_ROLE = {
    "production": "manager",
    "life": "assistant",
    "dog": "assistant",
    "logistics": "driver",
}


async def notify_owner(text: str, to_id: int | None = None) -> None:
    """Прямий пуш власнику. to_id — конкретний власник простору; якщо не задано,
    шлемо першому власнику з env (службові повідомлення / сумісність)."""
    target = to_id or settings.owner_telegram_id
    if not settings.bot_token or not target:
        return
    try:
        async with Bot(token=settings.bot_token) as bot:
            await bot.send_message(target, text)
    except Exception:
        log.exception("Failed to push owner")


async def _workspace_owner_id(session: AsyncSession, workspace_id: int | None) -> int | None:
    if workspace_id is None:
        return None
    return (
        await session.execute(
            select(Workspace.owner_telegram_id).where(Workspace.id == workspace_id)
        )
    ).scalar_one_or_none()


async def _active_ids_by_role(session: AsyncSession, role: str, workspace_id: int | None) -> list[int]:
    rows = (
        await session.execute(
            select(User.telegram_id).where(
                User.workspace_id == workspace_id,
                User.role == role,
                User.status == "active",
                User.telegram_id.is_not(None),
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
    """Розсилає Telegram-пуш за результатом класифікації запису `c` від `sender`.
    Усі адресати — у межах простору відправника (sender.workspace_id)."""
    if not settings.bot_token:
        return

    ws_id = sender.workspace_id
    sender_label = ROLE_LABELS.get(sender.role, sender.role).capitalize()
    prefix = "🚨 " if c.type == "risk" else ""
    body = f"{prefix}{sender_label}: {c.text}"

    recipients: set[int] = set()
    if sender.role == "owner":
        # доручення вниз — конкретному виконавцю свого простору за темою / явним адресатом
        for role in _target_roles(c.category, getattr(c, "owner", None)):
            recipients.update(await _active_ids_by_role(session, role, ws_id))
    else:
        # звіт/інфо/тривога вгору — власнику цього простору
        owner_id = await _workspace_owner_id(session, ws_id)
        if owner_id:
            recipients.add(owner_id)

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
