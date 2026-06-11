"""Спільне збереження класифікованого запису — використовують і бот, і API."""

from datetime import date as date_type, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from ..classifier import Classification
from ..models import Expense, Message, Risk, Task, User


def parse_due(due: str | None) -> date_type | None:
    if not due:
        return None
    try:
        return datetime.strptime(due[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


async def save_classified(
    session: AsyncSession,
    user: User,
    raw_text: str,
    c: Classification,
    audio_file_id: str | None = None,
) -> dict:
    """Пише сирий лог у messages і запис у відповідну таблицю. Повертає підсумок."""
    msg = Message(
        telegram_id=user.telegram_id,
        sender_role=user.role,
        raw_text=raw_text,
        clean_text=c.text,
        audio_file_id=audio_file_id,
        classified_type=c.type,
        category=c.category,
    )
    session.add(msg)

    record_id = None
    if c.type == "risk":
        risk = Risk(
            telegram_id=user.telegram_id,
            text=c.text,
            level=c.risk_level or "med",
            owner_role=user.role,
            keyword_hit=c.keyword_hit,
        )
        session.add(risk)
        await session.flush()
        record_id = risk.id
    elif c.type == "money":
        expense = Expense(
            telegram_id=user.telegram_id,
            category="finance",
            text=c.text,
            amount=c.amount or 0,
            currency=c.currency or "UAH",
            owner_role=user.role,
        )
        session.add(expense)
        await session.flush()
        record_id = expense.id
    elif c.type == "task":
        task = Task(
            telegram_id=user.telegram_id,
            category=c.category if c.category != "finance" else "life",
            text=c.text,
            owner_role=user.role,
            due=parse_due(c.due),
        )
        session.add(task)
        await session.flush()
        record_id = task.id
    # type == "status" — лишається тільки в messages (стрічка/звіти)

    await session.commit()
    return {"type": c.type, "category": c.category, "text": c.text, "record_id": record_id}
