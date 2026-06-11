import { useCallback, useEffect, useState } from 'react'
import { get, patch } from '../api'
import { Dictate, Header, Icons, TabBar, fmtTime } from '../components'

export default function Driver({ me }) {
  const [tab, setTab] = useState('shift')
  return (
    <div className="app">
      {tab === 'shift' && <Shift me={me} />}
      {tab === 'trips' && <Trips />}
      {tab === 'money' && <Money />}
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

function Shift({ me }) {
  const [tasks, setTasks] = useState(null)
  const [money, setMoney] = useState(null)
  const load = useCallback(() => {
    get('/api/tasks?category=logistics').then(setTasks).catch(() => setTasks([]))
    get('/api/money').then(setMoney).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

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
      <button className="btn-primary" style={{ background: 'var(--gold)' }}
        onClick={() => document.querySelector('.dictate input')?.focus()}>
        {Icons.pin(20)} Нова поїздка
      </button>
      <div className="section-label">Сьогодні</div>
      {today.length === 0 && <div className="empty">Поїздок ще немає</div>}
      {today.map((t) => (
        <div key={t.id} className="entry gold">
          <div className="top"><span className="label">ПОДАЧА</span><span className="time">{fmtTime(t.time)}</span></div>
          <div className="text">{t.text}</div>
          <div className="meta">{t.status === 'done' ? '✓ виконано' : '🕐 в роботі'}</div>
        </div>
      ))}
      <Dictate placeholder="Продиктуй поїздку…" color="var(--gold)" onSaved={load} />
    </div>
  )
}

function Trips() {
  const [tasks, setTasks] = useState(null)
  const load = useCallback(() => get('/api/tasks?category=logistics').then(setTasks).catch(() => setTasks([])), [])
  useEffect(() => { load() }, [load])

  const toggle = async (t) => {
    const next = t.status === 'open' ? 'done' : 'open'
    try {
      await patch(`/api/tasks/${t.id}`, { status: next })
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)))
    } catch { /* ignore */ }
  }

  if (!tasks) return <div className="loading">Завантаження…</div>
  return (
    <div className="screen">
      <Header icon="pin" color="var(--gold)" title="Поїздки" sub={`${tasks.length} всього`} />
      {tasks.length === 0 && <div className="empty">Поїздок ще немає</div>}
      {tasks.map((t) => (
        <button key={t.id} className={`item ${t.status === 'done' ? 'done' : ''}`} onClick={() => toggle(t)}>
          <span className={`dot ${t.status === 'done' ? 'ok' : 'warn'}`} />
          <span className="ico">{Icons.pin(19)}</span>
          <span className="grow">{t.text}</span>
          <span className={`tag ${t.status === 'done' ? 'ok' : 'warn'}`}>{t.status === 'done' ? 'готово' : 'в роботі'}</span>
        </button>
      ))}
      <Dictate placeholder="Нова поїздка…" color="var(--gold)" onSaved={load} />
    </div>
  )
}

function Money() {
  const [m, setM] = useState(null)
  const load = useCallback(() => get('/api/money').then(setM).catch(() => {}), [])
  useEffect(() => { load() }, [load])
  if (!m) return <div className="loading">Завантаження…</div>
  return (
    <div className="screen">
      <Header icon="fuel" color="var(--gold)" title="Фінанси" sub="паливо й витрати" />
      {m.expenses.length === 0 && <div className="empty">Витрат ще немає</div>}
      {m.expenses.map((e) => (
        <div key={e.id} className="entry gold">
          <div className="top"><span className="label">ФІНАНСИ</span><span className="time">{fmtTime(e.time)}</span></div>
          <div className="text">{e.text || 'Витрата'} · {Math.round(e.amount).toLocaleString('uk-UA')} ₴</div>
          <div className="meta">{e.approved ? '✓ підтверджено' : '🕐 чекає підтвердження'}</div>
        </div>
      ))}
      <Dictate placeholder="Напр.: паливо 1100 грн…" color="var(--gold)" onSaved={load} />
    </div>
  )
}
