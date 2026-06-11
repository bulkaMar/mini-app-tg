import { useCallback, useEffect, useState } from 'react'
import { get, patch, post } from '../api'
import { Dictate, Header, Icons, Sheet, TabBar, useToast } from '../components'

export default function Assistant({ me }) {
  const [tab, setTab] = useState('life')
  return (
    <div className="app">
      {tab === 'life' && <Life me={me} category="life" />}
      {tab === 'dog' && <Life me={me} category="dog" />}
      {tab === 'money' && <Money />}
      <TabBar
        tabs={[
          { key: 'life', icon: 'home', label: 'Побут' },
          { key: 'dog', icon: 'dog', label: 'Пес' },
          { key: 'money', icon: 'wallet', label: 'Фінанси' },
        ]}
        active={tab}
        onChange={setTab}
      />
    </div>
  )
}

function Life({ me, category }) {
  const [tasks, setTasks] = useState(null)
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [toast, showToast] = useToast()

  const load = useCallback(
    () => get(`/api/tasks?category=${category}`).then(setTasks).catch(() => setTasks([])),
    [category],
  )
  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!text.trim()) return
    try {
      await post('/api/tasks', { category, text: text.trim() })
      setAdding(false); setText('')
      load()
    } catch (e) { showToast(`⚠️ ${e.message}`) }
  }

  const toggle = async (t) => {
    const next = t.status === 'open' ? 'done' : 'open'
    try {
      await patch(`/api/tasks/${t.id}`, { status: next })
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)))
    } catch { /* ignore */ }
  }

  if (!tasks) return <div className="loading">Завантаження…</div>
  const isDog = category === 'dog'
  const open = tasks.filter((t) => t.status === 'open')
  const done = tasks.filter((t) => t.status === 'done')

  return (
    <div className="screen">
      <Header icon={isDog ? 'dog' : 'home'} color="var(--green)"
        title={isDog ? 'Пес' : `Привіт, ${me.name?.split(' ')[0] || ''}`}
        sub={isDog ? 'все про собаку' : 'побут · пес'} />
      <button className="btn-primary" style={{ background: 'var(--green)' }} onClick={() => setAdding(true)}>
        {Icons.plus(20)} Додати справу
      </button>
      <div className="section-label">Мої справи</div>
      {open.length === 0 && <div className="empty">Все зроблено 🎉</div>}
      {open.map((t) => (
        <button key={t.id} className="item" onClick={() => toggle(t)}>
          <span className="dot warn" />
          <span className="ico">{Icons[isDog ? 'dog' : 'home'](19)}</span>
          <span className="grow">{t.text}</span>
          <span className="tag warn">{t.due ? `до ${t.due.slice(5)}` : 'сьогодні'}</span>
        </button>
      ))}
      {done.length > 0 && <div className="section-label">Зроблено</div>}
      {done.slice(0, 5).map((t) => (
        <button key={t.id} className="item done" onClick={() => toggle(t)}>
          <span className="dot ok" />
          <span className="ico">{Icons.check(19)}</span>
          <span className="grow">{t.text}</span>
        </button>
      ))}
      <Dictate placeholder="Продиктуй справу…" color="var(--green)" onSaved={load} />

      {adding && (
        <Sheet title={isDog ? 'Нова справа про пса' : 'Нова справа'} onClose={() => setAdding(false)}>
          <input placeholder="Напр.: записати на хімчистку" value={text}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} autoFocus />
          <button className="btn-primary" style={{ background: 'var(--green)' }} onClick={add}>Зберегти</button>
        </Sheet>
      )}
      {toast}
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
      <Header icon="wallet" color="var(--green)" title="Фінанси" sub="побутові витрати" />
      {m.expenses.length === 0 && <div className="empty">Витрат ще немає</div>}
      {m.expenses.map((e) => (
        <div key={e.id} className="item" style={{ cursor: 'default' }}>
          <span className={`dot ${e.approved ? 'ok' : 'warn'}`} />
          <span className="ico">{Icons.cart(19)}</span>
          <span className="grow">{e.text || 'Витрата'}</span>
          <span className="amount">{Math.round(e.amount).toLocaleString('uk-UA')} ₴</span>
        </div>
      ))}
      <Dictate placeholder="Напр.: продукти 480 грн…" color="var(--green)" onSaved={load} />
    </div>
  )
}
