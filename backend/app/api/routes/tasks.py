"""Задачі, підзадачі й чекліст."""

from datetime import datetime, timezone


from fastapi import APIRouter, Depends, HTTPException

from pydantic import BaseModel
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession



from ...models import Task, TaskItem, TaskPriority, User
from ...services.dictionaries import (
    all_categories,
    default_priority_key,
    priority_keys,
    usable_categories,
    visible_categories,
)
from ...services.access import visible_since

from ...services.roles import (
    all_roles,
)
from ...services.saver import (
    parse_due,
    parse_due_at,
    due_out,
)



from ..deps import get_current_user, get_session




router = APIRouter()


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
        raise HTTPException(status_code=400, detail="Такої категорії немає")
    if key not in await usable_categories(session, user):
        raise HTTPException(status_code=403, detail="category not allowed for your role")


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
    assignee: str | None = None   # роль виконавця; не вказано — задача твоя
    items: list[TaskItemIn] = []


@router.get("/tasks")
async def list_tasks(
    category: str | None = None,
    assignee: str | None = None,
    status: str | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    """Фільтри за категорією, людиною (роллю виконавця) і станом — точні збіги,
    тож рахуємо їх у запиті. Фільтр за датою лишається на клієнті: дедлайн
    зберігається «настінним» часом, а який зараз день — знає лише пристрій."""
    cats = await visible_categories(session, user)
    conds = []
    if category:
        if category not in cats:
            raise HTTPException(status_code=403, detail="category not allowed for your role")
        conds.append(Task.category == category)
    else:
        # видно розділи своєї ролі + усе, що доручено особисто тобі в чужому розділі
        conds.append(or_(Task.category.in_(cats), Task.owner_role == user.role))
    if assignee:
        conds.append(Task.owner_role == assignee)
    if status in ("open", "done"):
        conds.append(Task.status == status)
    since = visible_since(user)  # тимчасовому старий архів закритий
    if since is not None:
        conds.append(Task.created_at >= since)
    where = and_(*conds)
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
        .limit(200)  # фільтри звужують вибірку, але запас потрібен для фільтра за датою
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
            "due": due_out(t),
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
    # кому доручено. Роздавати іншим може лише власниця; решта створює задачі собі
    owner_role = user.role
    if body.assignee and body.assignee != user.role:
        if getattr(user, "base_role", user.role) != "owner":
            raise HTTPException(status_code=403, detail="Роздавати задачі може лише власниця")
        if body.assignee not in {r.key for r in await all_roles(session, user.workspace_id)}:
            raise HTTPException(status_code=400, detail="Такої ролі немає")
        owner_role = body.assignee
    prios = await priority_keys(session, user.workspace_id)
    due_at, time_set = parse_due_at(body.due)
    task = Task(
        workspace_id=user.workspace_id,
        telegram_id=user.telegram_id,
        category=body.category,
        text=body.text,
        owner_role=owner_role,
        priority=body.priority if body.priority in prios else await default_priority_key(session, user.workspace_id),
        due=parse_due(body.due),
        due_at=due_at,
        due_time_set=time_set,
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
        task.due_at, task.due_time_set = parse_due_at(body["due"])
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
