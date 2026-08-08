"""Спільний помічник: знайти або створити простір власника (для API і бота)."""

from sqlalchemy import select

from ..models import Workspace
from .dictionaries import seed_dictionaries
from .finance import seed_general_sheet
from .roles import seed_roles


async def get_or_create_workspace(session, owner_tg_id: int) -> Workspace:
    ws = (
        await session.execute(select(Workspace).where(Workspace.owner_telegram_id == owner_tg_id))
    ).scalar_one_or_none()
    if ws is None:
        ws = Workspace(owner_telegram_id=owner_tg_id)
        session.add(ws)
        await session.flush()
    # новий простір одразу отримує свої розділи, рівні важливості
    # і «Загальний бюджет» (усе ідемпотентно)
    await seed_dictionaries(session, ws.id)
    await seed_general_sheet(session, ws.id)
    await seed_roles(session, ws.id)
    return ws
