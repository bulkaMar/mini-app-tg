import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..classifier import classify, plan_tasks
from ..config import settings
from ..models import (
    BudgetItem, Expense, Message, Risk, Task, TaskCategory, TaskItem, TaskPriority,
    User, Workspace,
)
from ..services.dictionaries import (
    all_categories,
    all_priorities,
    default_priority_key,
    new_key,
    priority_keys,
    usable_categories,
    visible_categories,
)
from ..services.notify import route_notifications
from ..services.saver import (
    parse_due,
    resolve_assignee_category,
    resolve_target_role,
    save_classified,
    save_owner_task,
)
from ..services.status import ROLE_LABELS, compute_dashboard, monthly_budget
from ..services.transcribe import transcribe
from .auth import InitDataError, validate_init_data
from .deps import allowed_categories, get_current_user, get_session, require_owner
from .events import subscribe, unsubscribe

router = APIRouter(prefix="/api")

COLORS = ("blue", "green", "gold", "orange", "red", "ink", "warn", "muted")


ITEM_KINDS = ("subtask", "check")
MAX_ITEMS = 50  # запобіжник, щоб одна задача не роздулась нескінченним списком


async def _replace_items(session: AsyncSession, task_id: int, ws_id: int | None, items) -> None:
    """Повністю замінює пункти задачі присланим списком (порядок = порядок у списку)."""
    await session.execute(delete(TaskItem).where(TaskItem.task_id == task_id))
    pos = 0
    for it in items[:MAX_ITEMS]:
        kind = it.get("kind") if isinstance(it, dict) else it.kind
        text = (it.get("text") if isinstance(it, dict) else it.text) or ""
        done = bool(it.get("done") if isinstance(it, dict) else it.done)
        text = str(text).strip()
        if kind not in ITEM_KINDS or not text:
            continue
        session.add(TaskItem(
            workspace_id=ws_id, task_id=task_id, kind=kind,
            text=text, done=done, position=pos,
        ))
        pos += 1


async def _items_by_task(
    session: AsyncSession, task_ids: list[int], ws_id: int | None
) -> dict[int, list[dict]]:
    """Пункти для пачки задач одним запитом — щоб не смикати БД на кожен рядок."""
    if not task_ids:
        return {}
    rows = (await session.execute(
        select(TaskItem)
        .where(TaskItem.task_id.in_(task_ids), TaskItem.workspace_id == ws_id)
        .order_by(TaskItem.position.asc(), TaskItem.id.asc())
    )).scalars().all()
    out: dict[int, list[dict]] = {}
    for r in rows:
        out.setdefault(r.task_id, []).append(
            {"id": r.id, "kind": r.kind, "text": r.text, "done": r.done}
        )
    return out


async def _check_task_category(session: AsyncSession, user: User, key: str) -> None:
    """Немає такого розділу — це помилка запиту; є, але закритий ролі — заборона."""
    if key not in {c.key for c in await all_categories(session, user.workspace_id)}:
        raise HTTPException(status_code=400, detail="Такого розділу немає")
    if key not in await usable_categories(session, user):
        raise HTTPException(status_code=403, detail="category not allowed for your role")


async def _events_workspace_id(auth: str | None) -> int | None:
    """Визначає workspace для SSE-підписки за initData (або дев-простір)."""
    from ..db import SessionMaker

    async with SessionMaker() as session:
        if auth:
            try:
                data = validate_init_data(auth)
            except InitDataError:
                raise HTTPException(status_code=401, detail="invalid initData")
            tg_id = (data.get("user") or {}).get("id")
            user = (
                await session.execute(select(User).where(User.telegram_id == tg_id))
            ).scalar_one_or_none() if tg_id else None
            return user.workspace_id if user else None
        if settings.dev_auth:
            ws = (
                await session.execute(
                    select(Workspace).where(Workspace.owner_telegram_id == settings.primary_owner_id)
                )
            ).scalar_one_or_none()
            return ws.id if ws else None
        raise HTTPException(status_code=401, detail="initData required")


