from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Float, Integer, JSON, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    username: Mapped[str | None] = mapped_column(String(120), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="assistant")  # owner|manager|assistant|driver
    permissions: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|invited
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Message(Base):
    """Лог усіх сирих вхідних — історія/контекст."""

    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, index=True)
    sender_role: Mapped[str] = mapped_column(String(20))
    raw_text: Mapped[str] = mapped_column(Text)
    clean_text: Mapped[str] = mapped_column(Text, default="")
    audio_file_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    classified_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    category: Mapped[str | None] = mapped_column(String(20), nullable=True)
    target_role: Mapped[str | None] = mapped_column(String(20), nullable=True)  # кому адресовано
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Task(Base):
    """Проєкти / Побут / Пес / Логістика."""

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, index=True)
    category: Mapped[str] = mapped_column(String(20))  # production|life|dog|logistics
    text: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default="open")  # open|done
    owner_role: Mapped[str] = mapped_column(String(20))
    due: Mapped[date | None] = mapped_column(Date, nullable=True)
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # коли виконано
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # автоматично оновлюється при будь-якій правці → SSE бачить зміну тексту/дедлайну наживо
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Risk(Base):
    __tablename__ = "risks"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, index=True)
    text: Mapped[str] = mapped_column(Text)
    level: Mapped[str] = mapped_column(String(10), default="med")  # low|med|high
    action: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_role: Mapped[str] = mapped_column(String(20))
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    keyword_hit: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, index=True)
    category: Mapped[str] = mapped_column(String(20), default="finance")
    text: Mapped[str] = mapped_column(Text, default="")
    amount: Mapped[float] = mapped_column(Float, default=0)
    currency: Mapped[str] = mapped_column(String(10), default="UAH")
    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    approver_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # коли востаннє підтверджено
    comment: Mapped[str] = mapped_column(Text, default="")  # напр. «наступного разу купи дешевше»
    owner_role: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # автоматично оновлюється при будь-якій правці → SSE бачить зміну суми/коментаря наживо
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BudgetItem(Base):
    """Секції бюджету місяця («на що» + сума). Сума секцій = бюджет; якщо порожньо — MONTHLY_BUDGET з .env."""

    __tablename__ = "budget_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    amount: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DailySnapshot(Base):
    """Кеш статусів дня для швидкої панелі."""

    __tablename__ = "daily_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, unique=True, index=True)
    production_status: Mapped[str] = mapped_column(String(10), default="ok")  # ok|warn|crit
    life_status: Mapped[str] = mapped_column(String(10), default="ok")
    budget_status: Mapped[str] = mapped_column(String(10), default="ok")
    risk_count: Mapped[int] = mapped_column(Integer, default=0)
    load: Mapped[str] = mapped_column(String(10), default="LOW")  # LOW|MED|HIGH
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
