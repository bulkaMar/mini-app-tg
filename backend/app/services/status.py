"""Розрахунок статусів напрямків, темпу та стрічки для пульта owner.

Правила переходів 🟢🟡🔴 (стартові, узгодити з owner):
- risk:   немає активних → ok; є low/med → warn; є high → crit
- production: немає тривог по production і < 8 відкритих задач → ok
- life:   0 відкритих → ok; 1-4 → warn; ≥5 → crit
- budget: < 80% бюджету → ok; 80-100% → warn; > 100% → crit
- load:   відкриті задачі + 2×активні тривоги: <5 LOW, <10 MED, інакше HIGH
"""

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import BudgetItem, Expense, Message, Risk, Task, User
from .saver import resolve_target_role

ROLE_LABELS = {"owner": "власник", "manager": "менеджер", "assistant": "асистент", "driver": "водій"}


async def monthly_budget(session: AsyncSession) -> float:
    """Сума секцій бюджету; якщо секцій немає — MONTHLY_BUDGET з .env."""
    total = (
        await session.execute(select(func.coalesce(func.sum(BudgetItem.amount), 0.0)))
    ).scalar_one()
    return float(total) or settings.monthly_budget


async def compute_dashboard(session: AsyncSession) -> dict:
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    open_tasks = (
        await session.execute(
            select(Task.category, func.count())
            .where(Task.status == "open", Task.deleted_at.is_(None))
            .group_by(Task.category)
        )
    ).all()
    by_cat = {cat: cnt for cat, cnt in open_tasks}
    total_open = sum(by_cat.values())

    active_risks = (
        await session.execute(
            select(Risk).where(Risk.resolved.is_(False), Risk.deleted_at.is_(None))
        )
    ).scalars().all()
    risk_count = len(active_risks)
    has_high = any(r.level == "high" for r in active_risks)
    prod_risk = any(r.owner_role in ("manager", "owner") for r in active_risks)

    spent = (
        await session.execute(
            select(func.coalesce(func.sum(Expense.amount), 0.0)).where(
                Expense.deleted_at.is_(None), Expense.created_at >= month_start
            )
        )
    ).scalar_one()
    budget = await monthly_budget(session)
    budget_pct = round(spent / budget * 100) if budget else 0

    life_open = by_cat.get("life", 0) + by_cat.get("dog", 0)
    logistics_open = by_cat.get("logistics", 0)

    statuses = {
        "production": "crit" if (prod_risk and has_high) else ("warn" if prod_risk or by_cat.get("production", 0) >= 8 else "ok"),
        "life": "crit" if life_open >= 5 else ("warn" if life_open >= 1 else "ok"),
        "logistics": "crit" if logistics_open >= 5 else ("warn" if logistics_open >= 1 else "ok"),
        "money": "crit" if budget_pct > 100 else ("warn" if budget_pct >= 80 else "ok"),
        "risk": "crit" if has_high else ("warn" if risk_count else "ok"),
    }

    load_score = total_open + 2 * risk_count
    load = "LOW" if load_score < 5 else ("MED" if load_score < 10 else "HIGH")

    # стрічка «Надійшло» — останні повідомлення команди
    feed_rows = (
        await session.execute(
            select(Message, User.name)
            .join(User, User.telegram_id == Message.telegram_id, isouter=True)
            .order_by(Message.created_at.desc())
            .limit(20)
        )
    ).all()
    feed = [
        {
            "id": m.id,
            "role": m.sender_role,
            "role_label": ROLE_LABELS.get(m.sender_role, m.sender_role),
            "target_role": m.target_role or resolve_target_role(m.sender_role, m.category),
            "name": name or "",
            "type": m.classified_type,
            "category": m.category,
            "text": m.clean_text or m.raw_text,
            "time": m.created_at.isoformat() if m.created_at else None,
        }
        for m, name in feed_rows
    ]

    return {
        "statuses": statuses,
        "counts": {
            "open_tasks": total_open,
            "life_open": life_open,
            "production_open": by_cat.get("production", 0),
            "logistics_open": logistics_open,
            "risk_active": risk_count,
            "spent": round(float(spent)),
            "budget": budget,
            "budget_pct": budget_pct,
        },
        "load": load,
        "feed": feed,
    }
