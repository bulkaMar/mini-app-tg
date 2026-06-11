"""AI-класифікатор: Шар 1 — regex по ключових словах тривог, Шар 2 — Claude.

Graceful degradation: якщо Claude недоступний — повертаємо результат
на основі regex і ролі відправника, бот не падає.
"""

import logging
import re
from typing import Literal

from anthropic import AsyncAnthropic
from pydantic import BaseModel

from .config import settings

log = logging.getLogger(__name__)

ALARM_KEYWORDS = ["зрив", "не встигаю", "проблема", "терміново", "горить", "критично"]
ALARM_RE = re.compile("|".join(re.escape(k) for k in ALARM_KEYWORDS), re.IGNORECASE)

# дефолтна категорія за роллю відправника (для fallback)
ROLE_DEFAULT_CATEGORY = {
    "owner": "production",
    "manager": "production",
    "assistant": "life",
    "driver": "logistics",
}


class Classification(BaseModel):
    type: Literal["task", "risk", "money", "status"]
    category: Literal["production", "life", "dog", "finance", "logistics"]
    text: str
    amount: float | None = None
    currency: str | None = None
    risk_level: Literal["low", "med", "high"] | None = None
    due: str | None = None  # ISO-дата, якщо є дедлайн
    owner: Literal["me", "manager", "assistant", "driver"] | None = None
    keyword_hit: bool = False  # заповнюється сервісом, не моделлю


SYSTEM_PROMPT = """Ти — диспетчер продакшн-команди. Тобі надходять сирі повідомлення \
(укр/рос/суржик, надиктовані, зі словами-паразитами). Розклади повідомлення в структуру.

Правила:
- type: task (справа/доручення) | risk (проблема, загроза, термінове) | money (витрата, оплата) | status (звіт про стан, прогрес)
- category: production (зйомки, проєкти, контракти) | life (побут, особисте, здоровʼя) | dog (все про собаку) | finance (гроші) | logistics (поїздки, подачі, паливо, пробіг)
- text: чисте коротке формулювання без води та слів-паразитів, мовою оригіналу
- amount + currency: тільки якщо в тексті є сума грошей (за замовчуванням UAH)
- risk_level: тільки для type=risk (low/med/high за серйозністю)
- due: ISO-дата YYYY-MM-DD, тільки якщо є явний дедлайн
- owner: кому це стосується (me/manager/assistant/driver), тільки якщо ясно з тексту
- type=money завжди category=finance"""


def regex_fallback(raw_text: str, sender_role: str) -> Classification:
    """Класифікація без LLM: ключові слова тривог + дефолти за роллю."""
    hit = bool(ALARM_RE.search(raw_text))
    if hit:
        return Classification(
            type="risk",
            category=ROLE_DEFAULT_CATEGORY.get(sender_role, "production"),
            text=raw_text.strip(),
            risk_level="high",
            keyword_hit=True,
        )
    return Classification(
        type="task",
        category=ROLE_DEFAULT_CATEGORY.get(sender_role, "life"),
        text=raw_text.strip(),
    )


async def classify(raw_text: str, sender_role: str) -> Classification:
    keyword_hit = bool(ALARM_RE.search(raw_text))

    result: Classification | None = None
    if settings.anthropic_api_key:
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        for attempt in range(2):  # один retry на невалідну відповідь
            try:
                response = await client.messages.parse(
                    model=settings.claude_model,
                    max_tokens=1024,
                    system=SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": f"Роль відправника: {sender_role}\n\n{raw_text}"}],
                    output_format=Classification,
                )
                result = response.parsed_output
                if result is not None:
                    break
            except Exception:
                log.exception("Classifier LLM call failed (attempt %s)", attempt + 1)

    if result is None:
        result = regex_fallback(raw_text, sender_role)

    # якщо спрацювало слово-тривога, а LLM не позначив risk — підвищуємо до risk(high)
    if keyword_hit:
        result.keyword_hit = True
        if result.type != "risk":
            result.type = "risk"
            result.risk_level = "high"
        elif result.risk_level is None:
            result.risk_level = "high"
    return result
