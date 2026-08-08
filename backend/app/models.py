from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Float, Integer, JSON, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Workspace(Base):
    """Ізольований простір одного власника: своя команда й дані."""

    __tablename__ = "workspaces"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="Робочий простір")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    telegram_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    username: Mapped[str | None] = mapped_column(String(120), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="assistant")  # owner|manager|assistant|driver
    permissions: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|invited
    # постійний бачить лист цілком; тимчасовий — лише те, що зʼявилось із visible_from
    employment: Mapped[str] = mapped_column(String(10), default="permanent")  # permanent|temporary
    visible_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Role(Base):
    """Ролі як дані. `base` — «поводиться як»: визначає екран і базові теми,
    поки не зʼявились тумблери розділів по кожній людині (0.5–0.7).
    Системні (власник/менеджер/асистент/водій) перейменовуються, але не
    видаляються — на них тримається код роздачі задач і сповіщень."""

    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    key: Mapped[str] = mapped_column(String(20), index=True)
    label: Mapped[str] = mapped_column(String(60))
    color: Mapped[str] = mapped_column(String(20), default="muted")
    base: Mapped[str] = mapped_column(String(20), default="assistant")  # owner|manager|assistant|driver
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    sort: Mapped[int] = mapped_column(Integer, default=100)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Message(Base):
    """Лог усіх сирих вхідних — історія/контекст."""

    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
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
    workspace_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, index=True)
    category: Mapped[str] = mapped_column(String(20))  # production|life|dog|logistics
    text: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default="open")  # open|done
    # важливість: normal (звичайна) | high (важлива) | urgent (супер термінова).
    # На старих записах може бути NULL — читаємо як "normal".
    priority: Mapped[str] = mapped_column(String(10), default="normal")
    owner_role: Mapped[str] = mapped_column(String(20))  # кому доручено (роль виконавця)
    due: Mapped[date | None] = mapped_column(Date, nullable=True)  # legacy: лишився для міграції
    # дедлайн із часом. Зберігаємо «настінний» час без часової зони: команда в одному
    # поясі, тож перетворення тільки заплутали б. due_time_set розрізняє
    # «10 серпня о 14:30» і «10 серпня, будь-коли за день».
    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    due_time_set: Mapped[bool] = mapped_column(Boolean, default=False)
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # коли виконано
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # автоматично оновлюється при будь-якій правці → SSE бачить зміну тексту/дедлайну наживо
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TaskItem(Base):
    """Пункти всередині задачі: підзадачі (нумерований список) і чекліст (галочки).
    Одна механіка, різний вигляд — kind вирішує, у якому списку показувати."""

    __tablename__ = "task_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    task_id: Mapped[int] = mapped_column(Integer, index=True)
    kind: Mapped[str] = mapped_column(String(10), default="subtask")  # subtask|check
    text: Mapped[str] = mapped_column(Text)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Risk(Base):
    __tablename__ = "risks"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
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
    workspace_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    sheet_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
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


class TaskCategory(Base):
    """Розділи задач. Системні (Проєкти/Побут/Пес/Поїздки) не можна видалити —
    на них побудовані екрани; свої можна додавати й видаляти."""

    __tablename__ = "task_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    key: Mapped[str] = mapped_column(String(20), index=True)
    label: Mapped[str] = mapped_column(String(60))
    icon: Mapped[str] = mapped_column(String(30), default="task")
    color: Mapped[str] = mapped_column(String(20), default="orange")
    roles: Mapped[list] = mapped_column(JSON, default=list)  # хто бачить (власник — завжди)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    sort: Mapped[int] = mapped_column(Integer, default=100)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TaskPriority(Base):
    """Рівні важливості. rank: менше число — важливіше (для сортування списків).
    Рівень за замовчуванням (is_default) видалити не можна — на нього падають
    задачі, у яких рівень прибрали."""

    __tablename__ = "task_priorities"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    key: Mapped[str] = mapped_column(String(10), index=True)
    label: Mapped[str] = mapped_column(String(60))
    icon: Mapped[str | None] = mapped_column(String(30), nullable=True)
    color: Mapped[str] = mapped_column(String(20), default="muted")
    rank: Mapped[int] = mapped_column(Integer, default=50)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ExpenseSheet(Base):
    """Лист витрат: «Загальний бюджет» (системний, не видаляється) + листи під зйомки.
    У кожного листа свої витрати і свій бюджет; людині можна відкрити не всі."""

    __tablename__ = "expense_sheets"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    is_general: Mapped[bool] = mapped_column(Boolean, default=False)  # куди падає все за замовчуванням
    sort: Mapped[int] = mapped_column(Integer, default=100)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BudgetItem(Base):
    """Секції бюджету місяця («на що» + сума). Сума секцій = бюджет; якщо порожньо — MONTHLY_BUDGET з .env."""

    __tablename__ = "budget_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    sheet_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    amount: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DailySnapshot(Base):
    """Кеш статусів дня для швидкої панелі."""

    __tablename__ = "daily_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    production_status: Mapped[str] = mapped_column(String(10), default="ok")  # ok|warn|crit
    life_status: Mapped[str] = mapped_column(String(10), default="ok")
    budget_status: Mapped[str] = mapped_column(String(10), default="ok")
    risk_count: Mapped[int] = mapped_column(Integer, default=0)
    load: Mapped[str] = mapped_column(String(10), default="LOW")  # LOW|MED|HIGH
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
