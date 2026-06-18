import { useCallback, useEffect, useState } from 'react'
import { get, patch, post, put } from '../api'
import {
  ConfirmDialog, Dictate, Entry, ExpenseSheet, Header, Icons, Meter, MoneyInput, NotificationBell, ROLE_BADGE, ROLE_COLOR, Sheet, TabBar, TaskSheet, directionLabel, fmtTime, usePoll, useToast,
} from '../components'

const LOAD_LABEL = { LOW: 'НИЗЬКИЙ', MED: 'СЕРЕДНІЙ', HIGH: 'ВИСОКИЙ' }
const LOAD_PCT = { LOW: 25, MED: 55, HIGH: 90 }
const STATUS_TEXT = { ok: 'в нормі', warn: 'потребує уваги', crit: 'критично' }

export default function Owner({ me }) {
  const [tab, setTab] = useState('home')
  const [view, setView] = useState(null) // дрілдаун: production | life | risks | money
  const [refreshKey, setRefreshKey] = useState(0) // після диктовки перезавантажуємо активний екран

  const screen =
    view === 'production' ? <Projects onBack={() => setView(null)} /> :
    view === 'life' ? <Life onBack={() => setView(null)} /> :
    view === 'risks' ? <Risks onBack={() => setView(null)} /> :
    view === 'money' ? <Finance onBack={() => setView(null)} /> :
    tab === 'home' ? <Home openView={setView} /> :
    tab === 'flow' ? <Flow /> :
    tab === 'team' ? <Team /> :
    <Finance />

  return (
    <div className="app with-dock">
      <NotificationBell me={me} />
      <div key={refreshKey}>{screen}</div>
      <div className="dictate-dock">
        <Dictate onSaved={() => setRefreshKey((k) => k + 1)} />
      </div>
      <TabBar
        tabs={[
          { key: 'home', icon: 'pulse', label: 'Головна' },
          { key: 'flow', icon: 'inbox', label: 'Потік' },
          { key: 'team', icon: 'shield', label: 'Команда' },
          { key: 'money', icon: 'wallet', label: 'Фінанси' },
        ]}
        active={view ? '' : tab}
        onChange={(k) => { setView(null); setTab(k) }}
      />
    </div>
  )
}

