"""Листи витрат, витрати й бюджет."""

from datetime import datetime, timezone


from fastapi import APIRouter, Depends, HTTPException, Query

from pydantic import BaseModel
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession



from ...models import BudgetItem, Expense, ExpenseSheet, User
from ...services.access import visible_since
from ...services.permissions import require_section, sees_amounts, sees_summary
from ...services.finance import (
    all_sheets,
    general_sheet_id,
    visible_sheet_ids,
)

from ...services.status import monthly_budget


from ..deps import get_current_user, get_session, require_owner




router = APIRouter()


# ---------- money: листи витрат ----------
# «Загальний бюджет» + окремі листи під зйомки. У кожного листа свої витрати
# і свій бюджет; людині можна відкрити всі листи або лише вибрані.

ALL_SHEETS = "all"


async def _resolve_sheet(
    session: AsyncSession, user: User, sheet: str | None
) -> tuple[list[int], int | None]:
    """(які листи показувати, обраний лист або None для «Усі разом»).
    Порожній `sheet` або «all» → усі доступні листи."""
    visible = await visible_sheet_ids(session, user)
    if not sheet or sheet == ALL_SHEETS:
        return visible, None
    try:
        sid = int(sheet)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="bad sheet")
    if sid not in visible:
        raise HTTPException(status_code=403, detail="Цей лист вам не відкритий")
    return [sid], sid


class SheetIn(BaseModel):
    name: str