@router.get("/events")
async def events(request: Request, auth: str | None = Query(default=None)):
    """SSE-стрім: пушить подію `change`, коли в просторі користувача щось змінилось.
    EventSource не вміє слати кастомні заголовки → initData приходить у query."""
    ws_id = await _events_workspace_id(auth)
    queue = subscribe(ws_id)

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
async def me(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> dict:
    return {
        "telegram_id": user.telegram_id,
        "name": user.name,
        "username": user.username,
        "role": user.role,
        "role_label": ROLE_LABELS.get(user.role, user.role),
        "permissions": user.permissions or {},
        # у які розділи ця людина може класти задачі — з цього фронт будує вибір
        "task_categories": await usable_categories(session, user),
    }


@router.get("/dashboard")
async def dashboard(
    user: User = Depends(require_owner), session: AsyncSession = Depends(get_session)
) -> dict:
    return await compute_dashboard(session, user.workspace_id)


@router.get("/feed")
async def feed(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> list[dict]:
    """Стрічка повідомлень: owner — усі, інші — тільки свої категорії."""
    q = (
        select(Message)
        .where(Message.workspace_id == user.workspace_id)
        .order_by(Message.created_at.desc())
        .limit(30)
    )
    if user.role != "owner":
        # базові теми ролі (зокрема finance) + розділи задач, які їй видно
        cats = allowed_categories(user) | await visible_categories(session, user)
        q = q.where(Message.category.in_(cats))
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


# ---------- довідники: розділи задач і рівні важливості ----------
# Читати може будь-хто (без назв не намалювати списки), змінювати — тільки власниця.


def _cat_out(c: TaskCategory, usable: set[str]) -> dict:
    return {
        "id": c.id, "key": c.key, "label": c.label, "icon": c.icon, "color": c.color,
        "roles": c.roles or [], "is_system": c.is_system, "can_use": c.key in usable,
    }


def _prio_out(p: TaskPriority) -> dict:
    return {
        "id": p.id, "key": p.key, "label": p.label, "icon": p.icon, "color": p.color,
        "rank": p.rank, "is_default": p.is_default, "is_system": p.is_system,
    }


@router.get("/dictionaries")
async def dictionaries(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> dict:
    """Розділи (лише ті, що людині видно) + усі рівні важливості."""
    visible = await visible_categories(session, user)
    usable = set(await usable_categories(session, user))
    return {
        "categories": [
            _cat_out(c, usable) for c in await all_categories(session, user.workspace_id) if c.key in visible
        ],
        "priorities": [_prio_out(p) for p in await all_priorities(session, user.workspace_id)],
    }


class CategoryIn(BaseModel):
    label: str
    icon: str = "task"
    color: str = "orange"
    roles: list[str] = []


@router.post("/categories")
async def create_category(
    body: CategoryIn,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    label = body.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="Назва розділу не може бути порожньою")
    rows = await all_categories(session, user.workspace_id)
    if any(c.label.lower() == label.lower() for c in rows):
        raise HTTPException(status_code=409, detail="Розділ із такою назвою вже є")
    cat = TaskCategory(
        workspace_id=user.workspace_id,
        key=await new_key(session, "c", TaskCategory, user.workspace_id),
        label=label,
        icon=body.icon or "task",
        color=body.color if body.color in COLORS else "orange",
        roles=[r for r in body.roles if r in ("manager", "assistant", "driver")],
        is_system=False,
        sort=max((c.sort for c in rows), default=100) + 10,
    )
    session.add(cat)
    await session.commit()
    return {"id": cat.id, "key": cat.key, "ok": True}


@router.patch("/categories/{cat_id}")
async def update_category(
    cat_id: int,
    body: dict,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Перейменувати / змінити вигляд і те, хто бачить. Системний розділ — теж можна."""
    cat = (await session.execute(select(TaskCategory).where(
        TaskCategory.id == cat_id, TaskCategory.workspace_id == user.workspace_id
    ))).scalar_one_or_none()
    if cat is None:
        raise HTTPException(status_code=404)
    if isinstance(body.get("label"), str) and body["label"].strip():
        cat.label = body["label"].strip()
    if isinstance(body.get("icon"), str) and body["icon"].strip():
        cat.icon = body["icon"].strip()
    if body.get("color") in COLORS:
        cat.color = body["color"]
    if isinstance(body.get("roles"), list):
        cat.roles = [r for r in body["roles"] if r in ("manager", "assistant", "driver")]
    await session.commit()
    return {"ok": True}


@router.delete("/categories/{cat_id}")
async def delete_category(
    cat_id: int,
    move_to: str | None = Query(default=None),
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Видаляє свій розділ. Якщо в ньому є справи — просимо вказати, куди їх перенести."""
    cat = (await session.execute(select(TaskCategory).where(
        TaskCategory.id == cat_id, TaskCategory.workspace_id == user.workspace_id
    ))).scalar_one_or_none()
    if cat is None:
        raise HTTPException(status_code=404)
    if cat.is_system:
        raise HTTPException(
            status_code=409,
            detail="Це системний розділ — на ньому побудовані екрани. Його можна перейменувати, але не видалити",
        )

    count = (await session.execute(
        select(func.count()).select_from(Task).where(Task.category == cat.key, Task.deleted_at.is_(None))
    )).scalar_one()
    if count:
        others = [c.key for c in await all_categories(session, user.workspace_id) if c.key != cat.key]
        if move_to not in others:
            raise HTTPException(
                status_code=409,
                detail=f"tasks_present:{count}",  # фронт спитає, куди перенести
            )
        await session.execute(
            update(Task).where(Task.category == cat.key).values(category=move_to)
        )
    await session.delete(cat)
    await session.commit()
    return {"ok": True, "moved": count}


class PriorityIn(BaseModel):
    label: str
    icon: str | None = None
    color: str = "muted"


@router.post("/priorities")
async def create_priority(
    body: PriorityIn,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Новий рівень стає найменш важливим — далі його можна підняти стрілками."""
    label = body.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="Назва рівня не може бути порожньою")
    rows = await all_priorities(session, user.workspace_id)
    if any(p.label.lower() == label.lower() for p in rows):
        raise HTTPException(status_code=409, detail="Рівень із такою назвою вже є")
    prio = TaskPriority(
        workspace_id=user.workspace_id,
        key=await new_key(session, "p", TaskPriority, user.workspace_id),
        label=label,
        icon=(body.icon or None),
        color=body.color if body.color in COLORS else "muted",
        rank=max((p.rank for p in rows), default=50) + 10,
        is_default=False,
        is_system=False,
    )
    session.add(prio)
    await session.commit()
    return {"id": prio.id, "key": prio.key, "ok": True}


@router.patch("/priorities/{prio_id}")
async def update_priority(
    prio_id: int,
    body: dict,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    prio = (await session.execute(select(TaskPriority).where(
        TaskPriority.id == prio_id, TaskPriority.workspace_id == user.workspace_id
    ))).scalar_one_or_none()
    if prio is None:
        raise HTTPException(status_code=404)
    if isinstance(body.get("label"), str) and body["label"].strip():
        prio.label = body["label"].strip()
    if "icon" in body:
        icon = body["icon"]
        prio.icon = icon.strip() if isinstance(icon, str) and icon.strip() else None
    if body.get("color") in COLORS:
        prio.color = body["color"]
    await session.commit()
    return {"ok": True}


class PriorityOrderIn(BaseModel):
    ids: list[int]


@router.put("/priorities/order")
async def reorder_priorities(
    body: PriorityOrderIn,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Порядок згори вниз: перший — найважливіший."""
    rows = {p.id: p for p in await all_priorities(session, user.workspace_id)}
    for i, pid in enumerate(body.ids):
        if pid in rows:
            rows[pid].rank = i * 10
    await session.commit()
    return {"ok": True}


@router.delete("/priorities/{prio_id}")
async def delete_priority(
    prio_id: int,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Задачі з цим рівнем стають звичайними — нічого не губиться."""
    prio = (await session.execute(select(TaskPriority).where(
        TaskPriority.id == prio_id, TaskPriority.workspace_id == user.workspace_id
    ))).scalar_one_or_none()
    if prio is None:
        raise HTTPException(status_code=404)
    if prio.is_default:
        raise HTTPException(
            status_code=409,
            detail="Це рівень за замовчуванням — на нього падають задачі з видалених рівнів",
        )
    fallback = await default_priority_key(session, user.workspace_id)
    await session.execute(
        update(Task).where(Task.priority == prio.key).values(priority=fallback)
    )
    await session.delete(prio)
    await session.commit()
    return {"ok": True}


# ---------- tasks ----------

class TaskItemIn(BaseModel):
    kind: str = "subtask"
    text: str
    done: bool = False


class TaskIn(BaseModel):
    category: str
    text: str
    due: str | None = None
    priority: str = "normal"
    items: list[TaskItemIn] = []


@router.get("/tasks")
async def list_tasks(
    category: str | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    cats = await visible_categories(session, user)
    if category:
        if category not in cats:
            raise HTTPException(status_code=403, detail="category not allowed for your role")
        where = Task.category == category
    else:
        # видно розділи своєї ролі + усе, що доручено особисто тобі в чужому розділі
        where = or_(Task.category.in_(cats), Task.owner_role == user.role)
    # порядок важливості беремо з довідника (rank); рівень міг зникнути → у кінець
    q = (
        select(Task)
        .outerjoin(
            TaskPriority,
            (TaskPriority.key == Task.priority)
            & (TaskPriority.workspace_id == user.workspace_id),
        )
        .where(Task.workspace_id == user.workspace_id, Task.deleted_at.is_(None), where)
        .order_by(
            Task.status.asc(),
            func.coalesce(TaskPriority.rank, 1000),
            Task.created_at.desc(),
        )
        .limit(100)
    )
    rows = (await session.execute(q)).scalars().all()
    items = await _items_by_task(session, [t.id for t in rows], user.workspace_id)
    out = []
    for t in rows:
        its = items.get(t.id, [])
        out.append({
            "id": t.id,
            "category": t.category,
            "text": t.text,
            "status": t.status,
            "priority": t.priority or "normal",
            "owner_role": t.owner_role,
            "due": t.due.isoformat() if t.due else None,
            "done_at": t.done_at.isoformat() if t.done_at else None,
            "time": t.created_at.isoformat() if t.created_at else None,
            "items": its,
            "items_total": len(its),
            "items_done": sum(1 for i in its if i["done"]),
        })
    return out


@router.post("/tasks")
async def create_task(
    body: TaskIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await _check_task_category(session, user, body.category)
    prios = await priority_keys(session, user.workspace_id)
    task = Task(
        workspace_id=user.workspace_id,
        telegram_id=user.telegram_id,
        category=body.category,
        text=body.text,
        owner_role=user.role,
        priority=body.priority if body.priority in prios else await default_priority_key(session, user.workspace_id),
        due=parse_due(body.due),
    )
    session.add(task)
    await session.flush()  # потрібен id, щоб прив'язати підзадачі/чекліст
    if body.items:
        await _replace_items(session, task.id, user.workspace_id, body.items)
    await session.commit()
    return {"id": task.id, "ok": True}


@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: int,
    body: dict,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    task = (
        await session.execute(
            select(Task).where(Task.id == task_id, Task.workspace_id == user.workspace_id)
        )
    ).scalar_one_or_none()
    if task is None or task.deleted_at is not None:
        raise HTTPException(status_code=404)
    # правити може той, кому відкритий розділ, або той, кому задачу доручено
    if task.category not in await visible_categories(session, user) and task.owner_role != user.role:
        raise HTTPException(status_code=403)
    if isinstance(body.get("text"), str) and body["text"].strip():
        task.text = body["text"].strip()
    if "due" in body:
        task.due = parse_due(body["due"])
    if body.get("category") and body["category"] != task.category:
        await _check_task_category(session, user, body["category"])
        task.category = body["category"]
    if body.get("priority") in await priority_keys(session, user.workspace_id):
        task.priority = body["priority"]
    if isinstance(body.get("items"), list):
        await _replace_items(session, task.id, user.workspace_id, body["items"])
        task.updated_at = datetime.now(timezone.utc)  # щоб живі оновлення побачили зміну
    if body.get("status") in ("open", "done"):
        task.status = body["status"]
        task.done_at = datetime.now(timezone.utc) if body["status"] == "done" else None
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
            select(Risk)
            .where(Risk.workspace_id == user.workspace_id, Risk.deleted_at.is_(None))
            .order_by(Risk.resolved.asc(), Risk.created_at.desc())
            .limit(50)
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
    risk = (
        await session.execute(
            select(Risk).where(Risk.id == risk_id, Risk.workspace_id == user.workspace_id)
        )
    ).scalar_one_or_none()
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
    q = (
        select(Expense)
        .where(Expense.workspace_id == user.workspace_id, Expense.deleted_at.is_(None))
        .order_by(Expense.created_at.desc())
        .limit(50)
    )
    if user.role != "owner" and not (user.permissions or {}).get("see_budget"):
        q = q.where(Expense.telegram_id == user.telegram_id)
    rows = (await session.execute(q)).scalars().all()

    spent = (
        await session.execute(
            select(func.coalesce(func.sum(Expense.amount), 0.0)).where(
                Expense.workspace_id == user.workspace_id,
                Expense.deleted_at.is_(None),
                Expense.created_at >= month_start,
            )
        )
    ).scalar_one()
    budget = await monthly_budget(session, user.workspace_id)
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
    e = Expense(
        workspace_id=user.workspace_id,
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

class BudgetItemIn(BaseModel):
    name: str
    amount: float


class BudgetIn(BaseModel):
    items: list[BudgetItemIn]


@router.get("/budget")
async def get_budget(
    user: User = Depends(require_owner), session: AsyncSession = Depends(get_session)
) -> dict:
    rows = (
        await session.execute(
            select(BudgetItem)
            .where(BudgetItem.workspace_id == user.workspace_id)
            .order_by(BudgetItem.id.asc())
        )
    ).scalars().all()
    return {
        "budget": await monthly_budget(session, user.workspace_id),
        "items": [{"id": b.id, "name": b.name, "amount": b.amount} for b in rows],
    }


@router.put("/budget")
async def set_budget(
    body: BudgetIn,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Повністю замінює секції бюджету простору. Порожній список → бюджет з .env."""
    await session.execute(delete(BudgetItem).where(BudgetItem.workspace_id == user.workspace_id))
    for it in body.items:
        if it.name.strip() and it.amount > 0:
            session.add(BudgetItem(workspace_id=user.workspace_id, name=it.name.strip(), amount=it.amount))
    await session.commit()
    return {"ok": True, "budget": await monthly_budget(session, user.workspace_id)}


# ---------- team (owner) ----------

class MemberIn(BaseModel):
    username: str
    name: str = ""
    role: str = "assistant"


@router.get("/team")
async def team(
    user: User = Depends(require_owner), session: AsyncSession = Depends(get_session)
) -> list[dict]:
    rows = (
        await session.execute(
            select(User).where(User.workspace_id == user.workspace_id).order_by(User.created_at.asc())
        )
    ).scalars().all()
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
    member = User(
        workspace_id=user.workspace_id,  # запрошений приєднується до простору власника
        username=username, name=body.name or username, role=body.role, status="invited",
    )
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
    member = (
        await session.execute(
            select(User).where(User.id == member_id, User.workspace_id == user.workspace_id)
        )
    ).scalar_one_or_none()
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
    priority: str = "normal"


class TasksIn(BaseModel):
    tasks: list[PlannedTaskIn]


def _plan_payload(transcript: str, tasks) -> dict:
    return {
        "transcript": transcript,
        "tasks": [
            {
                "text": t.text,
                "assignee": t.assignee,
                "category": t.category,
                "priority": t.priority,
            }
            for t in tasks
        ],
    }


async def _plan_options(
    session: AsyncSession, ws_id: int | None
) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """Актуальні розділи й рівні важливості — щоб AI розкладав по тому, що є зараз."""
    cats = [(c.key, c.label) for c in await all_categories(session, ws_id)]
    prios = [(p.key, p.label) for p in await all_priorities(session, ws_id)]
    return cats, prios


@router.post("/ingest/plan")
async def ingest_plan(
    body: PlanIn,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Текст → список задач із підказкою виконавця (без збереження)."""
    cats, prios = await _plan_options(session, user.workspace_id)
    tasks = await plan_tasks(body.text, cats, prios)
    return _plan_payload(body.text, tasks)


@router.post("/ingest/voice/plan")
async def ingest_voice_plan(
    file: UploadFile,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Голос → розшифровка → список задач (без збереження)."""
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="Голос вимкнено: на сервері не задано OPENAI_API_KEY")
    audio = await file.read()
    text = await transcribe(audio, filename=file.filename or "voice.webm")
    if not text:
        raise HTTPException(status_code=422, detail="Не вдалося розшифрувати голос — спробуй ще раз")
    cats, prios = await _plan_options(session, user.workspace_id)
    tasks = await plan_tasks(text, cats, prios)
    return _plan_payload(text, tasks)


@router.post("/ingest/tasks")
async def ingest_tasks(
    body: TasksIn,
    user: User = Depends(require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Зберігає роздані задачі пачкою + штовхає пуш кожному виконавцю (крім «я»)."""
    valid_cats = set(await usable_categories(session, user))
    valid_prios = await priority_keys(session, user.workspace_id)
    fallback_prio = await default_priority_key(session, user.workspace_id)

    saved = []
    for t in body.tasks:
        if not t.text.strip():
            continue
        assignee = t.assignee if t.assignee in ("me", "manager", "assistant", "driver") else "me"
        saved.append(await save_owner_task(
            session,
            user,
            t.text.strip(),
            assignee,
            resolve_assignee_category(assignee, t.category, valid_cats),
            t.priority if t.priority in valid_prios else fallback_prio,
        ))
    await session.commit()

    for s in saved:
        if s["assignee"] == "me":
            continue
        # не Classification: розділ може бути власним ключем власниці, а не з фіксованого
        # переліку класифікатора. Для пуша важливі лише тип, текст і адресат.
        note = SimpleNamespace(
            type="task", category=s["category"], text=s["text"], owner=s["assignee"]
        )
        await route_notifications(session, user, note)

    return {"count": len(saved)}
