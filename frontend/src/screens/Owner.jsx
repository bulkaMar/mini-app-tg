import { useCallback, useEffect, useState } from 'react'
import { get, patch, post, put } from '../api'
import {
  CenterModal, ConfirmDialog, Dictate, DonutChart, Entry, ExpenseSheet, Header, Icons, Meter, MoneyInput, NewTaskModal, NotificationBell, ItemsBadge, PriorityMark, ROLE_BADGE, ROLE_COLOR, SwipeBack, TabBar, TaskSheet, ALL_SHEETS, SheetPicker, SheetsModal, byPriority, colorVar, fmtDue, isOverdue,
  useSheetSelection, useSheets, Field, Segmented, directionLabel, findCat, fmtTime,
  useDictionaries, useFeedUnread, useLiveSel, usePoll, useToast,
} from '../components'
import Dictionaries from './Dictionaries'

const LOAD_LABEL = { LOW: 'НИЗЬКИЙ', MED: 'СЕРЕДНІЙ', HIGH: 'ВИСОКИЙ' }
const LOAD_PCT = { LOW: 25, MED: 55, HIGH: 90 }
// українське відмінювання: 1 справа · 3 справи · 8 справ
const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100
  if (a === 1 && b !== 11) return one
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few
  return many
}
const spravy = (n) => `${n} ${plural(n, 'справа', 'справи', 'справ')}`
const aktyvni = (n) => `${n} ${plural(n, 'активна', 'активні', 'активних')}`
const poyizdky = (n) => `${n} ${plural(n, 'поїздка', 'поїздки', 'поїздок')}`
const MEMBER_ROLES = [
  { value: 'manager', label: 'Менеджер' },
  { value: 'assistant', label: 'Асистент' },
  { value: 'driver', label: 'Водій' },
]

const EMPLOYMENT = [
  { value: 'permanent', label: 'Постійний' },
  { value: 'temporary', label: 'Тимчасовий' },
]
const FINANCE_SCOPE = [
  { value: 'all', label: 'Усі листи' },
  { value: 'sheets', label: 'Вибрані' },
]

/* Зайнятість + які листи витрат людині відкриті. Використовується і при
   додаванні, і при редагуванні учасника. */
function AccessFields({ employment, setEmployment, scope, setScope, picked, setPicked }) {
  const { sheets } = useSheets()
  const toggle = (id) =>
    setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])

  return (
    <>
      <Field label="Зайнятість">
        <Segmented options={EMPLOYMENT} value={employment} onChange={setEmployment} />
        <div className="due-hint">
          {employment === 'temporary'
            ? 'Бачитиме лише те, що зʼявиться з дня, коли ви його додали'
            : 'Бачитиме відкриті листи цілком, разом зі старими записами'}
        </div>
      </Field>
      <Field label="Доступ до фінансів">
        <Segmented options={FINANCE_SCOPE} value={scope} onChange={setScope} />
      </Field>
      {scope === 'sheets' && (
        <Field label="Які саме листи">
          <div className="seg">
            {sheets.map((sh) => (
              <button key={sh.id} type="button"
                className={`seg-btn ${picked.includes(sh.id) ? 'on' : ''}`}
                style={picked.includes(sh.id)
                  ? { background: 'var(--orange)', borderColor: 'var(--orange)' } : undefined}
                onClick={() => toggle(sh.id)}>
                {sh.name}
              </button>
            ))}
          </div>
          {picked.length === 0 && <div className="due-hint">Не обрано жодного — фінансів не побачить</div>}
        </Field>
      )}
    </>
  )
}

// ім'я активного учасника певної ролі (перше слово) + підпис у шапці сторінки
const memberName = (team, role) => {
  const u = (team || []).find((m) => m.role === role && m.status === 'active')
  return u && u.name ? u.name.split(' ')[0] : ''
}
const roleSub = (role, name, tail) => `${name ? `${role} · ${name}` : role} · ${tail}`

// підпис «хто додав» (роль · ім'я) для витрати
const ROLE_WORD = { owner: 'Власник', manager: 'Менеджер', assistant: 'Асистент', driver: 'Водій' }
const authorLabel = (role, team) => {
  const n = memberName(team, role)
  return n ? `${ROLE_WORD[role] || role} · ${n}` : (ROLE_WORD[role] || role)
}

