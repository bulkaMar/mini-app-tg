"""Запуск бота: python -m app.bot (polling, для дев/MVP. Прод — webhook, Етап 6)."""

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.types import BotCommand

from ..config import settings
from ..db import init_db
from .handlers import router
from .middleware import WhitelistMiddleware

logging.basicConfig(level=logging.INFO)


async def main() -> None:
    await init_db()

    bot = Bot(token=settings.bot_token, default=DefaultBotProperties())
    dp = Dispatcher()
    dp.message.middleware(WhitelistMiddleware())
    dp.callback_query.middleware(WhitelistMiddleware())
    dp.include_router(router)

    await bot.set_my_commands(
        [
            BotCommand(command="start", description="Привітання + кнопка ПУЛЬТ"),
            BotCommand(command="pult", description="Відкрити Mini App"),
            BotCommand(command="status", description="Короткий статус системи"),
            BotCommand(command="money", description="Фінанси"),
            BotCommand(command="risks", description="Активні тривоги"),
            BotCommand(command="help", description="Список команд"),
        ]
    )

    # Telegram дублює апдейти після рестарту — скидаємо хвіст
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
