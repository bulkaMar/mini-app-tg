import { useCallback, useState } from 'react'
import { get, post } from '../api'
import { Entry, Header, Icons, NotificationBell, Sheet, TabBar, TaskSheet, directionLabel, fmtTime, usePoll, useToast } from '../components'

export default function Manager({ me }) {
  const [tab, setTab] = useState('project')
  return (
    <div className="app">
      <NotificationBell me={me} />
      <div className="app-scroll">
        {tab === 'project' && <Project me={me} />}
        {tab === 'risks' && <Risks />}
        {tab === 'tasks' && <Tasks />}
      </div>
      <TabBar
        tabs={[
          { key: 'project', icon: 'film', label: 'Проєкт' },
          { key: 'risks', icon: 'alert', label: 'Тривоги' },
          { key: 'tasks', icon: 'task', label: 'Задачі' },
        ]}
        active={tab}
        onChange={setTab}
      />
    </div>
  )
}

function Project({ me }) {
  const [feed, setFeed] = useState(null)
  const [report, setReport] = useState(false)
  const load = useCallback(() => get('/api/feed').then(setFeed).catch(() => setFeed([])), [])
  usePoll(load)

  if (!feed) return <div className="loading">Завантаження…</div>
  return (
    <div className="screen">
      <Header icon="film" color="var(--blue)" title={`Привіт, ${me.name?.split(' ')[0] || 'колего'}`} sub="проєкти · сьогодні" />
      <button className="btn-primary" style={{ background: 'var(--blue)' }} onClick={() => setReport(true)}>
        {Icons.plus(20)} Звіт зі зйомки
      </button>
      <div className="section-label">Сьогодні</div>
      {feed.length === 0 && <div className="empty">Записів ще немає — продиктуй перший звіт</div>}
      {feed.slice(0, 10).map((e) => (
        <Entry key={e.id} e={e} label={directionLabel(e, me?.role)} />
      ))}
      {report && <ReportSheet onClose={() => { setReport(false); load() }} />}
    </div>
  )
}

function ReportSheet({ onClose }) {
  const [text, setText] = useState('')
  const [toast, showToast] = useToast()
  const send = async () => {
    if (!text.trim()) return
    try {
      await post('/api/ingest', { text: text.trim() })
      onClose()
    } catch (e) { showToast(e.message, 'warn') }
  }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Звіт зі зйомки</h2>
        <input placeholder="Напр.: знято 3 сцени з 5, локація на чт під питанням"
          value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="btn-primary" style={{ background: 'var(--blue)' }} onClick={send}>Надіслати</button>
        {toast}
      </div>
    </div>
  )
}

function Risks() {
  const [risks, setRisks] = useState(null)
  const [toast, showToast] = useToast()
  const load = useCallback(() => get('/api/risks').then(setRisks).catch(() => setRisks([])), [])
  usePoll(load)

  const resolve = async (id) => {
    try { await post(`/api/risks/${id}/resolve`); load() } catch (e) { showToast(e.message, 'warn') }
  }

  if (!risks) return <div className="loading">Завантаження…</div>
  const active = risks.filter((r) => !r.resolved)
  return (
    <div className="screen">
      <Header icon="alert" color="var(--red)" title="Тривоги" sub={`${active.length} активні`} />
      {active.length === 0 && <div className="empty"><span className="ico-text">{Icons.check(16)} Тривог немає</span></div>}
      {active.map((r) => (
        <div key={r.id} className={`entry ${r.level === 'high' ? 'red' : 'gold'}`}>
          <div className="top">
            <span className="label">ТРИВОГА · {r.level.toUpperCase()}</span>
            <span className="time">{fmtTime(r.time)}</span>
          </div>
          <div className="text">{r.text}</div>
          <div className="meta" style={{ justifyContent: 'space-between' }}>
            <span className="ico-text">{r.keyword_hit ? Icons.alert(13) : Icons.clock(13)} {r.keyword_hit ? 'пуш власнику' : 'чекає рішення'}</span>
            <button className="btn-small ghost" onClick={() => resolve(r.id)}>Вирішено</button>
          </div>
        </div>
      ))}
      {toast}
    </div>
  )
}

function Tasks() {
  const [tasks, setTasks] = useState(null)
  const [sel, setSel] = useState(null)
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [toast, showToast] = useToast()
  const load = useCallback(() => get('/api/tasks?category=production').then(setTasks).catch(() => setTasks([])), [])
  usePoll(load)

  const add = async () => {
    if (!text.trim()) return
    try {
      await post('/api/tasks', { category: 'production', text: text.trim() })
      setAdding(false); setText('')
      load()
    } catch (e) { showToast(e.message, 'warn') }
  }

  if (!tasks) return <div className="loading">Завантаження…</div>
  const open = tasks.filter((t) => t.status === 'open')
  return (
    <div className="screen">
      <Header icon="task" color="var(--blue)" title="Задачі" sub={`${open.length} відкриті`} />
      {open.length === 0 && <div className="empty">Відкритих задач немає</div>}
      {open.map((t) => (
        <button key={t.id} className="item" onClick={() => setSel(t)}>
          <span className="dot warn" />
          <span className="ico">{Icons.film(19)}</span>
          <span className="grow">{t.text}</span>
          {t.due && <span className="tag warn">до {t.due.slice(5)}</span>}
          <span className="ico" style={{ color: 'var(--muted)' }}>{Icons.pencil(15)}</span>
        </button>
      ))}
      <button className="btn-dashed" style={{ color: 'var(--blue)' }} onClick={() => setAdding(true)}>
        {Icons.plus(18)} Додати задачу
      </button>
      {adding && (
        <Sheet title="Нова задача" onClose={() => setAdding(false)}>
          <input placeholder="Напр.: підтвердити локацію на чт" value={text}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn-primary" style={{ background: 'var(--blue)', opacity: text.trim() ? 1 : 0.45 }}
            disabled={!text.trim()} onClick={add}>Зберегти</button>
        </Sheet>
      )}
      {sel && (
        <TaskSheet t={sel} color="var(--blue)" onClose={() => setSel(null)}
          onChanged={() => { setSel(null); load() }} />
      )}
      {toast}
    </div>
  )
}
