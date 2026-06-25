"""SSE-події: спільний фоновий вотчер рахує fingerprint БД ПО КОЖНОМУ workspace
і будить лише тих підписників, чий простір змінився. Ловить додавання, статуси,
видалення, правки (updated_at), коментарі, бюджет і команду. Працює для змін із
будь-якого джерела (Mini App, бот) і на будь-якій БД (Postgres/SQLite)."""

import asyncio
import logging

from sqlalchemy import case, func, select

from ..db import SessionMaker
from ..models import BudgetItem, Expense, Message, Risk, Task, User

log = logging.getLogger(__name__)

WATCH_INTERVAL = 3  # сек між перевірками БД (один спільний цикл на весь процес)
_subscribers: dict[asyncio.Queue, int | None] = {}  # черга → workspace_id


def subscribe(workspace_id: int | None) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=8)
    _subscribers[q] = workspace_id
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.pop(q, None)


def _broadcast(workspace_id: int | None, rev: str) -> None:
    for q, ws in list(_subscribers.items()):
        if ws == workspace_id:
            try:
                q.put_nowait(rev)
            except asyncio.QueueFull:
                pass  # клієнт відстає — байдуже, він однаково перезавантажить усе


async def _fingerprints(session) -> dict[int | None, str]:
    """Відбиток стану кожного простору. Повертає {workspace_id: рядок-відбиток}."""
    acc: dict[int | None, list[str]] = {}

    def merge(rows):
        for row in rows:
            acc.setdefault(row[0], []).extend(str(x if x is not None else 0) for x in row[1:])

    merge((await session.execute(
        select(Message.workspace_id, func.max(Message.id), func.count()).group_by(Message.workspace_id)
    )).all())
    merge((await session.execute(
        select(
            Task.workspace_id, func.max(Task.id), func.count(),
            func.sum(case((Task.status == "done", 1), else_=0)),
            func.sum(case((Task.deleted_at.is_not(None), 1), else_=0)),
            func.max(Task.updated_at),  # ловить правки тексту/дедлайну задачі
        ).group_by(Task.workspace_id)
    )).all())
    merge((await session.execute(
        select(
            Risk.workspace_id, func.max(Risk.id), func.count(),
            func.sum(case((Risk.resolved.is_(True), 1), else_=0)),
            func.sum(case((Risk.deleted_at.is_not(None), 1), else_=0)),
        ).group_by(Risk.workspace_id)
    )).all())
    merge((await session.execute(
        select(
            Expense.workspace_id, func.max(Expense.id), func.count(),
            func.sum(case((Expense.approved.is_(True), 1), else_=0)),
            func.sum(case((Expense.deleted_at.is_not(None), 1), else_=0)),
            func.max(Expense.updated_at),  # ловить правки суми/коментаря витрати
            func.coalesce(func.sum(func.length(Expense.comment)), 0),
        ).group_by(Expense.workspace_id)
    )).all())
    merge((await session.execute(
        select(BudgetItem.workspace_id, func.count(), func.coalesce(func.sum(BudgetItem.amount), 0))
        .group_by(BudgetItem.workspace_id)
    )).all())
    merge((await session.execute(
        select(User.workspace_id, func.count(), func.max(User.id)).group_by(User.workspace_id)
    )).all())

    return {ws: "-".join(parts) for ws, parts in acc.items()}


async def watch_changes() -> None:
    """Фонове завдання: порівнює fingerprint по кожному простору й будить підписників."""
    last: dict[int | None, str] = {}
    while True:
        try:
            async with SessionMaker() as session:
                cur = await _fingerprints(session)
            for ws in set(cur) | set(last):
                if cur.get(ws) != last.get(ws):
                    _broadcast(ws, cur.get(ws, ""))
            last = cur
        except asyncio.CancelledError:
            raise
        except Exception as e:  # БД може тимчасово бути недоступна — не валимо цикл
            log.warning("watch_changes: %s", e)
        await asyncio.sleep(WATCH_INTERVAL)
