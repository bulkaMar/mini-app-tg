import { useCallback, useEffect, useState } from 'react'
import { get, post } from '../api'
import { CAT_LABEL, Dictate, Entry, Header, Icons, TabBar, fmtTime, useToast } from '../components'

export default function Manager({ me }) {
  const [tab, setTab] = useState('project')
  return (
    <div className="app">
      {tab === 'project' && <Project me={me} />}
      {tab === 'risks' && <Risks />}
      {tab === 'tasks' && <Tasks />}
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
  useEffect(() => { load() }, [load])

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
        <Entry key={e.id} e={e}
          label={e.type === 'risk' ? undefined : e.type === 'money' ? 'ФІНАНСИ' : e.type === 'status' ? 'СТАТУС' : CAT_LABEL[e.category]} />
      ))}
      <Dictate placeholder="Продиктуй звіт…" color="var(--blue)" onSaved={load} />
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
    } catch (e) { showToast(`⚠️ ${e.message}`) }
  }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Звіт зі зйомки</h2>
        <input placeholder="Напр.: знято 3 сцени з 5, локація на чт під питанням"
          value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} autoFocus />
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
  useEffect(() => { load() }, [load])

  const resolve = async (id) => {
    try { await post(`/api/risks/${id}/resolve`); load() } catch (e) { showToast(`⚠️ ${e.message}`) }
  }

  if (!risks) return <div className="loading">Завантаження…</div>
  const active = risks.filter((r) => !r.resolved)
  return (
    <div className="screen">
      <Header icon="alert" color="var(--red)" title="Тривоги" sub={`${active.length} активні`} />
      {active.length === 0 && <div className="empty">🟢 Тривог немає</div>}
      {active.map((r) => (
        <div key={r.id} className={`entry ${r.level === 'high' ? 'red' : 'gold'}`}>
          <div className="top">
            <span className="label">ТРИВОГА · {r.level.toUpperCase()}</span>
            <span className="time">{fmtTime(r.time)}</span>
          </div>
          <div className="text">{r.text}</div>
          <div className="meta" style={{ justifyContent: 'space-between' }}>
            <span>{r.keyword_hit ? '⚠️ пуш власнику' : '🕐 чекає рішення'}</span>
            <button className="btn-small ghost" onClick={() => resolve(r.id)}>Вирішено</button>
          </div>
        </div>
      ))}
      <Dictate placeholder="Продиктуй тривогу…" color="var(--red)" onSaved={load} />
      {toast}
    </div>
  )
}

function Tasks() {
  const [tasks, setTasks] = useState(null)
  const load = useCallback(() => get('/api/tasks?category=production').then(setTasks).catch(() => setTasks([])), [])
  useEffect(() => { load() }, [load])
  if (!tasks) return <div className="loading">Завантаження…</div>
  const open = tasks.filter((t) => t.status === 'open')
  return (
    <div className="screen">
      <Header icon="task" color="var(--blue)" title="Задачі" sub={`${open.length} відкриті`} />
      {open.length === 0 && <div className="empty">Відкритих задач немає</div>}
      {open.map((t) => (
        <div key={t.id} className="item" style={{ cursor: 'default' }}>
          <span className="dot warn" />
          <span className="ico">{Icons.film(19)}</span>
          <span className="grow">{t.text}</span>
          {t.due && <span className="tag warn">до {t.due.slice(5)}</span>}
        </div>
      ))}
      <Dictate placeholder="Нова задача…" color="var(--blue)" onSaved={load} />
    </div>
  )
}
