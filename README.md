# CanniBot

Telegram Mini App + бот для продакшн-команди. Учасники (менеджер, асистент, водій)
диктують або пишуть — AI (Claude) прибирає воду, класифікує запис
(задача / тривога / витрата / статус) і кладе в БД. Власник відкриває панель
і за 3 секунди бачить стан усіх напрямків.

## Структура

```
backend/            Python: aiogram 3 бот + FastAPI + SQLAlchemy
  app/
    bot/            бот: whitelist, текст/голос → класифікація → підтвердження
    api/            REST для Mini App: initData auth, ролі, ендпоінти
    services/       saver, transcribe (Whisper), status (панель), notify (пуш owner)
    classifier.py   Шар 1 regex (слова-тривоги) + Шар 2 Claude + fallback
    models.py       users, messages, tasks, risks, expenses, daily_snapshots
frontend/           Mini App: Vite + React, екрани під роль
```

## Запуск (дев)

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # вписати BOT_TOKEN, ANTHROPIC_API_KEY, OWNER_TELEGRAM_ID...

# термінал 1 — бот (polling)
python -m app.bot

# термінал 2 — API
uvicorn app.api.main:app --reload --port 8000
```

БД у дев-режимі — SQLite (`pult.db`), таблиці створюються автоматично.
Для прод — PostgreSQL у `DATABASE_URL` + Alembic-міграції.

### Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

**Прев'ю UI без Telegram:** у dev-режимі без initData показуються мок-дані.
Роль перемикається параметром: `http://localhost:5173/?role=owner|manager|assistant|driver`.

### Підключення до Telegram

1. У @BotFather: `/newbot` → токен у `.env`.
2. Задеплоїти frontend (Vercel/Cloudflare Pages, HTTPS обовʼязково) → URL у `WEBAPP_URL`.
3. У @BotFather: Bot Settings → Menu Button → вказати URL Mini App.
4. Свій `telegram_id` → `OWNER_TELEGRAM_ID` (дізнатись через @userinfobot).
5. Команда додається з екрана «Команда» (owner) за @username — учасник
   активується після `/start` у боті.

## Ролі

| Роль      | Бачить / вносить                                  |
|-----------|---------------------------------------------------|
| owner     | усе + керування командою, approve витрат          |
| manager   | Проєкти: статуси зйомок, тривоги, витрати проєкту |
| assistant | Побут, Пес, побутові витрати                      |
| driver    | Логістика: поїздки, паливо                        |

Роль перевіряється на кожному запиті API (initData → HMAC-SHA256 → user → role),
фронту не довіряємо.

## Що в MVP (Етапи 0–3 за специфікацією)

- ✅ Текст/голос у бота → Whisper → Claude-класифікатор → підтвердження → БД
- ✅ Слова-тривоги (зрив, терміново, горить…) → миттєвий пуш owner
- ✅ Graceful degradation: без Claude/Whisper працює regex-fallback, бот не падає
- ✅ Mini App: initData-валідація, роутинг за роллю, диктування з кожного екрана
- ✅ Панель owner: 4 статуси 🟢🟡🔴 + Темп + стрічка «Надійшло»
- ✅ Команда: список, інвайт за @username, ролі
- ✅ Approve витрат кнопкою

## Далі (Етапи 4–6)

- Точкові права (тумблери) на екрані «Команда» — модель `permissions` уже в БД
- APScheduler: дайджест о 9:00, нагадування про дедлайни, перерахунок `daily_snapshots`
- Прод: webhook замість polling, Sentry, rate limiting, бекапи, Alembic-міграції