/* ---------- Головна (пульт) ---------- */
function Home({ openView }) {
  const [d, setD] = useState(null)
  const load = useCallback(() => get('/api/dashboard').then(setD).catch(() => {}), [])
  usePoll(load)

  if (!d) return <div className="loading">Завантаження…</div>
  const { statuses: s, counts: c } = d
  const today = new Date()
  const dateStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}`

  const rows = [
    { key: 'production', icon: 'film', title: 'Проєкти', value: STATUS_TEXT[s.production], cls: s.production === 'ok' ? 'ok' : s.production, view: 'production' },
    { key: 'life', icon: 'home', title: 'Побут', value: `${c.life_open} справи`, cls: s.life, view: 'life' },
    { key: 'money', icon: 'wallet', title: 'Фінанси', value: `${c.budget_pct}%`, cls: s.money, view: 'money' },
    { key: 'risk', icon: 'alert', title: 'Тривоги', value: `${c.risk_active} активні`, cls: s.risk, view: 'risks' },
  ]

  return (
    <div className="screen">
      <Header icon="pulse" color="var(--orange)" title="Головна" sub={`сьогодні · ${dateStr}`} />

      {rows.map((r) => (
        <button key={r.key} className="status-row" onClick={() => openView(r.view)}>
          <span className={`dot ${r.cls}`} />
          <span className="ico" style={{ color: 'var(--muted)', display: 'flex' }}>{Icons[r.icon](20)}</span>
          {r.title}
          <span className="chev">
            <span className={`value tag ${r.cls}`}>{r.value}</span>
            ›
          </span>
        </button>
      ))}

      <Meter title="Темп" value={LOAD_LABEL[d.load]} pct={LOAD_PCT[d.load]}
        level={d.load === 'LOW' ? 'low' : d.load === 'MED' ? 'med' : 'high'} />

      <div className="section-label">Надійшло</div>
      {d.feed.length === 0 && <div className="empty">Поки тихо</div>}
      {d.feed.slice(0, 6).map((e) => (
        <Entry key={e.id} e={e} label={directionLabel(e, 'owner')} />
      ))}
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
  const [toast, showToast] = useToast()

  const load = useCallback(() => get('/api/team').then(setTeam).catch(() => setTeam([])), [])
  usePoll(load)

  const invite = async () => {
    if (!username.trim()) return
    try {
      await post('/api/team', { username: username.trim(), name: name.trim(), role })
      setAdding(false); setUsername(''); setName('')
      showToast('Запрошення створено — користувач активується після /start у боті')
      load()
    } catch (e) { showToast(e.message, 'warn') }
  }

  if (!team) return <div className="loading">Завантаження…</div>
  const initials = (n) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

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
      <button className="btn-dashed" style={{ color: 'var(--orange)' }} onClick={() => setAdding(true)}>
        {Icons.addUser(20)} Додати учасника
      </button>

      {adding && (
        <Sheet title="Новий учасник" onClose={() => setAdding(false)}>
          <input placeholder="@username у Telegram" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input placeholder="Ім'я (як показувати)" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="manager">Менеджер — проєкти</option>
            <option value="assistant">Асистент — побут і пес</option>
            <option value="driver">Водій — логістика</option>
          </select>
          <button className="btn-primary" style={{ background: 'var(--orange)' }} onClick={invite}>
            Надіслати запрошення
          </button>
        </Sheet>
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
  const [name, setName] = useState(m.name || '')
  const [username, setUsername] = useState(m.username || '')
  const [role, setRole] = useState(m.role)
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [toast, showToast] = useToast()
  const changed =
    name.trim() !== (m.name || '') ||
    username.trim().replace(/^@/, '') !== (m.username || '') ||
    role !== m.role

  const save = async (extra = {}) => {
    if (busy) return
    setBusy(true)
    try {
      await patch(`/api/team/${m.id}`, { name: name.trim(), username: username.trim(), role, ...extra })
      onChanged()
    } catch (e) { showToast(e.message, 'warn') } finally { setBusy(false) }
  }

  return (
    <Sheet title={m.name || `@${m.username}`} onClose={onClose}>
      <div className="preview-meta">
        {m.status === 'invited' ? 'запрошення надіслано — чекає /start у боті' : 'активний учасник'}
      </div>
      <input placeholder="Ім'я (як показувати)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <input placeholder="@username у Telegram" value={username} onChange={(e) => setUsername(e.target.value)} />
      <select value={role} onChange={(e) => setRole(e.target.value)}>
        <option value="manager">Менеджер — проєкти</option>
        <option value="assistant">Асистент — побут і пес</option>
        <option value="driver">Водій — логістика</option>
      </select>
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
    </Sheet>
  )
}

/* ---------- Фінанси ---------- */
function Finance({ onBack }) {
  const [m, setM] = useState(null)
  const [adding, setAdding] = useState(false)
  const [sel, setSel] = useState(null) // вибрана витрата → шторка з коментарем
  const [editBudget, setEditBudget] = useState(false)
  const [text, setText] = useState('')
  const [amount, setAmount] = useState('')
  const [toast, showToast] = useToast()

  const load = useCallback(() => get('/api/money').then(setM).catch(() => {}), [])
  usePoll(load)

  const addExpense = async () => {
    if (!text.trim() || !amount) return
    try {
      await post('/api/money', { text: text.trim(), amount: Number(amount) })
      setAdding(false); setText(''); setAmount('')
      load()
    } catch (e) { showToast(e.message, 'warn') }
  }

  const approve = async (id) => {
    try { await post(`/api/money/${id}/approve`); load() } catch (e) { showToast(e.message, 'warn') }
  }

  if (!m) return <div className="loading">Завантаження…</div>
  const monthName = new Date().toLocaleDateString('uk-UA', { month: 'long' })

  return (
    <div className="screen">
      {onBack && <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>}
      <Header icon="wallet" color="var(--orange)" title="Фінанси" sub={monthName} />
      <div className="stat-grid">
        <div className="stat"><div className="num">{m.spent.toLocaleString('uk-UA')} <small>₴</small></div><div className="lbl">витрачено</div></div>
        <div className="stat"><div className="num">{m.budget_pct}<small>%</small></div><div className="lbl">бюджету</div></div>
      </div>
      <Meter title="Бюджет місяця" value={`${Math.round(m.budget).toLocaleString('uk-UA')} ₴ · ${m.budget_pct}%`}
        pct={m.budget_pct} level={m.budget_pct > 100 ? 'high' : m.budget_pct >= 80 ? 'med' : 'low'}
        onEdit={() => setEditBudget(true)} />
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
        <Sheet title="Нова витрата" onClose={() => setAdding(false)}>
          <input placeholder="На що (напр. Оренда обладнання)" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <MoneyInput value={amount} onChange={setAmount} placeholder="Сума" />
          <button className="btn-primary"
            style={{ background: 'var(--orange)', opacity: text.trim() && Number(amount) > 0 ? 1 : 0.45 }}
            disabled={!text.trim() || !(Number(amount) > 0)}
            onClick={addExpense}>
            Зберегти
          </button>
        </Sheet>
      )}
      {sel && (
        <ExpenseSheet e={sel} canApprove={m.can_approve} onClose={() => setSel(null)}
          onChanged={() => { setSel(null); load() }} />
      )}
      {editBudget && (
        <BudgetSheet onClose={() => setEditBudget(false)}
          onSaved={() => { setEditBudget(false); load() }} />
      )}
      {toast}
    </div>
  )
}

/* ---------- бюджет місяця: секції «на що + сума» ---------- */
function BudgetSheet({ onClose, onSaved }) {
  const [items, setItems] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, showToast] = useToast()

  useEffect(() => {
    get('/api/budget')
      .then((b) => setItems(
        b.items.length
          ? b.items.map((i) => ({ name: i.name, amount: String(Math.round(i.amount)) }))
          : [{ name: '', amount: '' }],
      ))
      .catch(() => setItems([{ name: '', amount: '' }]))
  }, [])

  const upd = (idx, field, v) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: v } : it)))
  const removeRow = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx))
  const addRow = () => setItems((prev) => [...prev, { name: '', amount: '' }])

  const total = (items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const valid = items && items.every((i) => i.name.trim() && Number(i.amount) > 0)

  const save = async () => {
    setBusy(true)
    try {
      await put('/api/budget', { items: items.map((i) => ({ name: i.name.trim(), amount: Number(i.amount) })) })
      onSaved()
    } catch (e) { showToast(e.message, 'warn') } finally { setBusy(false) }
  }

  return (
    <Sheet title="Бюджет місяця" onClose={onClose}>
      {!items && <div className="loading" style={{ padding: '16px 0' }}>Завантаження…</div>}
      {items && (
        <>
          {items.map((it, idx) => (
            <div key={idx} className="budget-row">
              <input placeholder="На що (напр. Продакшн)" value={it.name}
                onChange={(e) => upd(idx, 'name', e.target.value)} autoFocus={idx === items.length - 1 && !it.name} />
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
    </Sheet>
  )
}

/* ---------- дрілдаун: Проєкти ---------- */
function Projects({ onBack }) {
  const [tasks, setTasks] = useState(null)
  const [feed, setFeed] = useState([])
  const [sel, setSel] = useState(null)
  const load = useCallback(() => {
    get('/api/tasks?category=production').then(setTasks).catch(() => setTasks([]))
    get('/api/feed').then((f) => setFeed(f.filter((e) => e.category === 'production'))).catch(() => {})
  }, [])
  usePoll(load)
  if (!tasks) return <div className="loading">Завантаження…</div>
  const open = tasks.filter((t) => t.status === 'open')
  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>
      <Header icon="film" color="var(--blue)" title="Проєкти" sub={`${open.length} активні`} />
      <div className="section-label">Активні</div>
      {open.length === 0 && <div className="empty">Активних задач немає</div>}
      {open.map((t) => (
        <TaskItem key={t.id} t={t} icon="film" onOpen={() => setSel(t)} />
      ))}
      <div className="section-label">Останнє</div>
      {feed.slice(0, 5).map((e) => <Entry key={e.id} e={e} label={e.role_label?.toUpperCase()} />)}
      {sel && (
        <TaskSheet t={sel} color="var(--blue)" onClose={() => setSel(null)}
          onChanged={() => { setSel(null); load() }} />
      )}
    </div>
  )
}

/* ---------- дрілдаун: Побут ---------- */
function Life({ onBack }) {
  const [tasks, setTasks] = useState(null)
  const [sel, setSel] = useState(null)
  const load = useCallback(() => {
    Promise.all([
      get('/api/tasks?category=life').catch(() => []),
      get('/api/tasks?category=dog').catch(() => []),
    ]).then(([a, b]) => setTasks([...a, ...b]))
  }, [])
  usePoll(load)
  if (!tasks) return <div className="loading">Завантаження…</div>
  const open = tasks.filter((t) => t.status === 'open')
  const done = tasks.filter((t) => t.status === 'done')
  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>
      <Header icon="home" color="var(--green)" title="Побут" sub={`${open.length} справи`} />
      <div className="section-label">На сьогодні</div>
      {open.length === 0 && <div className="empty"><span className="ico-text">{Icons.check(16)} Все зроблено</span></div>}
      {open.map((t) => (
        <TaskItem key={t.id} t={t} icon={t.category === 'dog' ? 'dog' : 'home'} onOpen={() => setSel(t)} />
      ))}
      {done.length > 0 && <div className="section-label">Зроблено</div>}
      {done.slice(0, 5).map((t) => (
        <TaskItem key={t.id} t={t} icon={t.category === 'dog' ? 'dog' : 'home'} onOpen={() => setSel(t)} />
      ))}
      {sel && (
        <TaskSheet t={sel} color="var(--green)" onClose={() => setSel(null)}
          onChanged={() => { setSel(null); load() }} />
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
      <Header icon="alert" color="var(--red)" title="Тривоги" sub={`${active.length} активні`} />
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
  const overdue = t.due && new Date(t.due) <= new Date()
  return (
    <button className={`item ${t.status === 'done' ? 'done' : ''}`} onClick={onOpen}>
      <span className={`dot ${t.status === 'done' ? 'ok' : overdue ? 'crit' : 'warn'}`} />
      <span className="ico">{Icons[icon]?.(19)}</span>
      <span className="grow">{t.text}</span>
      <span className={`tag ${t.status === 'done' ? 'ok' : overdue ? 'crit' : 'warn'}`}>
        {t.status === 'done' ? 'готово' : overdue ? 'терміново' : t.due ? `до ${t.due.slice(5)}` : 'сьогодні'}
      </span>
      <span className="ico" style={{ color: 'var(--muted)' }}>{Icons.pencil(15)}</span>
    </button>
  )
}