export default function Owner({ me }) {
  const [tab, setTab] = useState('home')
  const [view, setView] = useState(null) // дрілдаун: production | life | risks | money
  const [refreshKey, setRefreshKey] = useState(0) // після диктовки перезавантажуємо активний екран
  const { count: flowUnread, markSeen: markFlowSeen } = useFeedUnread(me)
  // поки відкрито «Потік» — лічильник нових скидаємо (і при нових надходженнях теж)
  useEffect(() => { if (tab === 'flow' && !view) markFlowSeen() }, [tab, view, flowUnread, markFlowSeen])

  const back = () => setView(null)
  const drill = (node) => <SwipeBack onBack={back}>{node}</SwipeBack> // свайп уліво → назад
  // будь-який інший `view` — це ключ власного розділу власниці
  const drilldown =
    view === 'settings' ? <Dictionaries onBack={back} /> :
    view === 'production' ? <Projects onBack={back} /> :
    view === 'life' ? <Life onBack={back} /> :
    view === 'logistics' ? <Logistics onBack={back} /> :
    view === 'risks' ? <Risks onBack={back} /> :
    view === 'money' ? <Finance onBack={back} /> :
    view ? <CategoryTasks catKey={view} onBack={back} /> :
    null
  const screen =
    drilldown ? drill(drilldown) :
    tab === 'home' ? <Home openView={setView} /> :
    tab === 'flow' ? <Flow /> :
    tab === 'team' ? <Team /> :
    <Finance />

  return (
    <div className="app with-dock">
      <NotificationBell me={me} />
      <div className="app-scroll">
        <div key={refreshKey}>{screen}</div>
      </div>
      <div className="dictate-dock">
        <Dictate onSaved={() => setRefreshKey((k) => k + 1)} />
      </div>
      <TabBar
        tabs={[
          { key: 'home', icon: 'pulse', label: 'Головна' },
          { key: 'flow', icon: 'inbox', label: 'Потік', badge: flowUnread },
          { key: 'team', icon: 'shield', label: 'Команда' },
          { key: 'money', icon: 'wallet', label: 'Фінанси' },
        ]}
        active={view ? '' : tab}
        onChange={(k) => { setView(null); setTab(k) }}
      />
    </div>
  )
}

