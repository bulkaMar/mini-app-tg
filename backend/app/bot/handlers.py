"""Логіка бота: збирає → структурує → показує підтвердження → зберігає."""

import io
import logging
import uuid

from aiogram import Bot, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)
from sqlalchemy import func, select

from ..classifier import Classification, classify
from ..config import settings
from ..db import SessionMaker
from ..models import Expense, Risk, User
from ..services.notify import notify_owner
from ..services.saver import save_classified
from ..services.status import ROLE_LABELS, compute_dashboard
from ..services.transcribe import transcribe

log = logging.getLogger(__name__)
router = Router()

# незбережені класифікації, що чекають підтвердження (MVP: in-memory, один процес)
_pending: dict[str, tuple[str, Classification, str | None]] = {}

TYPE_LABELS = {"task": "📋 Задача", "risk": "🚨 Тривога", "money": "💰 Витрата", "status": "📊 Статус"}
CATEGORY_LABELS = {
    "production": "Проєкти",
    "life": "Побут",
    "dog": "Пес",
    "finance": "Фінанси",
    "logistics": "Логістика",
}
STATUS_EMOJI = {"ok": "🟢", "warn": "🟡", "crit": "🔴"}


def _webapp_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📟 Відкрити ПУЛЬТ", web_app=WebAppInfo(url=settings.webapp_url))]
        ]
    )


@router.message(CommandStart())
async def cmd_start(message: Message, db_user: User) -> None:
    await message.answer(
        f"Привіт, {db_user.name or 'друже'}! Це ПУЛЬТ.\n\n"
        "Надиктуй голосове або напиши текстом — я розкладу по полицях "
        "(задача / тривога / витрата) і збережу.\n\n"
        f"Твоя роль: <b>{ROLE_LABELS.get(db_user.role, db_user.role)}</b>",
        reply_markup=_webapp_kb(),
        parse_mode="HTML",
    )


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    await message.answer(
        "/start — привітання + кнопка ПУЛЬТ\n"
        "/pult — відкрити Mini App\n"
        "/status — короткий статус системи\n"
        "/money — фінанси місяця\n"
        "/risks — активні тривоги\n"
        "/help — цей список\n\n"
        "А ще просто пиши або диктуй — я все зрозумію."
    )


@router.message(Command("pult"))
@router.message(F.text.func(lambda t: t and t.strip().lower().startswith("/пульт")))
async def cmd_pult(message: Message) -> None:
    await message.answer("Тримай:", reply_markup=_webapp_kb())


@router.message(Command("status"))
@router.message(F.text.func(lambda t: t and t.strip().lower().startswith("/статус")))
async def cmd_status(message: Message, db_user: User) -> None:
    if db_user.role != "owner":
        await message.answer("Статус системи бачить тільки власник.")
        return
    async with SessionMaker() as session:
        d = await compute_dashboard(session)
    s, c = d["statuses"], d["counts"]
    await message.answer(
        f"{STATUS_EMOJI[s['production']]} Проєкти — відкритих задач: {c['production_open']}\n"
        f"{STATUS_EMOJI[s['life']]} Побут — справ: {c['life_open']}\n"
        f"{STATUS_EMOJI[s['money']]} Фінанси — {c['spent']} ₴ ({c['budget_pct']}% бюджету)\n"
        f"{STATUS_EMOJI[s['risk']]} Тривоги — активних: {c['risk_active']}\n\n"
        f"Темп: {d['load']}"
    )


@router.message(Command("risks"))
@router.message(F.text.func(lambda t: t and t.strip().lower().startswith("/тривоги")))
async def cmd_risks(message: Message) -> None:
    async with SessionMaker() as session:
        risks = (
            await session.execute(
                select(Risk).where(Risk.resolved.is_(False), Risk.deleted_at.is_(None)).order_by(Risk.created_at.desc())
            )
        ).scalars().all()
    if not risks:
        await message.answer("🟢 Активних тривог немає.")
        return
    lines = [f"🚨 <b>{r.level.upper()}</b> · {r.text}" for r in risks]
    await message.answer("\n".join(lines), parse_mode="HTML")


