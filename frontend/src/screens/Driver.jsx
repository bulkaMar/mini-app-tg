import { useCallback, useState } from 'react'
import { get, post } from '../api'
import { ExpenseSheet, Header, Icons, MoneyInput, NotificationBell, Sheet, TabBar, TaskSheet, fmtTime, usePoll, useToast } from '../components'

export default function Driver({ me }) {
  const [tab, setTab] = useState('shift')
  return (
    <div className="app">
      <NotificationBell me={me} />
      <div className="app-scroll">
        {tab === 'shift' && <Shift me={me} />}
        {tab === 'trips' && <Trips />}
        {tab === 'money' && <Money />}
      </div>
      <TabBar
        tabs={[
          { key: 'shift', icon: 'truck', label: 'Зміна' },
          { key: 'trips', icon: 'pin', label: 'Поїздки' },
          { key: 'money', icon: 'fuel', label: 'Фінанси' },
        ]}
        active={tab}
        onChange={setTab}
      />
    </div>
  )
}

const isToday = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString()

function AddTripSheet({ onClose }) {
  const [text, setText] = useState('')
  const [toast, showToast] = useToast()
  const add = async () => {
    if (!text.trim()) return
    try {
      await post('/api/tasks', { category: 'logistics', text: text.trim() })
      onClose(true)
    } catch (e) { showToast(e.message, 'warn') }
  }
  return (
    <Sheet title="Нова поїздка" onClose={() => onClose(false)}>
      <input placeholder="Напр.: забрати оператора о 9:00" value={text} autoFocus
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
      <button className="btn-primary" style={{ background: 'var(--gold)', opacity: text.trim() ? 1 : 0.45 }}
        disabled={!text.trim()} onClick={add}>Зберегти</button>
      {toast}
    </Sheet>
  )
}

function Shift({ me }) {
  const [tasks, setTasks] = useState(null)
  const [money, setMoney] = useState(null)
  const [adding, setAdding] = useState(false)
  const load = useCallback(() => {
    get('/api/tasks?category=logistics').then(setTasks).catch(() => setTasks([]))
    get('/api/money').then(setMoney).catch(() => {})
  }, [])
  usePoll(load)

  if (!tasks) return <div className="loading">Завантаження…</div>
  const today = tasks.filter((t) => isToday(t.time))
  const doneToday = today.filter((t) => t.status === 'done').length
  const fuelToday = (money?.expenses || [])
    .filter((e) => isToday(e.time))
    .reduce((s, e) => s + e.amount, 0)

  return (
    <div className="screen">
      <Header icon="truck" color="var(--gold)" title={`Привіт, ${me.name?.split(' ')[0] || ''}`} sub="зміна · сьогодні" />
      <div className="stat-grid">
        <div className="stat"><div className="num">{doneToday || today.length}</div><div className="lbl">подачі</div></div>
        <div className="stat"><div className="num">{Math.round(fuelToday).toLocaleString('uk-UA')}<small> ₴</small></div><div className="lbl">паливо сьогодні</div></div>
      </div>
      <button className="btn-primary" style={{ background: 'var(--gold)' }} onClick={() => setAdding(true)}>
        {Icons.pin(20)} Нова поїздка
      </button>
      <div className="section-label">Сьогодні</div>
      {today.length === 0 && <div className="empty">Поїздок ще немає</div>}
      {today.map((t) => (
        <div key={t.id} className="entry gold">
          <div className="top"><span className="label">ПОДАЧА</span><span className="time">{fmtTime(t.time)}</span></div>
          <div className="text">{t.text}</div>
          <div className="meta">{t.status === 'done' ? Icons.check(13) : Icons.clock(13)} {t.status === 'done' ? 'виконано' : 'в роботі'}</div>
        </div>
      ))}
      {adding && <AddTripSheet onClose={(saved) => { setAdding(false); if (saved) load() }} />}
    </div>
  )
}

