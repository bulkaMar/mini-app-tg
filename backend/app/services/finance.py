"""Листи витрат: «Загальний бюджет» + окремі листи під зйомки.

Правила доступу (обираються при додаванні людини):
- finance.scope = "all"    — бачить усі листи простору;
- finance.scope = "sheets" — лише ті, що в finance.sheets.
Власниця бачить усе завжди.

Тимчасовий працівник (employment = "temporary") бачить лише те, що зʼявилось
із дня, коли його додали (visible_from). Постійний бачить лист цілком.
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ExpenseSheet, User

GENERAL_SHEET_NAME = "Загальний бюджет"


async def seed_general_sheet(session: AsyncSession, workspace_id: int | None) -> ExpenseSheet:
    """У кожного простору є «Загальний бюджет» — створюємо, якщо його ще немає."""
    sheet = (await session.execute(
        select(ExpenseSheet).where(
            ExpenseSheet.workspace_id == workspace_id, ExpenseSheet.is_general.is_(True)
        )
    )).scalars().first()
    if sheet is None:
        sheet = ExpenseSheet(
            workspace_id=workspace_id, name=GENERAL_SHEET_NAME, is_general=True, sort=0,
        )
        session.add(sheet)
        await session.flush()
    return sheet


async def all_sheets(session: AsyncSession, workspace_id: int | None) -> list[ExpenseSheet]:
    return list((await session.execute(
        select(ExpenseSheet)
        .where(ExpenseSheet.workspace_id == workspace_id)
        .order_by(ExpenseSheet.sort.asc(), ExpenseSheet.id.asc())
    )).scalars().all())


async def general_sheet_id(session: AsyncSession, workspace_id: int | None) -> int | None:
    for s in await all_sheets(session, workspace_id):
        if s.is_general:
            return s.id
    return None


def finance_perms(user: User) -> dict:
    return ((user.permissions or {}).get("finance") or {})


async def visible_sheet_ids(session: AsyncSession, user: User) -> list[int]:
    """Листи, які людині відкриті — у порядку відображення."""
    sheets = await all_sheets(session, user.workspace_id)
    if user.role == "owner":
        return [s.id for s in sheets]
    perms = finance_perms(user)
    if perms.get("scope", "all") == "all":
        return [s.id for s in sheets]
    allowed = {int(x) for x in (perms.get("sheets") or []) if str(x).isdigit() or isinstance(x, int)}
    return [s.id for s in sheets if s.id in allowed]


def visible_from(user: User) -> datetime | None:
    """З якого моменту людині видно записи. Постійним — без обмеження."""
    if user.role == "owner" or user.employment != "temporary":
        return None
    return user.visible_from


def normalize_finance_perms(scope: str | None, sheet_ids, valid_ids: set[int]) -> dict:
    """Готує блок permissions.finance із того, що прийшло з форми."""
    if scope != "sheets":
        return {"scope": "all", "sheets": []}
    picked = []
    for x in (sheet_ids or []):
        try:
            v = int(x)
        except (TypeError, ValueError):
            continue
        if v in valid_ids and v not in picked:
            picked.append(v)
    return {"scope": "sheets", "sheets": picked}
