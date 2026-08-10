"""Диктування з Mini App і роздача задач."""


from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, UploadFile

from pydantic import BaseModel

from sqlalchemy.ext.asyncio import AsyncSession

from ...classifier import classify, plan_tasks
from ...config import settings
from ...models import User
from ...services.dictionaries import (
    all_categories,
    all_priorities,
    default_priority_key,
    priority_keys,
    usable_categories,
)

from ...services.notify import route_notifications
from ...services.saver import (
    resolve_assignee_category,
    save_classified,
    save_owner_task,
)

from ...services.transcribe import transcribe

from ..deps import get_current_user, get_session, require_owner




router = APIRouter()


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
