import { useCallback, useState } from 'react'
import { get, patch, post } from '../api'
import { CenterModal, ExpenseSheet, Header, Icons, MoneyInput, NotificationBell, TabBar, TaskSheet, usePoll, useToast } from '../components'

export default function Assistant({ me }) {
  const [tab, setTab] = useState('life')
  return (
    <div className="app">
      <NotificationBell me={me} />
      <div className="app-scroll">
        {tab === 'life' && <Life me={me} category="life" />}
        {tab === 'dog' && <Life me={me} category="dog" />}
        {tab === 'money' && <Money />}
      </div>
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
  const [sel, setSel] = useState(null)
  const [text, setText] = useState('')
  const [toast, showToast] = useToast()

  const load = useCallback(
    () => get(`/api/tasks?category=${category}`).then(setTasks).catch(() => setTasks([])),
    [category],
  )
  usePoll(load)

  const add = async () => {
    if (!text.trim()) return
    try {
      await post('/api/tasks', { category, text: text.trim() })
      setAdding(false); setText('')
      load()
    } catch (e) { showToast(e.message, 'warn') }
  }

  if (!tasks) return <div className="loading">Завантаження…</div>
  const isDog = category === 'dog'
  const open = tasks.filter((t) => t.status === 'open')
  const done = tasks.filter((t) => t.status === 'done')

  return (
    <div className="screen">
      <Header icon={isDog ? 'dog' : 'home'} color="var(--green)"
        title={isDog ? 'Пес' : `Привіт, ${me.name?.split(' ')[0] || ''}`}
        sub={isDog ? 'все про собаку' : me.role_label} />
      <button className="btn-primary" style={{ background: 'var(--green)' }} onClick={() => setAdding(true)}>
        {Icons.plus(20)} Додати справу
      </button>
      <div className="section-label">Мої справи</div>
      {open.length === 0 && <div className="empty"><span className="ico-text">{Icons.check(16)} Все зроблено</span></div>}
      {open.map((t) => (
        <button key={t.id} className="item" onClick={() => setSel(t)}>
          <span className="dot warn" />
          <span className="ico">{Icons[isDog ? 'dog' : 'home'](19)}</span>
          <span className="grow">{t.text}</span>
          <span className="tag warn">{t.due ? `до ${t.due.slice(5)}` : 'сьогодні'}</span>
          <span className="ico" style={{ color: 'var(--muted)' }}>{Icons.pencil(15)}</span>
        </button>
      ))}
      {done.length > 0 && <div className="section-label">Зроблено</div>}
      {done.slice(0, 5).map((t) => (
        <button key={t.id} className="item done" onClick={() => setSel(t)}>
          <span className="dot ok" />
          <span className="ico">{Icons.check(19)}</span>
          <span className="grow">{t.text}</span>
          <span className="ico" style={{ color: 'var(--muted)' }}>{Icons.pencil(15)}</span>
        </button>
      ))}
      {sel && (
        <TaskSheet t={sel} color="var(--green)" onClose={() => setSel(null)}
          onChanged={() => { setSel(null); load() }} />
      )}
      {adding && (
        <CenterModal title={isDog ? 'Нова справа про пса' : 'Нова справа'} onClose={() => setAdding(false)}>
          <input placeholder="Напр.: записати на хімчистку" value={text}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn-primary" style={{ background: 'var(--green)' }} onClick={add}>Зберегти</button>
        </CenterModal>
      )}
      {toast}
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
      <Header icon="wallet" color="var(--green)" title="Фінанси" sub="побутові витрати" />
      <button className="btn-primary" style={{ background: 'var(--green)' }} onClick={() => setAdding(true)}>
        {Icons.plus(20)} Додати витрату
      </button>
      {m.expenses.length === 0 && <div className="empty">Витрат ще немає</div>}
      {m.expenses.map((e) => (
        <div key={e.id} className="item" style={{ cursor: 'default' }}>
          <span className={`dot ${e.approved ? 'ok' : 'warn'}`} />
          <span className="ico">{Icons.cart(19)}</span>
          <span className="grow">
            {e.text || 'Витрата'}
            {e.comment && <span className="comment-line">{Icons.comment(13)} {e.comment}</span>}
          </span>
          <span className="amount">{Math.round(e.amount).toLocaleString('uk-UA')} ₴</span>
          {(e.mine || m.can_approve) && (
            <button className="btn-icon" aria-label="Редагувати" onClick={() => setSel(e)}>
              {Icons.pencil(16)}
            </button>
          )}
        </div>
      ))}
      {adding && (
        <CenterModal title="Нова витрата" onClose={() => setAdding(false)}>
          <input placeholder="На що (напр. Продукти)" value={text} onChange={(e) => setText(e.target.value)} />
          <MoneyInput value={amount} onChange={setAmount} placeholder="Сума" />
          <button className="btn-primary"
            style={{ background: 'var(--green)', opacity: text.trim() && Number(amount) > 0 ? 1 : 0.45 }}
            disabled={!text.trim() || !(Number(amount) > 0)} onClick={add}>
            Зберегти
          </button>
        </CenterModal>
      )}
      {sel && (
        <ExpenseSheet e={sel} canApprove={m.can_approve} color="var(--green)"
          onClose={() => setSel(null)} onChanged={() => { setSel(null); load() }} />
      )}
      {toast}
    </div>
  )
}
