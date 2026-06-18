// Мок-дані для перегляду UI в браузері без Telegram і бекенда (тільки DEV).
// Роль для прев'ю: ?role=owner|manager|assistant|driver
const role = new URLSearchParams(location.search).get('role') || 'owner'

const ROLE_LABELS = { owner: 'власник', manager: 'менеджер', assistant: 'асистент', driver: 'водій' }
const NAMES = { owner: 'Ти', manager: 'Маріє', assistant: 'Олю', driver: 'Вікторе' }

export const MOCK = {
  '/api/me': { telegram_id: 1, name: NAMES[role], role, role_label: ROLE_LABELS[role], permissions: {} },
  '/api/dashboard': {
    statuses: { production: 'ok', life: 'warn', money: 'ok', risk: 'crit' },
    counts: { open_tasks: 6, life_open: 3, production_open: 3, risk_active: 2, spent: 12400, budget: 17000, budget_pct: 73 },
    load: 'MED',
    feed: [
      { id: 1, role: 'manager', role_label: 'менеджер', type: 'risk', category: 'production', text: 'Тривога: зрив локації', time: '2026-06-10T09:32:00' },
      { id: 2, role: 'assistant', role_label: 'асистент', type: 'task', category: 'life', text: 'Записати на хімчистку', time: '2026-06-10T09:30:00' },
      { id: 3, role: 'driver', role_label: 'водій', type: 'money', category: 'finance', text: 'Паливо · 1 100 ₴', time: '2026-06-10T08:40:00' },
    ],
  },
  '/api/feed': [
    { id: 1, role: 'manager', role_label: 'менеджер', type: 'status', category: 'production', text: 'Знято 3 сцени з 5', time: '2026-06-10T09:24:00' },
    { id: 2, role: 'manager', role_label: 'менеджер', type: 'risk', category: 'production', text: 'Локація на чт не підтверджена', time: '2026-06-10T09:32:00' },
    { id: 3, role: 'manager', role_label: 'менеджер', type: 'money', category: 'finance', text: 'Оренда обладнання · 4 500 ₴', time: '2026-06-10T09:40:00' },
  ],
  '/api/tasks': [
    { id: 1, category: 'life', text: 'Хімчистка', status: 'open', owner_role: 'assistant', due: null, time: '2026-06-10T09:30:00' },
    { id: 2, category: 'dog', text: 'Ветеринар — дивно їсть', status: 'open', owner_role: 'assistant', due: '2026-06-11', time: '2026-06-10T09:12:00' },
    { id: 3, category: 'production', text: 'Зйомка X — 3/5 сцен', status: 'open', owner_role: 'manager', due: null, time: '2026-06-10T09:24:00' },
    { id: 4, category: 'production', text: 'Реклама Y — дедлайн чт', status: 'open', owner_role: 'manager', due: '2026-06-12', time: '2026-06-09T15:00:00' },
    { id: 5, category: 'logistics', text: 'Забрати оператора → локація', status: 'done', owner_role: 'driver', due: null, time: '2026-06-10T08:00:00' },
    { id: 6, category: 'life', text: 'Продукти', status: 'done', owner_role: 'assistant', due: null, time: '2026-06-10T09:05:00' },
  ],
  '/api/risks': [
    { id: 1, text: 'Локація на чт не підтверджена', level: 'high', resolved: false, keyword_hit: true, owner_role: 'manager', time: '2026-06-10T09:32:00' },
    { id: 2, text: 'Паливо: перевитрата 12%', level: 'med', resolved: false, keyword_hit: false, owner_role: 'driver', time: '2026-06-10T08:40:00' },
    { id: 3, text: 'Оплата підрядника проведена', level: 'low', resolved: true, keyword_hit: false, owner_role: 'manager', time: '2026-06-09T18:00:00' },
  ],
  '/api/money': {
    spent: 12400, budget: 17000, budget_pct: 73, can_approve: role === 'owner',
    expenses: [
      { id: 1, text: 'Оренда обладнання', amount: 4500, currency: 'UAH', approved: false, comment: '', mine: false, owner_role: 'manager', time: '2026-06-10T09:40:00' },
      { id: 2, text: 'Паливо', amount: 1100, currency: 'UAH', approved: true, comment: 'Заправляйся на ОККО — там дешевше', mine: role === 'driver', owner_role: 'driver', time: '2026-06-10T08:40:00' },
      { id: 3, text: 'Продукти', amount: 480, currency: 'UAH', approved: true, comment: '', mine: role === 'assistant', owner_role: 'assistant', time: '2026-06-10T09:05:00' },
    ],
  },
  '/api/budget': {
    budget: 17000,
    items: [
      { id: 1, name: 'Продакшн', amount: 10000 },
      { id: 2, name: 'Побут', amount: 5000 },
      { id: 3, name: 'Паливо', amount: 2000 },
    ],
  },
  '/api/team': [
    { id: 1, name: 'Ти', username: null, role: 'owner', role_label: 'власник', status: 'active', permissions: {} },
    { id: 2, name: 'Марія К.', username: 'maria_pm', role: 'manager', role_label: 'менеджер', status: 'active', permissions: {} },
    { id: 3, name: 'Оля Л.', username: 'olya', role: 'assistant', role_label: 'асистент', status: 'active', permissions: {} },
    { id: 4, name: 'Віктор Д.', username: 'viktor_d', role: 'driver', role_label: 'водій', status: 'invited', permissions: {} },
  ],
}

export function mockResponse(path) {
  const clean = path.split('?')[0]
  if (clean in MOCK) return MOCK[clean]
  if (clean === '/api/ingest') return { type: 'task', category: 'life', text: 'Демо-запис збережено' }
  if (clean === '/api/ingest/voice/preview')
    return { transcript: 'Ну, тут це, треба купити корм псу, ну, десь до завтра', text: 'Купити корм псу до завтра', type: 'task', category: 'dog' }
  if (clean === '/api/ingest/plan' || clean === '/api/ingest/voice/plan')
    return {
      transcript: 'Ну треба купити корм псу, і домовитись за поїздку на завтра, і нагадати менеджеру про монтаж',
      tasks: [
        { text: 'купити корм псу', assignee: 'assistant', category: 'dog' },
        { text: 'домовитись за поїздку на завтра', assignee: 'driver', category: 'logistics' },
        { text: 'нагадати про монтаж', assignee: 'manager', category: 'production' },
      ],
    }
  if (clean === '/api/ingest/tasks') return { count: 2 }
  return { ok: true }
}
