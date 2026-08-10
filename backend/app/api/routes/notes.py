"""Нотатки й Особисте — приватні записи людини."""

from datetime import datetime, timezone


from fastapi import APIRouter, Depends, HTTPException, Query

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession



from ...models import Note, User





from ..deps import get_current_user, get_session




router = APIRouter()


# ---------- нотатки й особисте ----------
# Обидва списки бачить ТІЛЬКИ автор. Кожен запит жорстко звужено до
# telegram_id того, хто питає — окремої «власницької» гілки тут немає навмисно.

NOTE_KINDS = ("note", "private")
MAX_NOTE_LEN = 5000


def _note_out(n: Note) -> dict:
    return {
        "id": n.id,
        "kind": n.kind,
        "text": n.text,
        "done": n.done,
        "time": n.created_at.isoformat() if n.created_at else None,
    }


class NoteIn(BaseModel):
    kind: str = "note"
    text: str


@router.get("/notes")
async def list_notes(
    kind: str = Query(default="note"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    if kind not in NOTE_KINDS:
        raise HTTPException(status_code=400, detail="bad kind")
    rows = (await session.execute(
        select(Note)
        .where(
            Note.telegram_id == user.telegram_id,   # тільки свої, без винятків
            Note.kind == kind,
            Note.deleted_at.is_(None),
        )
        .order_by(Note.done.asc(), Note.created_at.desc())
        .limit(200)
    )).scalars().all()
    return [_note_out(n) for n in rows]


@router.post("/notes")
async def create_note(
    body: NoteIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if body.kind not in NOTE_KINDS:
        raise HTTPException(status_code=400, detail="bad kind")
    text = body.text.strip()[:MAX_NOTE_LEN]
    if not text:
        raise HTTPException(status_code=400, detail="Запис не може бути порожнім")
    note = Note(
        workspace_id=user.workspace_id,
        telegram_id=user.telegram_id,
        kind=body.kind,
        text=text,
    )
    session.add(note)
    await session.commit()
    return {"id": note.id, "ok": True}


@router.patch("/notes/{note_id}")
async def update_note(
    note_id: int,
    body: dict,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    note = (await session.execute(select(Note).where(
        Note.id == note_id,
        Note.telegram_id == user.telegram_id,   # чужий запис навіть не знаходиться
    ))).scalar_one_or_none()
    if note is None or note.deleted_at is not None:
        raise HTTPException(status_code=404)
    if isinstance(body.get("text"), str) and body["text"].strip():
        note.text = body["text"].strip()[:MAX_NOTE_LEN]
    if isinstance(body.get("done"), bool):
        note.done = body["done"]
    if body.get("deleted"):
        note.deleted_at = datetime.now(timezone.utc)
    await session.commit()
    return {"ok": True}
