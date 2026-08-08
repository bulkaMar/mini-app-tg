"""Очистити всі дані (схему зберігаємо) — для передачі чистого продукту замовнику.

УВАГА: видаляє всі рядки в таблицях. Запуск із каталогу backend:

    python -m app.reset_data --yes                # повне очищення (і користувачі теж)
    python -m app.reset_data --yes --keep-owner   # лишити лише запис owner

Після очищення задай OWNER_TELEGRAM_ID на власника-замовника — він стане owner
при першому вході в Mini App / боті.
"""

import asyncio
import sys

from sqlalchemy import delete

from .db import SessionMaker, engine
from .models import BudgetItem, DailySnapshot, Expense, Message, Risk, Task, User, Workspace

# порядок: спершу залежні записи, користувачі — останніми
TABLES = [Message, Task, Risk, Expense, BudgetItem, DailySnapshot, User]


async def reset(keep_owner: bool) -> None:
    async with SessionMaker() as session:
        for model in TABLES:
            if model is User and keep_owner:
                await session.execute(delete(User).where(User.role != "owner"))
            else:
                await session.execute(delete(model))
        if not keep_owner:  # повне очищення прибирає й простори
            await session.execute(delete(Workspace))
        await session.commit()
    await engine.dispose()


def main() -> None:
    if "--yes" not in sys.argv:
        print("Це видалить УСІ дані. Додай прапорець --yes, щоб підтвердити.")
        sys.exit(1)
    keep_owner = "--keep-owner" in sys.argv
    asyncio.run(reset(keep_owner))
    print("✓ Дані очищено" + (" (запис owner збережено)" if keep_owner else ""))


if __name__ == "__main__":
    main()
