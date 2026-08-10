"""Обмеження доступу в часі — спільне для всіх розділів.

Дві незалежні речі:

1. `access_until` — доки взагалі працює вхід (0.10–0.11). Настав час — людина
   більше не заходить, дані лишаються, власниця може продовжити або зняти строк.

2. `visible_from` — з якого моменту людині видно записи (0.12). Прив'язано до
   позначки «тимчасовий»: тимчасовий бачить лише те, що зʼявилось із дня, коли
   його додали; постійний бачить усе, що йому відкрито, разом зі старим.
   Одне правило на задачі, стрічку, тривоги й фінанси — щоб не було так, що
   в одному розділі архів закритий, а в іншому ні.

Власниці обидва обмеження не стосуються ніколи.
"""

from datetime import datetime, timedelta, timezone

from ..models import User

# готові варіанти строку доступу для форми (години)
ACCESS_PRESETS = (12, 24, 72, 168)
MAX_ACCESS_HOURS = 24 * 365  # рік — далі вже безстроково


def is_owner(user: User) -> bool:
    return getattr(user, "base_role", user.role) == "owner"


def _aware(dt: datetime | None) -> datetime | None:
    """SQLite віддає час без зони — доводимо до UTC, щоб порівняння не падало."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def access_expired(user: User) -> bool:
    """Чи вичерпався строк доступу."""
    if is_owner(user):
        return False
    until = _aware(getattr(user, "access_until", None))
    return until is not None and until <= datetime.now(timezone.utc)


def visible_since(user: User) -> datetime | None:
    """З якого моменту людині видно записи. None — без обмеження."""
    if is_owner(user) or user.employment != "temporary":
        return None
    return _aware(user.visible_from)


def parse_access_hours(hours) -> datetime | None:
    """Години зі списку/форми → момент, коли вхід анулюється. 0 або пусто — безстроково."""
    if hours in (None, "", 0, "0"):
        return None
    try:
        h = int(hours)
    except (TypeError, ValueError):
        return None
    if h <= 0:
        return None
    return datetime.now(timezone.utc) + timedelta(hours=min(h, MAX_ACCESS_HOURS))