@router.message(Command("money"))
@router.message(F.text.func(lambda t: t and t.strip().lower().startswith("/фінанси")))
async def cmd_money(message: Message) -> None:
    async with SessionMaker() as session:
        total = (
            await session.execute(
                select(func.coalesce(func.sum(Expense.amount), 0.0)).where(Expense.deleted_at.is_(None))
            )
        ).scalar_one()
        pending = (
            await session.execute(
                select(Expense).where(Expense.approved.is_(False), Expense.deleted_at.is_(None)).limit(10)
            )
        ).scalars().all()
    lines = [f"Витрачено всього: <b>{round(total)} ₴</b>"]
    if pending:
        lines.append("\nЧекають підтвердження:")
        lines += [f"· {e.text or 'витрата'} — {round(e.amount)} {e.currency}" for e in pending]
    await message.answer("\n".join(lines), parse_mode="HTML")


async def _classify_and_confirm(message: Message, db_user: User, text: str, audio_file_id: str | None = None) -> None:
    c = await classify(text, db_user.role)

    # тривога за ключовим словом → миттєвий пуш owner, ще до підтвердження
    if c.keyword_hit and db_user.telegram_id != settings.owner_telegram_id:
        await notify_owner(
            f"🚨 ТРИВОГА від {ROLE_LABELS.get(db_user.role, db_user.role)} ({db_user.name}):\n{c.text}"
        )

    pid = uuid.uuid4().hex[:12]
    _pending[pid] = (text, c, audio_file_id)

    summary = f"{TYPE_LABELS[c.type]} · {CATEGORY_LABELS[c.category]}\n\n{c.text}"
    if c.amount:
        summary += f"\n💵 {c.amount:g} {c.currency or 'UAH'}"
    if c.due:
        summary += f"\n📅 до {c.due}"
    if c.type == "risk":
        summary += f"\n⚠️ рівень: {(c.risk_level or 'med').upper()}"

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Зберегти", callback_data=f"save:{pid}"),
                InlineKeyboardButton(text="✖️ Скасувати", callback_data=f"cancel:{pid}"),
            ]
        ]
    )
    await message.answer(summary, reply_markup=kb)


@router.message(F.voice)
async def on_voice(message: Message, bot: Bot, db_user: User) -> None:
    await bot.send_chat_action(message.chat.id, "typing")
    file = await bot.get_file(message.voice.file_id)
    buf = io.BytesIO()
    await bot.download_file(file.file_path, buf)
    text = await transcribe(buf.getvalue())
    if not text:
        await message.answer("Не зміг розшифрувати голос 😔 Напиши, будь ласка, текстом.")
        return
    await _classify_and_confirm(message, db_user, text, audio_file_id=message.voice.file_id)


@router.message(F.text & ~F.text.startswith("/"))
async def on_text(message: Message, bot: Bot, db_user: User) -> None:
    await bot.send_chat_action(message.chat.id, "typing")
    await _classify_and_confirm(message, db_user, message.text)


@router.callback_query(F.data.startswith("save:"))
async def on_save(query: CallbackQuery, db_user: User) -> None:
    pid = query.data.split(":", 1)[1]
    pending = _pending.pop(pid, None)
    if pending is None:
        await query.answer("Це підтвердження вже неактуальне", show_alert=True)
        return
    raw_text, c, audio_file_id = pending
    async with SessionMaker() as session:
        await save_classified(session, db_user, raw_text, c, audio_file_id=audio_file_id)

    # збережена тривога без ключового слова → теж пуш owner
    if c.type == "risk" and not c.keyword_hit and db_user.telegram_id != settings.owner_telegram_id:
        await notify_owner(
            f"🚨 Тривога ({(c.risk_level or 'med').upper()}) від "
            f"{ROLE_LABELS.get(db_user.role, db_user.role)} ({db_user.name}):\n{c.text}"
        )

    await query.message.edit_text(query.message.text + "\n\n✅ Збережено")
    await query.answer("Збережено")


@router.callback_query(F.data.startswith("cancel:"))
async def on_cancel(query: CallbackQuery) -> None:
    pid = query.data.split(":", 1)[1]
    _pending.pop(pid, None)
    await query.message.edit_text(query.message.text + "\n\n✖️ Скасовано")
    await query.answer("Скасовано")