@router.get("/finance/sheets")
async def finance_sheets(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> dict:
    require_section(user, "finance")
    visible = set(await visible_sheet_ids(session, user))
    rows = [s for s in await all_sheets(session, user.workspace_id) if s.id in visible]
    return {
        "sheets": [{"id": s.id, "name": s.name, "is_general": s.is_general} for s in rows],
        "can_manage": user.role == "owner",
    }


@router.post("/finance/sheets")
async def create_sheet(
    body: SheetIn,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Назва листа не може бути порожньою")
    rows = await all_sheets(session, user.workspace_id)
    if any(s.name.lower() == name.lower() for s in rows):
        raise HTTPException(status_code=409, detail="Лист із такою назвою вже є")
    sheet = ExpenseSheet(
        workspace_id=user.workspace_id,
        name=name,
        is_general=False,
        sort=max((s.sort for s in rows), default=0) + 10,
    )
    session.add(sheet)
    await session.commit()
    return {"id": sheet.id, "ok": True}


@router.patch("/finance/sheets/{sheet_id}")
async def rename_sheet(
    sheet_id: int,
    body: dict,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    sheet = (await session.execute(select(ExpenseSheet).where(
        ExpenseSheet.id == sheet_id, ExpenseSheet.workspace_id == user.workspace_id
    ))).scalar_one_or_none()
    if sheet is None:
        raise HTTPException(status_code=404)
    if isinstance(body.get("name"), str) and body["name"].strip():
        sheet.name = body["name"].strip()
    await session.commit()
    return {"ok": True}


@router.delete("/finance/sheets/{sheet_id}")
async def delete_sheet(
    sheet_id: int,
    move_to: str | None = Query(default=None),
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Видаляє лист. Якщо в ньому є витрати — просимо вказати, куди їх перенести."""
    sheet = (await session.execute(select(ExpenseSheet).where(
        ExpenseSheet.id == sheet_id, ExpenseSheet.workspace_id == user.workspace_id
    ))).scalar_one_or_none()
    if sheet is None:
        raise HTTPException(status_code=404)
    if sheet.is_general:
        raise HTTPException(
            status_code=409,
            detail="«Загальний бюджет» видалити не можна — саме туди йдуть витрати без листа",
        )
    count = (await session.execute(
        select(func.count()).select_from(Expense).where(
            Expense.sheet_id == sheet.id, Expense.deleted_at.is_(None)
        )
    )).scalar_one()
    others = [s.id for s in await all_sheets(session, user.workspace_id) if s.id != sheet.id]
    target = None
    if move_to is not None:
        try:
            target = int(move_to)
        except (TypeError, ValueError):
            target = None
    if count:
        if target not in others:
            raise HTTPException(status_code=409, detail=f"expenses_present:{count}")
        await session.execute(
            update(Expense).where(Expense.sheet_id == sheet.id).values(sheet_id=target)
        )
    # секції бюджету цього листа зникають разом із ним
    await session.execute(delete(BudgetItem).where(BudgetItem.sheet_id == sheet.id))
    await session.delete(sheet)
    await session.commit()
    return {"ok": True, "moved": count}


# ---------- money ----------

class ExpenseIn(BaseModel):
    text: str
    amount: float
    currency: str = "UAH"
    sheet_id: int | None = None


@router.get("/money")
async def money(
    sheet: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Витрати обраного листа (або всіх доступних, якщо лист не вказано)."""
    require_section(user, "finance")
    sheet_ids, selected = await _resolve_sheet(session, user, sheet)
    since = visible_since(user)  # тимчасовий бачить лише з дня, коли його додали

    base = [
        Expense.workspace_id == user.workspace_id,
        Expense.deleted_at.is_(None),
        Expense.sheet_id.in_(sheet_ids) if sheet_ids else Expense.id.is_(None),
    ]
    if since is not None:
        base.append(Expense.created_at >= since)

    q = select(Expense).where(*base).order_by(Expense.created_at.desc()).limit(50)
    if user.role != "owner" and not (user.permissions or {}).get("see_budget"):
        q = q.where(Expense.telegram_id == user.telegram_id)
    rows = (await session.execute(q)).scalars().all()

    # зведення (витрачено / бюджет / відсоток) — лише коли розділ відкритий повністю
    summary = sees_summary(user, "finance")
    amounts = sees_amounts(user)
    spent = budget = budget_pct = None
    if summary:
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        raw = (await session.execute(
            select(func.coalesce(func.sum(Expense.amount), 0.0)).where(
                *base, Expense.created_at >= month_start
            )
        )).scalar_one()
        budget = await monthly_budget(session, user.workspace_id, sheet_ids)
        spent = round(float(raw))
        budget_pct = round(raw / budget * 100) if budget else 0

    return {
        "sheet_id": selected,
        "summary": summary,
        "amounts": amounts,
        "spent": spent,
        "budget": budget,
        "budget_pct": budget_pct,
        "can_approve": user.role == "owner" or bool((user.permissions or {}).get("approve_expenses")),
        "expenses": [
            {
                "id": e.id,
                "sheet_id": e.sheet_id,
                "text": e.text,
                # суму ховаємо, якщо поле закрите: видно ЩО купили, але не за скільки
                "amount": e.amount if amounts else None,
                "currency": e.currency,
                "approved": e.approved,
                "approved_at": e.approved_at.isoformat() if e.approved_at else None,
                "comment": e.comment or "",
                "mine": e.telegram_id == user.telegram_id,
                "owner_role": e.owner_role,
                "time": e.created_at.isoformat() if e.created_at else None,
            }
            for e in rows
        ],
    }


@router.post("/money")
async def create_expense(
    body: ExpenseIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_section(user, "finance")
    visible = await visible_sheet_ids(session, user)
    sheet_id = body.sheet_id
    if sheet_id is None:  # лист не вказано — кладемо в «Загальний бюджет», якщо він відкритий
        general = await general_sheet_id(session, user.workspace_id)
        sheet_id = general if general in visible else (visible[0] if visible else None)
    if sheet_id is None:
        raise HTTPException(status_code=403, detail="Вам не відкрито жодного листа витрат")
    if sheet_id not in visible:
        raise HTTPException(status_code=403, detail="Цей лист вам не відкритий")
    e = Expense(
        workspace_id=user.workspace_id,
        sheet_id=sheet_id,
        telegram_id=user.telegram_id,
        text=body.text,
        amount=body.amount,
        currency=body.currency,
        owner_role=user.role,
    )
    session.add(e)
    await session.commit()
    return {"id": e.id, "ok": True}


@router.patch("/money/{expense_id}")
async def update_expense(
    expense_id: int,
    body: dict,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Коментар до витрати (хто підтверджує або автор) і зміна approved (передумав — зняв OK)."""
    e = (
        await session.execute(
            select(Expense).where(Expense.id == expense_id, Expense.workspace_id == user.workspace_id)
        )
    ).scalar_one_or_none()
    if e is None or e.deleted_at is not None:
        raise HTTPException(status_code=404)
    can_approve = user.role == "owner" or bool((user.permissions or {}).get("approve_expenses"))
    if "comment" in body:
        if not (can_approve or e.telegram_id == user.telegram_id):
            raise HTTPException(status_code=403, detail="comment not allowed")
        e.comment = str(body["comment"] or "").strip()
    if "amount" in body:
        if not (can_approve or e.telegram_id == user.telegram_id):
            raise HTTPException(status_code=403, detail="amount change not allowed")
        try:
            amount = float(body["amount"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="bad amount")
        if amount <= 0:
            raise HTTPException(status_code=400, detail="amount must be > 0")
        e.amount = amount
    if isinstance(body.get("approved"), bool):
        if not can_approve:
            raise HTTPException(status_code=403, detail="approve not allowed")
        e.approved = body["approved"]
        e.approver_id = user.telegram_id if body["approved"] else None
        e.approved_at = datetime.now(timezone.utc) if body["approved"] else None
    if body.get("deleted"):
        if not (can_approve or e.telegram_id == user.telegram_id):
            raise HTTPException(status_code=403, detail="delete not allowed")
        e.deleted_at = datetime.now(timezone.utc)
    await session.commit()
    return {"ok": True}


@router.post("/money/{expense_id}/approve")
async def approve_expense(
    expense_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if user.role != "owner" and not (user.permissions or {}).get("approve_expenses"):
        raise HTTPException(status_code=403)
    e = (
        await session.execute(
            select(Expense).where(Expense.id == expense_id, Expense.workspace_id == user.workspace_id)
        )
    ).scalar_one_or_none()
    if e is None:
        raise HTTPException(status_code=404)
    e.approved = True
    e.approver_id = user.telegram_id
    e.approved_at = datetime.now(timezone.utc)
    await session.commit()
    return {"ok": True}


# ---------- budget (owner) ----------
# Бюджет задається окремо для кожного листа витрат.


async def _budget_sheet(session: AsyncSession, user: User, sheet: str | None) -> int | None:
    """Лист, до якого стосується бюджет. Не вказано або «усі» → «Загальний бюджет»."""
    if sheet and sheet != ALL_SHEETS:
        _, selected = await _resolve_sheet(session, user, sheet)
        return selected
    return await general_sheet_id(session, user.workspace_id)


class BudgetItemIn(BaseModel):
    name: str
    amount: float


class BudgetIn(BaseModel):
    items: list[BudgetItemIn]


@router.get("/budget")
async def get_budget(
    sheet: str | None = Query(default=None),
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Секції бюджету одного листа. Без листа — «Загальний бюджет»."""
    sheet_id = await _budget_sheet(session, user, sheet)
    rows = (
        await session.execute(
            select(BudgetItem)
            .where(BudgetItem.workspace_id == user.workspace_id, BudgetItem.sheet_id == sheet_id)
            .order_by(BudgetItem.id.asc())
        )
    ).scalars().all()
    return {
        "sheet_id": sheet_id,
        "budget": await monthly_budget(session, user.workspace_id, [sheet_id]),
        "items": [{"id": b.id, "name": b.name, "amount": b.amount} for b in rows],
    }


@router.put("/budget")
async def set_budget(
    body: BudgetIn,
    sheet: str | None = Query(default=None),
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Повністю замінює секції бюджету одного листа. Порожній список → бюджет з .env."""
    sheet_id = await _budget_sheet(session, user, sheet)
    await session.execute(delete(BudgetItem).where(
        BudgetItem.workspace_id == user.workspace_id, BudgetItem.sheet_id == sheet_id
    ))
    for it in body.items:
        if it.name.strip() and it.amount > 0:
            session.add(BudgetItem(
                workspace_id=user.workspace_id, sheet_id=sheet_id,
                name=it.name.strip(), amount=it.amount,
            ))
    await session.commit()
    return {"ok": True, "budget": await monthly_budget(session, user.workspace_id, [sheet_id])}
