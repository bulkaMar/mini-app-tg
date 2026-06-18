import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..classifier import Classification, classify, plan_tasks
from ..config import settings
from ..models import BudgetItem, Expense, Message, Risk, Task, User
from ..services.notify import route_notifications
from ..services.saver import parse_due, resolve_target_role, save_classified, save_owner_task
from ..services.status import ROLE_LABELS, compute_dashboard, monthly_budget
from ..services.transcribe import transcribe
from .auth import InitDataError, validate_init_data
from .deps import allowed_categories, get_current_user, get_session, require_owner
from .events import subscribe, unsubscribe

router = APIRouter(prefix="/api")


@router.get("/events")
async def events(request: Request, auth: str | None = Query(default=None)):
    """SSE-стрім: пушить подію `change`, коли в БД щось змінилось.
    EventSource не вміє слати кастомні заголовки → initData приходить у query."""
    if auth:
        try:
            validate_init_data(auth)
        except InitDataError:
            raise HTTPException(status_code=401, detail="invalid initData")
    elif not settings.dev_auth:
        raise HTTPException(status_code=401, detail="initData required")

    queue = subscribe()

    async def gen():
        try:
            yield "event: ready\ndata: 1\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    rev = await asyncio.wait_for(queue.get(), timeout=20)
                    yield f"event: change\ndata: {rev}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"  # heartbeat, щоб проксі не рвало зʼєднання
        finally:
            unsubscribe(queue)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # вимкнути буферизацію на проксі (Railway/nginx)
        },
    )


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
            "target_role": m.target_role or resolve_target_role(m.sender_role, m.category),
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
    if isinstance(body.get("text"), str) and body["text"].strip():
        task.text = body["text"].strip()
    if "due" in body:
        task.due = parse_due(body["due"])
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
    budget = await monthly_budget(session)
    budget_pct = round(spent / budget * 100) if budget else 0

    return {
        "spent": round(float(spent)),
        "budget": budget,
        "budget_pct": budget_pct,
        "can_approve": user.role == "owner" or bool((user.permissions or {}).get("approve_expenses")),
        "expenses": [
            {
                "id": e.id,
                "text": e.text,
                "amount": e.amount,
                "currency": e.currency,
                "approved": e.approved,
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


@router.patch("/money/{expense_id}")
async def update_expense(
    expense_id: int,
    body: dict,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Коментар до витрати (хто підтверджує або автор) і зміна approved (передумав — зняв OK)."""
    e = (await session.execute(select(Expense).where(Expense.id == expense_id))).scalar_one_or_none()
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
    e = (await session.execute(select(Expense).where(Expense.id == expense_id))).scalar_one_or_none()
    if e is None:
        raise HTTPException(status_code=404)
    e.approved = True
    e.approver_id = user.telegram_id
    await session.commit()
    return {"ok": True}


# ---------- budget (owner) ----------

class BudgetItemIn(BaseModel):
    name: str
    amount: float


class BudgetIn(BaseModel):
    items: list[BudgetItemIn]


@router.get("/budget")
async def get_budget(
    user: User = Depends(require_owner), session: AsyncSession = Depends(get_session)
) -> dict:
    rows = (await session.execute(select(BudgetItem).order_by(BudgetItem.id.asc()))).scalars().all()
    return {
        "budget": await monthly_budget(session),
        "items": [{"id": b.id, "name": b.name, "amount": b.amount} for b in rows],
    }


@router.put("/budget")
async def set_budget(
    body: BudgetIn,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Повністю замінює секції бюджету. Порожній список → бюджет з .env."""
    await session.execute(delete(BudgetItem))
    for it in body.items:
        if it.name.strip() and it.amount > 0:
            session.add(BudgetItem(name=it.name.strip(), amount=it.amount))
    await session.commit()
    return {"ok": True, "budget": await monthly_budget(session)}


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
    if member.role == "owner" and (body.get("role") or body.get("deleted")):
        raise HTTPException(status_code=403, detail="cannot modify owner")
    if isinstance(body.get("name"), str) and body["name"].strip():
        member.name = body["name"].strip()
    if isinstance(body.get("username"), str) and body["username"].strip():
        new_username = body["username"].strip().lstrip("@")
        # зміна тега в активного = заміна людини: відвʼязуємо старий акаунт,
        # нова людина активується через /start у боті
        if new_username != (member.username or "") and member.status == "active" and member.role != "owner":
            member.telegram_id = None
            member.status = "invited"
        member.username = new_username
    if body.get("role") in ("manager", "assistant", "driver"):
        member.role = body["role"]
    if isinstance(body.get("permissions"), dict):
        member.permissions = body["permissions"]
    if body.get("deleted"):
        await session.delete(member)
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
    await route_notifications(session, user, c)
    return result


@router.post("/ingest/voice/preview")
async def ingest_voice_preview(
    file: UploadFile,
    user: User = Depends(get_current_user),
) -> dict:
    """Розшифровка + класифікація БЕЗ збереження — для діалогу підтвердження в Mini App."""
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="Голос вимкнено: на сервері не задано OPENAI_API_KEY")
    audio = await file.read()
    text = await transcribe(audio, filename=file.filename or "voice.webm")
    if not text:
        raise HTTPException(status_code=422, detail="Не вдалося розшифрувати голос — спробуй ще раз")
    c = await classify(text, user.role)
    return {
        "transcript": text,
        "text": c.text,
        "type": c.type,
        "category": c.category,
        "amount": c.amount,
        "currency": c.currency,
        "due": c.due,
        "risk_level": c.risk_level,
    }


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
    await route_notifications(session, user, c)
    result["transcript"] = text
    return result


# ---------- роздача задач: диктовка власниці → список справ із виконавцями ----------
# Вікно «Перевір і роздай» у Mini App. БЕЗ збереження на кроці плану — лише розкладка.


class PlanIn(BaseModel):
    text: str


class PlannedTaskIn(BaseModel):
    text: str
    assignee: str = "me"
    category: str | None = None


class TasksIn(BaseModel):
    tasks: list[PlannedTaskIn]


def _plan_payload(transcript: str, tasks) -> dict:
    return {
        "transcript": transcript,
        "tasks": [{"text": t.text, "assignee": t.assignee, "category": t.category} for t in tasks],
    }


@router.post("/ingest/plan")
async def ingest_plan(body: PlanIn, user: User = Depends(require_owner)) -> dict:
    """Текст → список задач із підказкою виконавця (без збереження)."""
    tasks = await plan_tasks(body.text)
    return _plan_payload(body.text, tasks)


@router.post("/ingest/voice/plan")
async def ingest_voice_plan(
    file: UploadFile, user: User = Depends(require_owner)
) -> dict:
    """Голос → розшифровка → список задач (без збереження)."""
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="Голос вимкнено: на сервері не задано OPENAI_API_KEY")
    audio = await file.read()
    text = await transcribe(audio, filename=file.filename or "voice.webm")
    if not text:
        raise HTTPException(status_code=422, detail="Не вдалося розшифрувати голос — спробуй ще раз")
    tasks = await plan_tasks(text)
    return _plan_payload(text, tasks)


@router.post("/ingest/tasks")
async def ingest_tasks(
    body: TasksIn,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Зберігає роздані задачі пачкою + штовхає пуш кожному виконавцю (крім «я»)."""
    saved = []
    for t in body.tasks:
        if not t.text.strip():
            continue
        assignee = t.assignee if t.assignee in ("me", "manager", "assistant", "driver") else "me"
        saved.append(await save_owner_task(session, user, t.text.strip(), assignee, t.category))
    await session.commit()

    for s in saved:
        if s["assignee"] == "me":
            continue
        c = Classification(type="task", category=s["category"], text=s["text"], owner=s["assignee"])
        await route_notifications(session, user, c)

    return {"count": len(saved)}
