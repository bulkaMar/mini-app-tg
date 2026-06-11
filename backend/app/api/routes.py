from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..classifier import classify
from ..config import settings
from ..models import Expense, Message, Risk, Task, User
from ..services.notify import notify_owner
from ..services.saver import parse_due, save_classified
from ..services.status import ROLE_LABELS, compute_dashboard
from ..services.transcribe import transcribe
from .deps import allowed_categories, get_current_user, get_session, require_owner

router = APIRouter(prefix="/api")


# ---------- me / dashboard ----------

@router.get("/me")
async def me(user: User = Depends(get_current_user)) -> dict:
    return {
        "telegram_id": user.telegram_id,
        "name": user.name,
        "username": user.username,
        "role": user.role,
        "role_label": ROLE_LABELS.get(user.role, user.role),
        "permissions": user.permissions or {},
    }


@router.get("/dashboard")
async def dashboard(
    user: User = Depends(require_owner), session: AsyncSession = Depends(get_session)
) -> dict:
    return await compute_dashboard(session)


@router.get("/feed")
async def feed(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> list[dict]:
    """Стрічка повідомлень: owner — усі, інші — тільки свої категорії."""
    q = select(Message).order_by(Message.created_at.desc()).limit(30)
    if user.role != "owner":
        q = q.where(Message.category.in_(allowed_categories(user)))
    rows = (await session.execute(q)).scalars().all()
    return [
        {
            "id": m.id,
            "role": m.sender_role,
            "role_label": ROLE_LABELS.get(m.sender_role, m.sender_role),
            "type": m.classified_type,
            "category": m.category,
            "text": m.clean_text or m.raw_text,
            "time": m.created_at.isoformat() if m.created_at else None,
        }
        for m in rows
    ]


# ---------- tasks ----------

class TaskIn(BaseModel):
    category: str
    text: str
    due: str | None = None


@router.get("/tasks")
async def list_tasks(
    category: str | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    cats = allowed_categories(user)
    if category:
        if category not in cats:
            raise HTTPException(status_code=403, detail="category not allowed for your role")
        cats = {category}
    q = (
        select(Task)
        .where(Task.deleted_at.is_(None), Task.category.in_(cats))
        .order_by(Task.status.asc(), Task.created_at.desc())
        .limit(100)
    )
    rows = (await session.execute(q)).scalars().all()
    return [
        {
            "id": t.id,
            "category": t.category,
            "text": t.text,
            "status": t.status,
            "owner_role": t.owner_role,
            "due": t.due.isoformat() if t.due else None,
            "time": t.created_at.isoformat() if t.created_at else None,
        }
        for t in rows
    ]


@router.post("/tasks")
async def create_task(
    body: TaskIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if body.category not in allowed_categories(user):
        raise HTTPException(status_code=403, detail="category not allowed for your role")
    task = Task(
        telegram_id=user.telegram_id,
        category=body.category,
        text=body.text,
        owner_role=user.role,
        due=parse_due(body.due),
    )
    session.add(task)
    await session.commit()
    return {"id": task.id, "ok": True}


@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: int,
    body: dict,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    task = (await session.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None or task.deleted_at is not None:
        raise HTTPException(status_code=404)
    if user.role != "owner" and task.category not in allowed_categories(user):
        raise HTTPException(status_code=403)
    if body.get("status") in ("open", "done"):
        task.status = body["status"]
    if body.get("deleted"):
        task.deleted_at = datetime.now(timezone.utc)
    await session.commit()
    return {"ok": True}


# ---------- risks ----------

@router.get("/risks")
async def list_risks(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> list[dict]:
    rows = (
        await session.execute(
            select(Risk).where(Risk.deleted_at.is_(None)).order_by(Risk.resolved.asc(), Risk.created_at.desc()).limit(50)
        )
    ).scalars().all()
    if user.role not in ("owner", "manager"):
        rows = [r for r in rows if r.telegram_id == user.telegram_id]
    return [
        {
            "id": r.id,
            "text": r.text,
            "level": r.level,
            "resolved": r.resolved,
            "keyword_hit": r.keyword_hit,
            "owner_role": r.owner_role,
            "time": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/risks/{risk_id}/resolve")
async def resolve_risk(
    risk_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if user.role not in ("owner", "manager"):
        raise HTTPException(status_code=403)
    risk = (await session.execute(select(Risk).where(Risk.id == risk_id))).scalar_one_or_none()
    if risk is None:
        raise HTTPException(status_code=404)
    risk.resolved = True
    await session.commit()
    return {"ok": True}


# ---------- money ----------

class ExpenseIn(BaseModel):
    text: str
    amount: float
    currency: str = "UAH"


@router.get("/money")
async def money(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> dict:
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    q = select(Expense).where(Expense.deleted_at.is_(None)).order_by(Expense.created_at.desc()).limit(50)
    if user.role != "owner" and not (user.permissions or {}).get("see_budget"):
        q = q.where(Expense.telegram_id == user.telegram_id)
    rows = (await session.execute(q)).scalars().all()

    spent = (
        await session.execute(
            select(func.coalesce(func.sum(Expense.amount), 0.0)).where(
                Expense.deleted_at.is_(None), Expense.created_at >= month_start
            )
        )
    ).scalar_one()
    budget_pct = round(spent / settings.monthly_budget * 100) if settings.monthly_budget else 0

    return {
        "spent": round(float(spent)),
        "budget": settings.monthly_budget,
        "budget_pct": budget_pct,
        "can_approve": user.role == "owner" or bool((user.permissions or {}).get("approve_expenses")),
        "expenses": [
            {
                "id": e.id,
                "text": e.text,
                "amount": e.amount,
                "currency": e.currency,
                "approved": e.approved,
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
    e = Expense(
        telegram_id=user.telegram_id,
        text=body.text,
        amount=body.amount,
        currency=body.currency,
        owner_role=user.role,
    )
    session.add(e)
    await session.commit()
    return {"id": e.id, "ok": True}


@router.post("/money/{expense_id}/approve")
async def approve_expense(
    expense_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if user.role != "owner" and not (user.permissions or {}).get("approve_expenses"):
        raise HTTPException(status_code=403)
    e = (await session.execute(select(Expense).where(Expense.id == expense_id))).scalar_one_or_none()
    if e is None:
        raise HTTPException(status_code=404)
    e.approved = True
    e.approver_id = user.telegram_id
    await session.commit()
    return {"ok": True}


# ---------- team (owner) ----------

class MemberIn(BaseModel):
    username: str
    name: str = ""
    role: str = "assistant"


@router.get("/team")
async def team(
    user: User = Depends(require_owner), session: AsyncSession = Depends(get_session)
) -> list[dict]:
    rows = (await session.execute(select(User).order_by(User.created_at.asc()))).scalars().all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "username": u.username,
            "role": u.role,
            "role_label": ROLE_LABELS.get(u.role, u.role),
            "status": u.status,
            "permissions": u.permissions or {},
        }
        for u in rows
    ]


@router.post("/team")
async def invite_member(
    body: MemberIn,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if body.role not in ("manager", "assistant", "driver"):
        raise HTTPException(status_code=400, detail="bad role")
    username = body.username.lstrip("@")
    member = User(username=username, name=body.name or username, role=body.role, status="invited")
    session.add(member)
    await session.commit()
    return {"id": member.id, "ok": True}


@router.patch("/team/{member_id}")
async def update_member(
    member_id: int,
    body: dict,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    member = (await session.execute(select(User).where(User.id == member_id))).scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404)
    if body.get("role") in ("manager", "assistant", "driver"):
        member.role = body["role"]
    if isinstance(body.get("permissions"), dict):
        member.permissions = body["permissions"]
    await session.commit()
    return {"ok": True}


# ---------- ingest (диктування з Mini App) ----------

class IngestIn(BaseModel):
    text: str


@router.post("/ingest")
async def ingest_text(
    body: IngestIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    c = await classify(body.text, user.role)
    result = await save_classified(session, user, body.text, c)
    if c.type == "risk" and user.telegram_id != settings.owner_telegram_id:
        await notify_owner(
            f"🚨 Тривога ({(c.risk_level or 'med').upper()}) від "
            f"{ROLE_LABELS.get(user.role, user.role)} ({user.name}):\n{c.text}"
        )
    return result


@router.post("/ingest/voice")
async def ingest_voice(
    file: UploadFile,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    audio = await file.read()
    text = await transcribe(audio, filename=file.filename or "voice.webm")
    if not text:
        raise HTTPException(status_code=422, detail="transcription failed")
    c = await classify(text, user.role)
    result = await save_classified(session, user, text, c)
    if c.type == "risk" and user.telegram_id != settings.owner_telegram_id:
        await notify_owner(
            f"🚨 Тривога ({(c.risk_level or 'med').upper()}) від "
            f"{ROLE_LABELS.get(user.role, user.role)} ({user.name}):\n{c.text}"
        )
    result["transcript"] = text
    return result
