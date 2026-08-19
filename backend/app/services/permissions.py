"""Один «вартовий»: усі рішення «хто що бачить» ухвалюються тут (0.9).

Раніше кожен ендпоінт вирішував сам. Поки правил було два, це працювало;
з тумблерами по кожній людині один забутий ендпоінт означав би діру —
тумблер вимкнено, а дані все одно віддаються. Тому всі перевірки зведені
сюди, а ендпоінти лише питають.

Три речі:

- **Розділи (0.5, 0.7).** У кожного розділу три стани:
  `full` — усе; `list` — лише робочий список, без зведення й підсумків;
  `none` — розділ закритий. Стан «list» має сенс не всюди: у «Тривогах»
  чи «Потоці» зведення немає, тож там він дорівнює `full`.

- **Поля (0.6).** Поки одне: чи показувати суми. Людина може бачити
  витрату («Оренда обладнання»), але не її суму.

- **Запасні значення.** Якщо власниця нічого не налаштувала, людина
  отримує рівно те, що мала до появи тумблерів — щоб оновлення нічого
  не змінило мовчки.

Власниці обмеження не стосуються ніколи.
"""

from fastapi import HTTPException

from ..models import User
from .access import is_owner

# розділи застосунку, які можна відкривати чи закривати
SECTIONS = ("tasks", "finance", "risks", "feed", "team")
SECTION_LABELS = {
    "tasks": "Задачі",
    "finance": "Фінанси",
    "risks": "Тривоги",
    "feed": "Потік",
    "team": "Люди",  # ключ лишається «team» — на нього спираються збережені дозволи
}
# де стан «тільки список» справді щось змінює
HAS_SUMMARY = ("tasks", "finance")

STATES = ("full", "list", "none")

FIELDS = ("amounts",)
FIELD_LABELS = {"amounts": "Суми"}

# що людина мала до появи тумблерів — саме це й лишається за замовчуванням
_DEFAULT = {"tasks": "full", "finance": "full", "risks": "full", "feed": "full", "team": "none"}


def sections_of(user: User) -> dict[str, str]:
    """Стан кожного розділу для цієї людини."""
    if is_owner(user):
        return {s: "full" for s in SECTIONS}
    saved = ((user.permissions or {}).get("sections") or {})
    out = {}
    for s in SECTIONS:
        v = saved.get(s)
        out[s] = v if v in STATES else _DEFAULT[s]
        if out[s] == "list" and s not in HAS_SUMMARY:
            out[s] = "full"  # у цьому розділі зведення немає — стан нічого не змінює
    return out


def fields_of(user: User) -> dict[str, bool]:
    """Які поля людині видно."""
    if is_owner(user):
        return {f: True for f in FIELDS}
    saved = ((user.permissions or {}).get("fields") or {})
    return {f: bool(saved.get(f, True)) for f in FIELDS}


def state_of(user: User, section: str) -> str:
    return sections_of(user).get(section, "none")


def can_open(user: User, section: str) -> bool:
    """Чи відкритий розділ узагалі."""
    return state_of(user, section) != "none"


def sees_summary(user: User, section: str) -> bool:
    """Чи показувати зведення: суми, бюджет, відсотки, діаграми."""
    return state_of(user, section) == "full"


def sees_amounts(user: User) -> bool:
    return fields_of(user).get("amounts", True)


def require_section(user: User, section: str) -> None:
    """Єдина точка заборони — щоб текст помилки був однаковий скрізь."""
    if not can_open(user, section):
        raise HTTPException(
            status_code=403,
            detail=f"Розділ «{SECTION_LABELS.get(section, section)}» вам закритий",
        )


def normalize(sections, fields) -> dict:
    """Готує блок дозволів із того, що прийшло з форми."""
    out_s = {}
    for s in SECTIONS:
        v = (sections or {}).get(s)
        if v in STATES:
            out_s[s] = "full" if (v == "list" and s not in HAS_SUMMARY) else v
        else:
            out_s[s] = _DEFAULT[s]
    out_f = {f: bool((fields or {}).get(f, True)) for f in FIELDS}
    return {"sections": out_s, "fields": out_f}
