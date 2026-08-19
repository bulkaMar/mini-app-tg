// Мок-дані для перегляду UI в браузері без Telegram і бекенда (тільки DEV).
// Роль для прев'ю: ?role=owner|manager|assistant|driver
const role = new URLSearchParams(location.search).get('role') || 'owner'

const ROLE_LABELS = { owner: 'власник', manager: 'менеджер', assistant: 'асистент', driver: 'водій' }
const NAMES = { owner: 'Ти', manager: 'Маріє', assistant: 'Олю', driver: 'Вікторе' }
// які розділи задач доступні ролі (дзеркало ROLE_CATEGORIES на бекенді)
const TASK_CATS = {
  owner: ['production', 'life', 'dog', 'logistics'],
  manager: ['production'],
  assistant: ['life', 'dog'],
  driver: ['logistics'],
}

export const MOCK = {
  '/api/me': {
    id: { owner: 1, manager: 2, assistant: 3, driver: 4 }[role] || 1,
    telegram_id: 1, name: NAMES[role], role, role_label: ROLE_LABELS[role], base: role,
    permissions: {}, task_categories: TASK_CATS[role] || [],
    sections: { tasks: 'full', finance: 'full', risks: 'full', feed: 'full', team: role === 'owner' ? 'full' : 'none' },
    fields: { amounts: true },
  },
  '/api/roles': {
    roles: [
      { id: 1, key: 'owner', label: 'Власник', color: 'ink', base: 'owner', is_system: true, members: 1 },
      { id: 2, key: 'coowner', label: 'Співвласник', color: 'ink', base: 'manager', is_system: false, members: 0 },
      { id: 3, key: 'manager', label: 'Менеджер', color: 'blue', base: 'manager', is_system: true, members: 1 },
      { id: 4, key: 'assistant', label: 'Асистент', color: 'green', base: 'assistant', is_system: true, members: 1 },
      { id: 5, key: 'driver', label: 'Водій', color: 'gold', base: 'driver', is_system: true, members: 1 },
      { id: 6, key: 'photographer', label: 'Фотограф', color: 'orange', base: 'manager', is_system: false, members: 0 },
      { id: 7, key: 'makeup', label: 'Візажист', color: 'red', base: 'assistant', is_system: false, members: 0 },
      { id: 8, key: 'helper1', label: 'Помічник 1', color: 'muted', base: 'assistant', is_system: false, members: 0 },
    ],
    can_manage: role === 'owner',
  },
  '/api/finance/sheets': {
    sheets: [
      { id: 1, name: 'Загальний бюджет', is_general: true },
      { id: 2, name: 'Зйомка Nike', is_general: false },
    ],
    can_manage: role === 'owner',
  },
  '/api/dictionaries': {
    categories: [
      { id: 1, key: 'production', label: 'Проєкти', icon: 'film', color: 'blue', roles: ['manager'], is_system: true, can_use: TASK_CATS[role]?.includes('production') },
      { id: 2, key: 'life', label: 'Побут', icon: 'home', color: 'green', roles: ['assistant'], is_system: true, can_use: TASK_CATS[role]?.includes('life') },
      { id: 3, key: 'dog', label: 'Пес', icon: 'dog', color: 'green', roles: ['assistant'], is_system: true, can_use: TASK_CATS[role]?.includes('dog') },
      { id: 4, key: 'logistics', label: 'Поїздки', icon: 'pin', color: 'gold', roles: ['driver'], is_system: true, can_use: TASK_CATS[role]?.includes('logistics') },
      { id: 5, key: 'c_demo01', label: 'Реклама', icon: 'pulse', color: 'orange', roles: ['manager'], is_system: false, can_use: role === 'owner' || role === 'manager' },
    ].filter((c) => role === 'owner' || c.can_use),
    priorities: [
      { id: 1, key: 'urgent', label: 'Супер термінова', icon: 'flame', color: 'red', rank: 0, is_default: false, is_system: true },
      { id: 2, key: 'high', label: 'Важлива', icon: 'up', color: 'warn', rank: 10, is_default: false, is_system: true },
      { id: 3, key: 'normal', label: 'Звичайна', icon: null, color: 'muted', rank: 50, is_default: true, is_system: true },
    ],
  },
  '/api/dashboard': {
    statuses: { production: 'ok', life: 'warn', logistics: 'warn', money: 'ok', risk: 'crit' },
    counts: { open_tasks: 6, life_open: 3, production_open: 3, logistics_open: 2, risk_active: 2, spent: 12400, budget: 17000, budget_pct: 73, by_category: { production: 3, life: 2, dog: 1, logistics: 2, c_demo01: 1 } },
    load: 'MED',
  },
  '/api/feed': [
    { id: 5, role: 'owner', role_label: 'власник', target_role: 'manager', type: 'task', category: 'production', text: 'Нагадати про монтаж', time: '2026-06-10T09:52:00' },
    { id: 1, role: 'manager', role_label: 'менеджер', target_role: 'owner', type: 'status', category: 'production', text: 'Знято 3 сцени з 5', time: '2026-06-10T09:24:00' },
    { id: 2, role: 'manager', role_label: 'менеджер', target_role: 'owner', type: 'risk', category: 'production', text: 'Локація на чт не підтверджена', time: '2026-06-10T09:32:00' },
    { id: 3, role: 'manager', role_label: 'менеджер', target_role: 'owner', type: 'money', category: 'finance', text: 'Оренда обладнання · 4 500 ₴', time: '2026-06-10T09:40:00' },
  ],
  '/api/tasks': [
    { id: 2, category: 'dog', text: 'Ветеринар — дивно їсть', status: 'open', priority: 'urgent', owner_role: 'assistant', due: '2026-06-11', time: '2026-06-10T09:12:00', items: [], items_total: 0, items_done: 0 },
    {
      id: 4, category: 'production', text: 'Реклама Y — дедлайн чт', status: 'open', priority: 'high',
      owner_role: 'manager', due: '2026-06-12T14:30', time: '2026-06-09T15:00:00',
      items: [
        { id: 1, kind: 'subtask', text: 'Затвердити сценарій', done: true },
        { id: 2, kind: 'subtask', text: 'Знайти локацію', done: false },
        { id: 3, kind: 'check', text: 'Штатив', done: true },
        { id: 4, kind: 'check', text: 'Запасні батареї', done: false },
      ],
      items_total: 4, items_done: 2,
    },
    { id: 1, category: 'life', text: 'Хімчистка', status: 'open', priority: 'normal', owner_role: 'assistant', due: null, time: '2026-06-10T09:30:00' },
    { id: 3, category: 'production', text: 'Зйомка X — 3/5 сцен', status: 'open', priority: 'normal', owner_role: 'manager', due: null, time: '2026-06-10T09:24:00' },
    { id: 5, category: 'logistics', text: 'Забрати оператора → локація', status: 'done', priority: 'normal', owner_role: 'driver', due: null, done_at: '2026-06-10T10:30:00', time: '2026-06-10T08:00:00' },
    { id: 6, category: 'life', text: 'Продукти', status: 'done', priority: 'normal', owner_role: 'assistant', due: null, done_at: '2026-06-10T11:05:00', time: '2026-06-10T09:05:00' },
  ],
  '/api/risks': [
    { id: 1, text: 'Локація на чт не підтверджена', level: 'high', resolved: false, keyword_hit: true, owner_role: 'manager', time: '2026-06-10T09:32:00' },
    { id: 2, text: 'Паливо: перевитрата 12%', level: 'med', resolved: false, keyword_hit: false, owner_role: 'driver', time: '2026-06-10T08:40:00' },
    { id: 3, text: 'Оплата підрядника проведена', level: 'low', resolved: true, keyword_hit: false, owner_role: 'manager', time: '2026-06-09T18:00:00' },
  ],
  '/api/money': {
    sheet_id: 1, summary: true, amounts: true, spent: 12400, budget: 17000, budget_pct: 73, can_approve: role === 'owner',
    expenses: [
      { id: 1, sheet_id: 2, text: 'Оренда обладнання', amount: 4500, currency: 'UAH', approved: false, approved_at: null, comment: '', mine: false, owner_role: 'manager', time: '2026-06-10T09:40:00' },
      { id: 2, sheet_id: 1, text: 'Паливо', amount: 1100, currency: 'UAH', approved: true, approved_at: '2026-06-10T18:25:00', comment: 'Заправляйся на ОККО — там дешевше', mine: role === 'driver', owner_role: 'driver', time: '2026-06-10T08:40:00' },
      { id: 3, sheet_id: 1, text: 'Продукти', amount: 480, currency: 'UAH', approved: true, approved_at: '2026-06-10T12:10:00', comment: '', mine: role === 'assistant', owner_role: 'assistant', time: '2026-06-10T09:05:00' },
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
    { id: 1, name: 'Ти', username: null, phone: null, role: 'owner', role_label: 'власник', status: 'active', permissions: {}, employment: 'permanent', visible_from: null, access_until: null, access_expired: false },
    { id: 2, name: 'Марія К.', username: 'maria_pm', phone: '+380671112233', role: 'manager', role_label: 'менеджер', status: 'active', permissions: {} },
    { id: 3, name: 'Оля Л.', username: 'olya', phone: null, role: 'assistant', role_label: 'асистент', status: 'active', permissions: {} },
    { id: 4, name: 'Віктор Д.', username: 'viktor_d', phone: '+380509998877', role: 'driver', role_label: 'водій', status: 'invited', permissions: {}, employment: 'temporary', visible_from: '2026-06-01T00:00:00', access_until: '2026-06-20T18:00:00', access_expired: false },
  ],
  '/api/contacts': [
    { id: 1, name: 'Іра Гример', title: 'гример', phone: '+380501112233', username: 'ira_makeup', note: '1200 грн/зміна', time: '2026-05-04T10:00:00' },
    { id: 2, name: 'Світло-Прокат', title: 'оренда світла', phone: '+380442223344', username: null, note: '', time: '2026-05-04T10:00:00' },
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
        { text: 'купити корм псу', assignee: 'assistant', category: 'dog', priority: 'normal' },
        { text: 'домовитись за поїздку на завтра', assignee: 'driver', category: 'logistics', priority: 'high' },
        { text: 'нагадати про монтаж', assignee: 'manager', category: 'production', priority: 'normal' },
      ],
    }
  if (clean === '/api/ingest/tasks') return { count: 2 }
  if (clean.startsWith('/api/people/')) {
    const m = MOCK['/api/team'].find((x) => String(x.id) === clean.split('/')[3]) || MOCK['/api/team'][1]
    return {
      ...m,
      since: '2026-03-01T09:00:00',
      stats: { open: 2, done: 7, expenses: 3, spent: 4200 },
      tasks: MOCK['/api/tasks'].filter((t) => t.status === 'open').slice(0, 2),
      history: [
        { type: 'task', text: 'Змонтувати ролик', time: '2026-06-10T18:20:00' },
        { type: 'expense', text: 'Оренда обладнання', amount: 3200, time: '2026-06-09T12:00:00' },
        { type: 'report', text: 'Зйомка пройшла, матеріал на диску', time: '2026-06-08T20:10:00' },
      ],
    }
  }
  return { ok: true }
}
