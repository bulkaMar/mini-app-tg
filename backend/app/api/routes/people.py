"""Люди: записник контактів і картка людини (Етап 6).

Розділ «Люди» — це два різні списки в одному місці:

- **Команда** — ті, хто заходить у застосунок. Живуть у таблиці users, у них
  є роль, дозволи й строк доступу. Керує ними team.py.
- **Контакти** — записник: гример, оренда світла, водій крану. Доступу в
  застосунок вони не мають і мати не можуть — це просто ім'я й телефон.

Читати обидва списки може той, кому відкрито розділ «Люди»; змінювати —
лише власниця. Картка людини (6.3) показує, що людина зробила, тож її
бачить власниця, а сама людина — тільки свою.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...models import Contact, Expense, Message, Risk, Task, User
from ...services.access import access_expired
from ...services.permissions import fields_of, require_section, sees_amounts, sections_of
from ...services.roles import role_labels
from ...services.saver import due_out
from ..deps import get_current_user, get_session, require_owner
from .team import member_card

router = APIRouter()

HISTORY_LIMIT = 20  # скільки останніх дій показуємо в картці
TASKS_LIMIT = 20


# ---------- контакти (записник) ----------


class ContactIn(BaseModel):
    name: str
    title: str = ""      # чим займається
    phone: str = ""
    username: str = ""   # telegram, з @ або без
    note: str = ""


def _contact_out(c: Contact) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "title": c.title or "",
        "phone": c.phone,
        "username": c.username,
        "note": c.note or "",
        "time": c.created_at.isoformat() if c.created_at else None,
    }


@router.get("/contacts")
async def list_contacts(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> list[dict]:
    require_section(user, "team")
    rows = (
        await session.execute(
            select(Contact)
            .where(Contact.workspace_id == user.workspace_id, Contact.deleted_at.is_(None))
            .order_by(Contact.name.asc())
        )
    ).scalars().all()
    return [_contact_out(c) for c in rows]


@router.post("/contacts")
async def create_contact(
    body: ContactIn,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Без імені контакт не зберегти")
    contact = Contact(
        workspace_id=user.workspace_id,
        name=name,
        title=body.title.strip(),
        phone=body.phone.strip() or None,
        username=body.username.strip().lstrip("@") or None,
        note=body.note.strip(),
    )
    session.add(contact)
    await session.commit()
    return {"id": contact.id, "ok": True}


@router.patch("/contacts/{contact_id}")
async def update_contact(
    contact_id: int,
    body: dict,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    contact = (
        await session.execute(
            select(Contact).where(
                Contact.id == contact_id, Contact.workspace_id == user.workspace_id
            )
        )
    ).scalar_one_or_none()
    if contact is None or contact.deleted_at is not None:
        raise HTTPException(status_code=404)
    if isinstance(body.get("name"), str) and body["name"].strip():
        contact.name = body["name"].strip()
    if isinstance(body.get("title"), str):
        contact.title = body["title"].strip()
    if isinstance(body.get("phone"), str):
        contact.phone = body["phone"].strip() or None
    if isinstance(body.get("username"), str):
        contact.username = body["username"].strip().lstrip("@") or None
    if isinstance(body.get("note"), str):
        contact.note = body["note"].strip()
    if body.get("deleted"):
        # мʼяке видалення: запис лишається в базі, зі списку зникає
        contact.deleted_at = datetime.now(timezone.utc)
    await session.commit()
    return {"ok": True}


# ---------- картка людини (6.3) ----------


async def _history(session: AsyncSession, member: User) -> list[dict]:
    """Останні дії людини: виконані задачі, витрати, звіти й тривоги.

    Задачі шукаємо за роллю (кому доручено), решту — за telegram_id (хто вніс).
    Запрошений, який ще не заходив, telegram_id не має — тоді лишаються
    самі задачі, і це правильно: він справді ще нічого не вносив.
    """
    ws = member.workspace_id
    events: list[dict] = []

    done = (await session.execute(
        select(Task)
        .where(
            Task.workspace_id == ws, Task.deleted_at.is_(None),
            Task.owner_role == member.role, Task.status == "done",
        )
        .order_by(func.coalesce(Task.done_at, Task.created_at).desc())
        .limit(HISTORY_LIMIT)
    )).scalars().all()
    for t in done:
        events.append({
            "type": "task",
            "text": t.text,
            "time": (t.done_at or t.created_at).isoformat() if (t.done_at or t.created_at) else None,
        })

    if member.telegram_id:
        spent = (await session.execute(
            select(Expense)
            .where(
                Expense.workspace_id == ws, Expense.deleted_at.is_(None),
                Expense.telegram_id == member.telegram_id,
            )
            .order_by(Expense.created_at.desc())
            .limit(HISTORY_LIMIT)
        )).scalars().all()
        for e in spent:
            events.append({
                "type": "expense",
                "text": e.text or "Витрата",
                "amount": e.amount,
                "currency": e.currency,
                "time": e.created_at.isoformat() if e.created_at else None,
            })

        risks = (await session.execute(
            select(Risk)
            .where(
                Risk.workspace_id == ws, Risk.deleted_at.is_(None),
                Risk.telegram_id == member.telegram_id,
            )
            .order_by(Risk.created_at.desc())
            .limit(HISTORY_LIMIT)
        )).scalars().all()
        for r in risks:
            events.append({
                "type": "risk",
                "text": r.text,
                "time": r.created_at.isoformat() if r.created_at else None,
            })

        msgs = (await session.execute(
            select(Message)
            .where(Message.workspace_id == ws, Message.telegram_id == member.telegram_id)
            .order_by(Message.created_at.desc())
            .limit(HISTORY_LIMIT)
        )).scalars().all()
        for m in msgs:
            events.append({
                "type": "report",
                "text": m.clean_text or m.raw_text,
                "time": m.created_at.isoformat() if m.created_at else None,
            })

    events.sort(key=lambda e: e["time"] or "", reverse=True)
    return events[:HISTORY_LIMIT]


@router.get("/people/{member_id}")
async def person(
    member_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Картка людини: як зв'язатись, її задачі й історія роботи.

    Власниця відкриває будь-кого; решта — тільки себе. Інакше асистентка
    бачила б, що робив водій, а це вже не «список людей».
    """
    owner_view = getattr(user, "base_role", user.role) == "owner"
    if not owner_view and member_id != user.id:
        raise HTTPException(status_code=403, detail="Чужу картку відкрити не можна")
    member = (
        await session.execute(
            select(User).where(User.id == member_id, User.workspace_id == user.workspace_id)
        )
    ).scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404)

    labels = await role_labels(session, user.workspace_id)
    ws = user.workspace_id
    mine = (Task.workspace_id == ws, Task.deleted_at.is_(None), Task.owner_role == member.role)

    tasks = (await session.execute(
        select(Task).where(*mine, Task.status == "open")
        .order_by(Task.created_at.desc()).limit(TASKS_LIMIT)
    )).scalars().all()

    counts = dict(
        (
            await session.execute(
                select(Task.status, func.count()).where(*mine).group_by(Task.status)
            )
        ).all()
    )
    spent_q = select(func.count(), func.coalesce(func.sum(Expense.amount), 0)).where(
        Expense.workspace_id == ws,
        Expense.deleted_at.is_(None),
        Expense.telegram_id == member.telegram_id,
    )
    spent_n, spent_sum = (
        (await session.execute(spent_q)).one() if member.telegram_id else (0, 0)
    )

    card = member_card(member, labels)
    if owner_view:
        # ті самі поля, що в списку команди: з картки одразу відкривається
        # вікно налаштування доступу, і йому потрібні поточні значення
        card |= {
            "employment": member.employment or "permanent",
            "permissions": member.permissions or {},
            "sections": sections_of(member),
            "fields": fields_of(member),
            "visible_from": member.visible_from.isoformat() if member.visible_from else None,
            "access_until": member.access_until.isoformat() if member.access_until else None,
            "access_expired": access_expired(member),
        }
    return {
        **card,
        "since": member.created_at.isoformat() if member.created_at else None,
        "stats": {
            "open": counts.get("open", 0),
            "done": counts.get("done", 0),
            "expenses": spent_n,
            # суму ховаємо тому, кому вимкнено поле «Суми» (0.6)
            "spent": float(spent_sum) if sees_amounts(user) else None,
        },
        "tasks": [
            {
                "id": t.id,
                "text": t.text,
                "category": t.category,
                "status": t.status,
                "priority": t.priority or "normal",
                "due": due_out(t),
                "items_total": 0,  # у картці показуємо рядки без пунктів
                "items_done": 0,
            }
            for t in tasks
        ],
        "history": await _history(session, member),
    }
