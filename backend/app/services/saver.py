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


# кому адресовано запис (для напрямку «хто → кому» у стрічці)
_CATEGORY_TO_ROLE = {"production": "manager", "life": "assistant", "dog": "assistant", "logistics": "driver"}


def resolve_target_role(sender_role: str, category: str | None, owner_hint: str | None = None) -> str | None:
    """Працівник пише → власнику; власник дає доручення → за явним адресатом або темою."""
    if sender_role != "owner":
        return "owner"
    if owner_hint == "me":
        return "owner"
    if owner_hint in ("manager", "assistant", "driver"):
        return owner_hint
    return _CATEGORY_TO_ROLE.get(category or "")


async def save_classified(
    session: AsyncSession,
    user: User,
    raw_text: str,
    c: Classification,
    audio_file_id: str | None = None,
) -> dict:
    """Пише сирий лог у messages і запис у відповідну таблицю. Повертає підсумок."""
    msg = Message(
        workspace_id=user.workspace_id,
        telegram_id=user.telegram_id,
        sender_role=user.role,
        raw_text=raw_text,
        clean_text=c.text,
        audio_file_id=audio_file_id,
        classified_type=c.type,
        category=c.category,
        target_role=resolve_target_role(user.role, c.category, getattr(c, "owner", None)),
    )
    session.add(msg)

    record_id = None
    if c.type == "risk":
        risk = Risk(
            workspace_id=user.workspace_id,
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
            workspace_id=user.workspace_id,
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
            workspace_id=user.workspace_id,
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


# ---------- збереження задач, які власниця роздає команді ----------
# Виконавець (assignee) визначає і роль, і категорію — щоб людина точно побачила задачу
# у своєму екрані (категорія = те, що дозволено цій ролі бачити).

ASSIGNEE_TO_ROLE = {"me": "owner", "manager": "manager", "assistant": "assistant", "driver": "driver"}
ASSIGNEE_TO_CATEGORY = {"manager": "production", "assistant": "life", "driver": "logistics"}


def resolve_assignee_category(assignee: str, suggested: str | None) -> str:
    """Категорія за виконавцем. Для власниці лишаємо підказану AI (вона бачить усе);
    для асистента поважаємо «dog»; для решти — жорстко за роллю."""
    if assignee == "me":
        return suggested if suggested in ("production", "life", "dog", "logistics") else "life"
    if assignee == "assistant":
        return "dog" if suggested == "dog" else "life"
    return ASSIGNEE_TO_CATEGORY.get(assignee, "life")


async def save_owner_task(
    session: AsyncSession,
    owner: User,
    text: str,
    assignee: str,
    suggested_category: str | None = None,
) -> dict:
    """Створює задачу, роздану власницею на конкретну роль (+ лог у messages для стрічки).
    Без commit — викликач комітить пачку разом."""
    role = ASSIGNEE_TO_ROLE.get(assignee, "owner")
    category = resolve_assignee_category(assignee, suggested_category)

    session.add(
        Message(
            workspace_id=owner.workspace_id,
            telegram_id=owner.telegram_id,
            sender_role=owner.role,
            raw_text=text,
            clean_text=text,
            classified_type="task",
            category=category,
            target_role=role,  # кому роздали (для напрямку у стрічці)
        )
    )
    task = Task(
        workspace_id=owner.workspace_id,
        telegram_id=owner.telegram_id,
        category=category,
        text=text,
        owner_role=role,
    )
    session.add(task)
    await session.flush()
    return {"id": task.id, "assignee": assignee, "category": category, "text": text}
