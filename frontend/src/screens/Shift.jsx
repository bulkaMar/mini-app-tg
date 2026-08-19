/* Зведення зміни водія: подачі й паливо за сьогодні.
   Єдина вкладка, привʼязана до ролі — власниця лишила її водієві. */
import { useCallback, useState } from 'react'
import { get } from '../api'
import {
  Header, Icons, NewTaskModal, PriorityMark, fmtTime, money, usePoll,
} from '../components'

const isToday = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString()

function AddTripSheet({ me, onClose }) {
  return (
    <NewTaskModal
      defaultCategory="logistics" color="var(--gold)"
      title="Нова поїздка" placeholder="Напр.: забрати оператора о 9:00"
      onClose={() => onClose(false)} onSaved={() => onClose(true)}
    />
  )
}

export default function Shift({ me }) {
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
      <Header icon="truck" color="var(--gold)" title={`Привіт, ${me.name?.split(' ')[0] || ''}`} sub={me.role_label} />
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
          <div className="top">
            <span className="label">ПОДАЧА</span>
            <span className="time">{fmtTime(t.time)}</span>
          </div>
          <div className="text">{t.text}</div>
          <div className="meta">
            {t.status === 'done' ? Icons.check(13) : Icons.clock(13)} {t.status === 'done' ? 'виконано' : 'в роботі'}
            {t.priority !== 'normal' && <PriorityMark p={t.priority} />}
          </div>
        </div>
      ))}
      {adding && <AddTripSheet me={me} onClose={(saved) => { setAdding(false); if (saved) load() }} />}
    </div>
  )
}
