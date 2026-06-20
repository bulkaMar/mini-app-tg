"""SSE-події: один спільний фоновий вотчер рахує легкий fingerprint БД і будить
усіх підписників, коли щось змінилось. Працює для змін із будь-якого джерела
(Mini App, бот) і на будь-якій БД (Postgres/SQLite), бо база спільна."""

import asyncio
import logging

from sqlalchemy import func, select

from ..db import SessionMaker
from ..models import BudgetItem, Expense, Message, Risk, Task, User

log = logging.getLogger(__name__)

WATCH_INTERVAL = 3  # сек між перевірками БД (один спільний цикл на весь процес)
_subscribers: set[asyncio.Queue] = set()


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=8)
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.discard(q)


def _broadcast(rev: str) -> None:
    for q in list(_subscribers):
        try:
            q.put_nowait(rev)
        except asyncio.QueueFull:
            pass  # клієнт відстає — байдуже, він однаково перезавантажить усе


async def _fingerprint(session) -> str:
    """Дешевий знімок стану: ловить додавання, статуси (done/resolved/approved),
    видалення, коментарі до витрат, бюджет і зміни команди."""

    async def scalar(stmt):
        return (await session.execute(stmt)).scalar() or 0

    parts = [
        await scalar(select(func.max(Message.id))),
        await scalar(select(func.count()).select_from(Message)),
        await scalar(select(func.max(Task.id))),
        await scalar(select(func.count()).select_from(Task)),
        await scalar(select(func.count()).select_from(Task).where(Task.status == "done")),
        await scalar(select(func.count()).select_from(Task).where(Task.deleted_at.is_not(None))),
        await scalar(select(func.max(Task.updated_at))),  # ловить правки тексту/дедлайну задачі
        await scalar(select(func.max(Expense.updated_at))),  # ловить правки суми/коментаря витрати
        await scalar(select(func.max(Risk.id))),
        await scalar(select(func.count()).select_from(Risk).where(Risk.resolved.is_(True))),
        await scalar(select(func.count()).select_from(Risk).where(Risk.deleted_at.is_not(None))),
        await scalar(select(func.max(Expense.id))),
        await scalar(select(func.count()).select_from(Expense).where(Expense.approved.is_(True))),
        await scalar(select(func.count()).select_from(Expense).where(Expense.deleted_at.is_not(None))),
        await scalar(select(func.coalesce(func.sum(func.length(Expense.comment)), 0))),
        await scalar(select(func.count()).select_from(BudgetItem)),
        await scalar(select(func.coalesce(func.sum(BudgetItem.amount), 0))),
        await scalar(select(func.count()).select_from(User)),
        await scalar(select(func.max(User.id))),
    ]
    return "-".join(str(p) for p in parts)


async def watch_changes() -> None:
    """Фонове завдання: порівнює fingerprint і будить підписників при зміні."""
    last = None
    while True:
        try:
            async with SessionMaker() as session:
                rev = await _fingerprint(session)
            if rev != last:
                last = rev
                _broadcast(rev)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # БД може тимчасово бути недоступна — не валимо цикл
            log.warning("watch_changes: %s", e)
        await asyncio.sleep(WATCH_INTERVAL)