function Trips() {
  const [tasks, setTasks] = useState(null)
  const [sel, setSel] = useState(null)
  const [adding, setAdding] = useState(false)
  const load = useCallback(() => get('/api/tasks?category=logistics').then(setTasks).catch(() => setTasks([])), [])
  usePoll(load)

  if (!tasks) return <div className="loading">Завантаження…</div>
  return (
    <div className="screen">
      <Header icon="pin" color="var(--gold)" title="Поїздки" sub={`${tasks.length} всього`} />
      {tasks.length === 0 && <div className="empty">Поїздок ще немає</div>}
      {tasks.map((t) => (
        <button key={t.id} className={`item ${t.status === 'done' ? 'done' : ''}`} onClick={() => setSel(t)}>
          <span className={`dot ${t.status === 'done' ? 'ok' : 'warn'}`} />
          <span className="ico">{Icons.pin(19)}</span>
          <span className="grow">{t.text}</span>
          <span className={`tag ${t.status === 'done' ? 'ok' : 'warn'}`}>{t.status === 'done' ? 'готово' : 'в роботі'}</span>
          <span className="ico" style={{ color: 'var(--muted)' }}>{Icons.pencil(15)}</span>
        </button>
      ))}
      <button className="btn-dashed" style={{ color: 'var(--gold)' }} onClick={() => setAdding(true)}>
        {Icons.plus(18)} Нова поїздка
      </button>
      {adding && <AddTripSheet onClose={(saved) => { setAdding(false); if (saved) load() }} />}
      {sel && (
        <TaskSheet t={sel} color="var(--gold)" onClose={() => setSel(null)}
          onChanged={() => { setSel(null); load() }} />
      )}
    </div>
  )
}

function Money() {
  const [m, setM] = useState(null)
  const [sel, setSel] = useState(null)
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [amount, setAmount] = useState('')
  const [toast, showToast] = useToast()
  const load = useCallback(() => get('/api/money').then(setM).catch(() => {}), [])
  usePoll(load)

  const add = async () => {
    try {
      await post('/api/money', { text: text.trim(), amount: Number(amount) })
      setAdding(false); setText(''); setAmount('')
      load()
    } catch (e) { showToast(e.message, 'warn') }
  }

  if (!m) return <div className="loading">Завантаження…</div>
  return (
    <div className="screen">
      <Header icon="fuel" color="var(--gold)" title="Фінанси" sub="паливо й витрати" />
      <button className="btn-primary" style={{ background: 'var(--gold)' }} onClick={() => setAdding(true)}>
        {Icons.plus(20)} Додати витрату
      </button>
      {m.expenses.length === 0 && <div className="empty">Витрат ще немає</div>}
      {m.expenses.map((e) => (
        <div key={e.id} className="entry gold">
          <div className="top">
            <span className="label">ФІНАНСИ</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="time">{fmtTime(e.time)}</span>
              {(e.mine || m.can_approve) && (
                <button className="btn-icon" aria-label="Редагувати" onClick={() => setSel(e)}>
                  {Icons.pencil(15)}
                </button>
              )}
            </span>
          </div>
          <div className="text">{e.text || 'Витрата'} · {Math.round(e.amount).toLocaleString('uk-UA')} ₴</div>
          <div className="meta">{e.approved ? Icons.check(13) : Icons.clock(13)} {e.approved ? 'підтверджено' : 'чекає підтвердження'}</div>
          {e.comment && <div className="meta comment-line">{Icons.comment(13)} {e.comment}</div>}
        </div>
      ))}
      {adding && (
        <Sheet title="Нова витрата" onClose={() => setAdding(false)}>
          <input placeholder="На що (напр. Паливо)" value={text} autoFocus onChange={(e) => setText(e.target.value)} />
          <MoneyInput value={amount} onChange={setAmount} placeholder="Сума" />
          <button className="btn-primary"
            style={{ background: 'var(--gold)', opacity: text.trim() && Number(amount) > 0 ? 1 : 0.45 }}
            disabled={!text.trim() || !(Number(amount) > 0)} onClick={add}>
            Зберегти
          </button>
        </Sheet>
      )}
      {sel && (
        <ExpenseSheet e={sel} canApprove={m.can_approve} color="var(--gold)"
          onClose={() => setSel(null)} onChanged={() => { setSel(null); load() }} />
      )}
      {toast}
    </div>
  )
}