/* ---------- Головна (панель) ---------- */
function Home({ openView }) {
  const [d, setD] = useState(null)
  const dict = useDictionaries()
  const load = useCallback(() => get('/api/dashboard').then(setD).catch(() => {}), [])
  usePoll(load)

  if (!d) return <div className="loading">Завантаження…</div>
  const { statuses: s, counts: c } = d
  const today = new Date()
  const dateStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}`

  // назва й іконка системних розділів беруться з довідника — перейменування видно тут
  const cat = (key, fb) => findCat(dict, key) || fb
  const own = (dict.categories || []).filter((x) => !x.is_system) // власні розділи власниці
  const byCat = c.by_category || {}

  const rows = [
    { key: 'production', ...cat('production', { icon: 'film', label: 'Проєкти' }), value: spravy(c.production_open), cls: s.production === 'ok' ? 'ok' : s.production },
    { key: 'life', ...cat('life', { icon: 'home', label: 'Побут' }), value: spravy(c.life_open), cls: s.life },
    { key: 'logistics', ...cat('logistics', { icon: 'pin', label: 'Поїздки' }), value: poyizdky(c.logistics_open), cls: s.logistics },
    ...own.map((x) => {
      const n = byCat[x.key] || 0
      return { key: x.key, icon: x.icon, label: x.label, value: spravy(n), cls: n >= 5 ? 'crit' : n ? 'warn' : 'ok' }
    }),
    { key: 'risks', icon: 'alert', label: 'Тривоги', value: aktyvni(c.risk_active), cls: s.risk },
  ]

  return (
    <div className="screen">
      <Header icon="pulse" color="var(--orange)" title="Головна" sub={`сьогодні · ${dateStr}`} />

      {rows.map((r) => (
        <button key={r.key} className="status-row" onClick={() => openView(r.key)}>
          <span className={`dot ${r.cls}`} />
          <span className="ico" style={{ color: 'var(--muted)', display: 'flex' }}>{Icons[r.icon]?.(20) || Icons.task(20)}</span>
          {r.label}
          <span className="chev">
            <span className={`value tag ${r.cls}`}>{r.value}</span>
            ›
          </span>
        </button>
      ))}

      <Meter title="Темп" value={LOAD_LABEL[d.load]} pct={LOAD_PCT[d.load]}
        level={d.load === 'LOW' ? 'low' : d.load === 'MED' ? 'med' : 'high'} />

      {/* налаштування — окремим підписаним рядком: іконкою в шапці її не було
          видно, бо той кут займає дзвіночок */}
      <button className="nav-row" onClick={() => openView('settings')}>
        <span className="ico">{Icons.gear(20)}</span>
        <span className="grow">
          Розділи та важливість
          <span className="row-sub">що можна вибирати при створенні справи</span>
        </span>
        <span className="chev">›</span>
      </button>
    </div>
  )
}

/* ---------- Потік ---------- */
function Flow() {
  const [feed, setFeed] = useState(null)
  const load = useCallback(() => get('/api/feed').then(setFeed).catch(() => setFeed([])), [])
  usePoll(load)
  if (!feed) return <div className="loading">Завантаження…</div>
  return (
    <div className="screen">
      <Header icon="inbox" color="var(--orange)" title="Потік" sub={`${feed.length} записів`} />
      {feed.length === 0 && <div className="empty">Записів ще немає</div>}
      {feed.map((e) => <Entry key={e.id} e={e} label={directionLabel(e, 'owner')} />)}
    </div>
  )
}

/* ---------- Команда ---------- */
function Team() {
  const [team, setTeam] = useState(null)
  const [adding, setAdding] = useState(false)
  const [sel, setSel] = useState(null) // вибраний учасник → редагування
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('manager')
  const [employment, setEmployment] = useState('permanent')
  const [scope, setScope] = useState('all')
  const [picked, setPicked] = useState([])
  const [toast, showToast] = useToast()

  const load = useCallback(() => get('/api/team').then(setTeam).catch(() => setTeam([])), [])
  usePoll(load)

  const invite = async () => {
    if (!username.trim()) return
    try {
      await post('/api/team', {
        username: username.trim(), name: name.trim(), role,
        employment, finance_scope: scope, finance_sheets: picked,
      })
      setAdding(false); setUsername(''); setName('')
      showToast('Запрошення надіслано', 'ok')
      load()
    } catch (e) { showToast(e.message, 'warn') }
  }

  if (!team) return <div className="loading">Завантаження…</div>
  const initials = (n) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  // ролі, яких ще немає в команді — зайняту роль у дропдауні не пропонуємо
  const used = new Set(team.map((m) => m.role))
  const freeRoles = MEMBER_ROLES.filter((r) => !used.has(r.value))
  const openAdd = () => {
    setRole(freeRoles[0]?.value || ''); setUsername(''); setName('')
    setEmployment('permanent'); setScope('all'); setPicked([])
    setAdding(true)
  }
  const canInvite = username.trim() && name.trim() // кнопка активна лише коли заповнені поля

  return (
    <div className="screen">
      <Header icon="shield" color="var(--orange)" title="Команда" sub={`${team.length} учасники`} />
      <div className="card" style={{ padding: '2px 14px' }}>
        {team.map((m) => (
          <div key={m.id} className={`member ${m.status === 'invited' ? 'invited' : ''}`}
            role={m.role === 'owner' ? undefined : 'button'} tabIndex={m.role === 'owner' ? undefined : 0}
            style={m.role === 'owner' ? undefined : { cursor: 'pointer' }}
            onClick={m.role === 'owner' ? undefined : () => setSel(m)}>
            <div className="avatar" style={{ background: m.status === 'invited' ? '#d9c79a' : ROLE_COLOR[m.role] }}>
              {m.role === 'owner' ? 'Я' : initials(m.name || m.username || '?')}
            </div>
            <div className="info">
              <div className="name">{m.name || `@${m.username}`}</div>
              <div className="uname">
                {m.status === 'invited' ? 'запрошення надіслано' : m.role === 'owner' ? 'повний доступ' : m.username ? `@${m.username}` : ''}
                {m.employment === 'temporary' && ' · тимчасовий'}
              </div>
            </div>
            <span className={`badge ${m.status === 'invited' ? 'outline' : ''}`}
              style={{ background: m.status === 'invited' ? 'transparent' : ROLE_COLOR[m.role], color: m.status === 'invited' ? ROLE_COLOR[m.role] : '#fff' }}>
              {ROLE_BADGE[m.role]}
            </span>
            {m.role !== 'owner' && (
              <span className="ico" style={{ color: 'var(--muted)', display: 'flex' }}>{Icons.pencil(15)}</span>
            )}
          </div>
        ))}
      </div>
      {freeRoles.length > 0 ? (
        <button className="btn-dashed" style={{ color: 'var(--orange)' }} onClick={openAdd}>
          {Icons.addUser(20)} Додати учасника
        </button>
      ) : (
        <div className="empty">Усі ролі зайняті — видали учасника, щоб додати іншого</div>
      )}

      {adding && (
        <CenterModal title="Новий учасник" sub={ROLE_BADGE[role]} onClose={() => setAdding(false)}>
          <input placeholder="@username у Telegram" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input placeholder="Ім'я (як показувати)" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {freeRoles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <AccessFields employment={employment} setEmployment={setEmployment}
            scope={scope} setScope={setScope} picked={picked} setPicked={setPicked} />
          <button className="btn-primary" style={{ background: 'var(--orange)', opacity: canInvite ? 1 : 0.45 }}
            disabled={!canInvite} onClick={invite}>
            Додати учасника
          </button>
        </CenterModal>
      )}
      {sel && (
        <MemberSheet m={sel} onClose={() => setSel(null)}
          onChanged={() => { setSel(null); load() }} />
      )}
      {toast}
    </div>
  )
}

/* ---------- редагування учасника ---------- */
function MemberSheet({ m, onClose, onChanged }) {
  const fin = (m.permissions || {}).finance || {}
  const [name, setName] = useState(m.name || '')
  const [username, setUsername] = useState(m.username || '')
  const [role, setRole] = useState(m.role)
  const [employment, setEmployment] = useState(m.employment || 'permanent')
  const [scope, setScope] = useState(fin.scope || 'all')
  const [picked, setPicked] = useState(fin.sheets || [])
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [toast, showToast] = useToast()
  const changed =
    name.trim() !== (m.name || '') ||
    username.trim().replace(/^@/, '') !== (m.username || '') ||
    role !== m.role ||
    employment !== (m.employment || 'permanent') ||
    scope !== (fin.scope || 'all') ||
    JSON.stringify([...picked].sort()) !== JSON.stringify([...(fin.sheets || [])].sort())

  const save = async (extra = {}) => {
    if (busy) return
    setBusy(true)
    try {
      await patch(`/api/team/${m.id}`, {
        name: name.trim(), username: username.trim(), role,
        employment, finance_scope: scope, finance_sheets: picked, ...extra,
      })
      onChanged()
    } catch (e) { showToast(e.message, 'warn') } finally { setBusy(false) }
  }

  return (
    <CenterModal
      title={m.name || `@${m.username}`}
      sub={`${ROLE_BADGE[role] || ''}${m.status === 'invited' ? ' · запрошення' : ''}`}
      onClose={onClose}
    >
      <input placeholder="Ім'я (як показувати)" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="@username у Telegram" value={username} onChange={(e) => setUsername(e.target.value)} />
      <select value={role} onChange={(e) => setRole(e.target.value)}>
        <option value="manager">Менеджер</option>
        <option value="assistant">Асистент</option>
        <option value="driver">Водій</option>
      </select>
      <AccessFields employment={employment} setEmployment={setEmployment}
        scope={scope} setScope={setScope} picked={picked} setPicked={setPicked} />
      <button className="btn-primary" style={{ background: 'var(--orange)', opacity: changed ? 1 : 0.45 }}
        disabled={busy || !changed} onClick={() => save()}>
        {busy ? 'Зберігаю…' : 'Зберегти зміни'}
      </button>
      <button className="btn-small ghost danger" onClick={() => setConfirmDel(true)} disabled={busy}>
        {Icons.trash(15)} Видалити з команди
      </button>
      {confirmDel && (
        <ConfirmDialog text="Впевнені, що видалити?"
          onYes={() => { setConfirmDel(false); save({ deleted: true }) }}
          onNo={() => setConfirmDel(false)} />
      )}
      {toast}
    </CenterModal>
  )
}

/* ---------- Фінанси ---------- */
function Finance({ onBack }) {
  const [m, setM] = useState(null)
  const [team, setTeam] = useState([])
  const [adding, setAdding] = useState(false)
  const [sel, setSel] = useState(null) // вибрана витрата → шторка з коментарем
  const [editBudget, setEditBudget] = useState(false)
  const [manageSheets, setManageSheets] = useState(false)
  const [text, setText] = useState('')
  const [amount, setAmount] = useState('')
  const [toast, showToast] = useToast()
  const [sheet, setSheet, sheets] = useSheetSelection()
  const allSheets = sheet === ALL_SHEETS

  const load = useCallback(() => {
    if (!sheet) return
    get(`/api/money?sheet=${sheet}`).then(setM).catch(() => {})
    get('/api/team').then(setTeam).catch(() => {})
  }, [sheet])
  usePoll(load)
  useLiveSel(m?.expenses, sel, setSel) // відкрита витрата оновлюється наживо

  const addExpense = async () => {
    if (!text.trim() || !amount) return
    try {
      // у режимі «усі листи» витрата йде в загальний
      const target = allSheets ? (sheets.find((s) => s.is_general) || sheets[0]) : null
      await post('/api/money', {
        text: text.trim(), amount: Number(amount),
        sheet_id: allSheets ? target?.id : Number(sheet),
      })
      setAdding(false); setText(''); setAmount('')
      load()
    } catch (e) { showToast(e.message, 'warn') }
  }

  const approve = async (id) => {
    try { await post(`/api/money/${id}/approve`); load() } catch (e) { showToast(e.message, 'warn') }
  }

  if (!m) return <div className="loading">Завантаження…</div>
  const monthName = new Date().toLocaleDateString('uk-UA', { month: 'long' })

  // діаграма: в одному листі ділимо за напрямом, у режимі «усі листи» — за листами
  const AREA = { manager: ['Проєкти', 'var(--blue)'], assistant: ['Побут', 'var(--green)'], driver: ['Логістика', 'var(--gold)'], owner: ['Інше', 'var(--orange)'] }
  const SHEET_COLORS = ['var(--orange)', 'var(--blue)', 'var(--green)', 'var(--gold)', 'var(--red)', 'var(--ink)']
  const bucket = {}
  ;(m.expenses || []).forEach((e) => {
    const key = allSheets ? e.sheet_id : e.owner_role
    bucket[key] = (bucket[key] || 0) + (e.amount || 0)
  })
  const donutData = Object.entries(bucket)
    .filter(([, v]) => v > 0)
    .map(([key, v], i) => {
      if (allSheets) {
        const s = sheets.find((x) => String(x.id) === String(key))
        return { label: s?.name || 'Без листа', color: SHEET_COLORS[i % SHEET_COLORS.length], value: Math.round(v) }
      }
      return { label: (AREA[key] || [key])[0], color: (AREA[key] || [key, 'var(--muted)'])[1], value: Math.round(v) }
    })
    .sort((a, b) => b.value - a.value)
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0)

  return (
    <div className="screen">
      {onBack && <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>}
      <Header icon="wallet" color="var(--orange)" title="Фінанси" sub={monthName} />
      <SheetPicker value={sheet} onChange={setSheet} onManage={() => setManageSheets(true)} />
      <div className="stat-grid">
        <div className="stat"><div className="num">{m.spent.toLocaleString('uk-UA')} <small>₴</small></div><div className="lbl">витрачено</div></div>
        <div className="stat"><div className="num">{m.budget_pct}<small>%</small></div><div className="lbl">бюджету</div></div>
      </div>
      <Meter title={allSheets ? 'Бюджет усіх листів' : 'Бюджет місяця'}
        value={`${Math.round(m.budget).toLocaleString('uk-UA')} ₴ · ${m.budget_pct}%`}
        pct={m.budget_pct} level={m.budget_pct > 100 ? 'high' : m.budget_pct >= 80 ? 'med' : 'low'}
        onEdit={allSheets ? undefined : () => setEditBudget(true)} />
      {donutData.length > 0 && (
        <div className="card">
          <div className="donut-title">{allSheets ? 'Як розкладено по листах' : 'На що йдуть гроші'}</div>
          <DonutChart data={donutData} centerValue={`${donutTotal.toLocaleString('uk-UA')} ₴`} centerCap="всього" />
        </div>
      )}
      <button className="btn-primary" style={{ background: 'var(--orange)' }} onClick={() => setAdding(true)}>
        {Icons.plus(20)} Додати витрату
      </button>

      <div className="section-label">Останні витрати</div>
      {m.expenses.length === 0 && <div className="empty">Витрат ще немає</div>}
      {m.expenses.map((e) => (
        <div key={e.id} className="item" role="button" tabIndex={0} onClick={() => setSel(e)}>
          <span className={`dot ${e.approved ? 'ok' : 'warn'}`} />
          <span className="ico">{e.owner_role === 'driver' ? Icons.fuel(19) : e.owner_role === 'assistant' ? Icons.cart(19) : Icons.film(19)}</span>
          <span className="grow">
            {e.text || 'Витрата'}
            <span className="row-sub">{authorLabel(e.owner_role, team)}</span>
            {e.comment && <span className="comment-line">{Icons.comment(13)} {e.comment}</span>}
          </span>
          <span className="amount">{Math.round(e.amount).toLocaleString('uk-UA')} ₴</span>
          {!e.approved && m.can_approve && (
            <button className="btn-confirm" aria-label="Підтвердити"
              onClick={(ev) => { ev.stopPropagation(); approve(e.id) }}>
              {Icons.check(16)}
            </button>
          )}
          <button className="btn-icon" aria-label="Редагувати"
            onClick={(ev) => { ev.stopPropagation(); setSel(e) }}>
            {Icons.pencil(16)}
          </button>
        </div>
      ))}

      {adding && (
        <CenterModal title="Нова витрата" onClose={() => setAdding(false)}>
          <input placeholder="На що (напр. Оренда обладнання)" value={text} onChange={(e) => setText(e.target.value)} />
          <MoneyInput value={amount} onChange={setAmount} placeholder="Сума" />
          <button className="btn-primary"
            style={{ background: 'var(--orange)', opacity: text.trim() && Number(amount) > 0 ? 1 : 0.45 }}
            disabled={!text.trim() || !(Number(amount) > 0)}
            onClick={addExpense}>
            Зберегти
          </button>
        </CenterModal>
      )}
      {sel && (
        <ExpenseSheet e={sel} canApprove={m.can_approve} onClose={() => setSel(null)}
          onChanged={() => { setSel(null); load() }} />
      )}
      {editBudget && (
        <BudgetSheet sheet={sheet} onClose={() => setEditBudget(false)}
          onSaved={() => { setEditBudget(false); load() }} />
      )}
      {manageSheets && (
        <SheetsModal onClose={() => { setManageSheets(false); load() }} />
      )}
      {toast}
    </div>
  )
}

/* ---------- бюджет місяця: секції «на що + сума» ---------- */
function BudgetSheet({ sheet, onClose, onSaved }) {
  const [items, setItems] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, showToast] = useToast()

  useEffect(() => {
    get(`/api/budget?sheet=${sheet}`)
      .then((b) => setItems(
        b.items.length
          ? b.items.map((i) => ({ name: i.name, amount: String(Math.round(i.amount)) }))
          : [{ name: '', amount: '' }],
      ))
      .catch(() => setItems([{ name: '', amount: '' }]))
  }, [sheet])

  const upd = (idx, field, v) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: v } : it)))
  const removeRow = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx))
  const addRow = () => setItems((prev) => [...prev, { name: '', amount: '' }])

  const total = (items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const valid = items && items.every((i) => i.name.trim() && Number(i.amount) > 0)

  const save = async () => {
    setBusy(true)
    try {
      await put(`/api/budget?sheet=${sheet}`, {
        items: items.map((i) => ({ name: i.name.trim(), amount: Number(i.amount) })),
      })
      onSaved()
    } catch (e) { showToast(e.message, 'warn') } finally { setBusy(false) }
  }

  return (
    <CenterModal title="Бюджет місяця" onClose={onClose}>
      {!items && <div className="loading" style={{ padding: '16px 0' }}>Завантаження…</div>}
      {items && (
        <>
          {items.map((it, idx) => (
            <div key={idx} className="budget-row">
              <input placeholder="На що (напр. Продакшн)" value={it.name}
                onChange={(e) => upd(idx, 'name', e.target.value)} />
              <MoneyInput value={it.amount} onChange={(v) => upd(idx, 'amount', v)} placeholder="Сума" />
              <button className="btn-icon" aria-label="Прибрати секцію" onClick={() => removeRow(idx)}>
                {Icons.trash(16)}
              </button>
            </div>
          ))}
          <button className="btn-dashed" style={{ color: 'var(--orange)' }} onClick={addRow}>
            {Icons.plus(18)} Додати секцію
          </button>
          <div className="preview-meta">Разом: {total.toLocaleString('uk-UA')} ₴ на місяць</div>
          <button className="btn-primary" style={{ background: 'var(--orange)', opacity: valid ? 1 : 0.45 }}
            disabled={busy || !valid} onClick={save}>
            {busy ? 'Зберігаю…' : 'Зберегти'}
          </button>
        </>
      )}
      {toast}
    </CenterModal>
  )
}

/* ---------- дрілдаун: власний розділ власниці ----------
   Один екран на будь-який розділ, доданий на сторінці «Розділи та важливість». */
function CategoryTasks({ catKey, onBack }) {
  const dict = useDictionaries()
  const cat = findCat(dict, catKey)
  const [tasks, setTasks] = useState(null)
  const [sel, setSel] = useState(null)
  const [adding, setAdding] = useState(false)
  const load = useCallback(
    () => get(`/api/tasks?category=${encodeURIComponent(catKey)}`).then(setTasks).catch(() => setTasks([])),
    [catKey],
  )
  usePoll(load)
  useLiveSel(tasks, sel, setSel)

  if (!tasks) return <div className="loading">Завантаження…</div>
  const color = colorVar(cat?.color)
  const open = tasks.filter((t) => t.status === 'open')
  const done = tasks.filter((t) => t.status === 'done')
  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>
      <Header icon={cat?.icon || 'task'} color={color} title={cat?.label || 'Розділ'} sub={spravy(open.length)} />
      <div className="section-label">Активні</div>
      {open.length === 0 && <div className="empty">Справ немає</div>}
      {open.map((t) => (
        <TaskItem key={t.id} t={t} icon={cat?.icon || 'task'} onOpen={() => setSel(t)} />
      ))}
      <button className="btn-dashed" style={{ color }} onClick={() => setAdding(true)}>
        {Icons.plus(18)} Додати справу
      </button>
      {done.length > 0 && <div className="section-label">Зроблено</div>}
      {done.slice(0, 5).map((t) => (
        <TaskItem key={t.id} t={t} icon={cat?.icon || 'task'} onOpen={() => setSel(t)} />
      ))}
      {adding && (
        <NewTaskModal defaultCategory={catKey} color={color} title={`Нова справа · ${cat?.label || ''}`}
          onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />
      )}
      {sel && (
        <TaskSheet t={sel} color={color} onClose={() => setSel(null)}
          onChanged={() => { setSel(null); load() }} />
      )}
    </div>
  )
}

/* ---------- дрілдаун: Проєкти ---------- */
function Projects({ onBack }) {
  const [tasks, setTasks] = useState(null)
  const [feed, setFeed] = useState([])
  const [team, setTeam] = useState([])
  const [sel, setSel] = useState(null)
  const [adding, setAdding] = useState(false)
  const load = useCallback(() => {
    get('/api/tasks?category=production').then(setTasks).catch(() => setTasks([]))
    get('/api/feed').then((f) => setFeed(f.filter((e) => e.category === 'production'))).catch(() => {})
    get('/api/team').then(setTeam).catch(() => {})
  }, [])
  usePoll(load)
  useLiveSel(tasks, sel, setSel) // відкрита задача оновлюється наживо
  if (!tasks) return <div className="loading">Завантаження…</div>
  const open = tasks.filter((t) => t.status === 'open')
  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>
      <Header icon="film" color="var(--blue)" title="Проєкти" sub={roleSub('Менеджер', memberName(team, 'manager'), spravy(open.length))} />
      <div className="section-label">Активні</div>
      {open.length === 0 && <div className="empty">Активних задач немає</div>}
      {open.map((t) => (
        <TaskItem key={t.id} t={t} icon="film" onOpen={() => setSel(t)} />
      ))}
      <button className="btn-dashed" style={{ color: 'var(--blue)' }} onClick={() => setAdding(true)}>
        {Icons.plus(18)} Додати задачу
      </button>
      <div className="section-label">Останнє</div>
      {feed.slice(0, 5).map((e) => <Entry key={e.id} e={e} label={e.role_label?.toUpperCase()} />)}
      {adding && (
        <NewTaskModal defaultCategory="production" color="var(--blue)"
          placeholder="Напр.: підтвердити локацію на чт"
          onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />
      )}
      {sel && (
        <TaskSheet t={sel} color="var(--blue)"
          onClose={() => setSel(null)} onChanged={() => { setSel(null); load() }} />
      )}
    </div>
  )
}

/* ---------- дрілдаун: Побут ---------- */
function Life({ onBack }) {
  const dict = useDictionaries()
  const [tasks, setTasks] = useState(null)
  const [team, setTeam] = useState([])
  const [sel, setSel] = useState(null)
  const [adding, setAdding] = useState(false)
  const load = useCallback(() => {
    Promise.all([
      get('/api/tasks?category=life').catch(() => []),
      get('/api/tasks?category=dog').catch(() => []),
    ]).then(([a, b]) => setTasks([...a, ...b]))
    get('/api/team').then(setTeam).catch(() => {})
  }, [])
  usePoll(load)
  useLiveSel(tasks, sel, setSel) // відкрита задача оновлюється наживо
  if (!tasks) return <div className="loading">Завантаження…</div>
  // два розділи склеєні в один список → важливі піднімаємо вручну
  const open = tasks.filter((t) => t.status === 'open').sort(byPriority(dict))
  const done = tasks.filter((t) => t.status === 'done')
  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>
      <Header icon="home" color="var(--green)" title="Побут" sub={roleSub('Асистент', memberName(team, 'assistant'), spravy(open.length))} />
      <div className="section-label">На сьогодні</div>
      {open.length === 0 && <div className="empty"><span className="ico-text">{Icons.check(16)} Все зроблено</span></div>}
      {open.map((t) => (
        <TaskItem key={t.id} t={t} icon={t.category === 'dog' ? 'dog' : 'home'} onOpen={() => setSel(t)} />
      ))}
      <button className="btn-dashed" style={{ color: 'var(--green)' }} onClick={() => setAdding(true)}>
        {Icons.plus(18)} Додати справу
      </button>
      {done.length > 0 && <div className="section-label">Зроблено</div>}
      {done.slice(0, 5).map((t) => (
        <TaskItem key={t.id} t={t} icon={t.category === 'dog' ? 'dog' : 'home'} onOpen={() => setSel(t)} />
      ))}
      {adding && (
        <NewTaskModal defaultCategory="life" color="var(--green)"
          title="Нова справа" placeholder="Напр.: записати на хімчистку"
          onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />
      )}
      {sel && (
        <TaskSheet t={sel} color="var(--green)"
          onClose={() => setSel(null)} onChanged={() => { setSel(null); load() }} />
      )}
    </div>
  )
}

/* ---------- дрілдаун: Поїздки (логістика водія) ---------- */
function Logistics({ onBack }) {
  const [tasks, setTasks] = useState(null)
  const [team, setTeam] = useState([])
  const [sel, setSel] = useState(null)
  const [adding, setAdding] = useState(false)
  const load = useCallback(() => {
    get('/api/tasks?category=logistics').then(setTasks).catch(() => setTasks([]))
    get('/api/team').then(setTeam).catch(() => {})
  }, [])
  usePoll(load)
  useLiveSel(tasks, sel, setSel) // відкрита поїздка оновлюється наживо
  if (!tasks) return <div className="loading">Завантаження…</div>
  const open = tasks.filter((t) => t.status === 'open')
  const done = tasks.filter((t) => t.status === 'done')
  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>
      <Header icon="pin" color="var(--gold)" title="Поїздки" sub={roleSub('Водій', memberName(team, 'driver'), poyizdky(open.length))} />
      <div className="section-label">Активні</div>
      {open.length === 0 && <div className="empty">Поїздок немає</div>}
      {open.map((t) => (
        <TaskItem key={t.id} t={t} icon="pin" onOpen={() => setSel(t)} />
      ))}
      <button className="btn-dashed" style={{ color: 'var(--gold)' }} onClick={() => setAdding(true)}>
        {Icons.plus(18)} Нова поїздка
      </button>
      {done.length > 0 && <div className="section-label">Виконані</div>}
      {done.slice(0, 5).map((t) => (
        <TaskItem key={t.id} t={t} icon="pin" onOpen={() => setSel(t)} />
      ))}
      {adding && (
        <NewTaskModal defaultCategory="logistics" color="var(--gold)"
          title="Нова поїздка" placeholder="Напр.: забрати оператора о 9:00"
          onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />
      )}
      {sel && (
        <TaskSheet t={sel} color="var(--gold)"
          onClose={() => setSel(null)} onChanged={() => { setSel(null); load() }} />
      )}
    </div>
  )
}

/* ---------- дрілдаун: Тривоги ---------- */
function Risks({ onBack }) {
  const [risks, setRisks] = useState(null)
  const [toast, showToast] = useToast()
  const load = useCallback(() => get('/api/risks').then(setRisks).catch(() => setRisks([])), [])
  usePoll(load)

  const resolve = async (id) => {
    try { await post(`/api/risks/${id}/resolve`); load() } catch (e) { showToast(e.message, 'warn') }
  }

  if (!risks) return <div className="loading">Завантаження…</div>
  const active = risks.filter((r) => !r.resolved)
  const resolved = risks.filter((r) => r.resolved)
  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>
      <Header icon="alert" color="var(--red)" title="Тривоги" sub={aktyvni(active.length)} />
      <div className="stat-grid">
        <div className="stat"><div className="num" style={{ color: 'var(--red)' }}>{active.length}</div><div className="lbl">активні</div></div>
        <div className="stat"><div className="num">{risks.length}</div><div className="lbl">за тиждень</div></div>
      </div>
      <div className="section-label">Активні</div>
      {active.length === 0 && <div className="empty"><span className="ico-text">{Icons.check(16)} Тривог немає</span></div>}
      {active.map((r) => (
        <div key={r.id} className={`entry ${r.level === 'high' ? 'red' : r.level === 'med' ? 'gold' : 'green'}`}>
          <div className="top">
            <span className="label">ТРИВОГА · {r.level === 'med' ? 'MEDIUM' : r.level.toUpperCase()}</span>
            <span className="time">{fmtTime(r.time)}</span>
          </div>
          <div className="text">{r.text}</div>
          <div className="meta" style={{ justifyContent: 'space-between' }}>
            <span className="ico-text">{r.keyword_hit ? Icons.alert(13) : Icons.clock(13)} {r.keyword_hit ? 'пуш власнику' : 'чекає рішення'}</span>
            <button className="btn-small ghost" onClick={() => resolve(r.id)}>Вирішено</button>
          </div>
        </div>
      ))}
      {resolved.length > 0 && <div className="section-label">Вирішені</div>}
      {resolved.slice(0, 5).map((r) => (
        <div key={r.id} className="entry green">
          <div className="top"><span className="label">ВИРІШЕНО</span><span className="time">{fmtTime(r.time)}</span></div>
          <div className="text">{r.text}</div>
          <div className="meta">{Icons.check(13)} закрито</div>
        </div>
      ))}
      {toast}
    </div>
  )
}

/* ---------- спільне для задач ---------- */
function TaskItem({ t, icon, onOpen }) {
  const overdue = isOverdue(t.due)
  return (
    <button className={`item ${t.status === 'done' ? 'done' : ''}`} onClick={onOpen}>
      <span className={`dot ${t.status === 'done' ? 'ok' : overdue ? 'crit' : 'warn'}`} />
      <span className="ico">{Icons[icon]?.(19)}</span>
      {t.status !== 'done' && <PriorityMark p={t.priority} />}
      <span className="grow">{t.text}</span>
      <ItemsBadge t={t} />
      <span className={`tag ${t.status === 'done' ? 'ok' : overdue ? 'crit' : 'warn'}`}>
        {t.status === 'done' ? (t.done_at ? fmtTime(t.done_at) : 'готово') : overdue ? 'терміново' : t.due ? `до ${fmtDue(t.due)}` : 'сьогодні'}
      </span>
      <span className="ico" style={{ color: 'var(--muted)' }}>{Icons.pencil(15)}</span>
    </button>
  )
}
