import { useCallback, useState } from 'react'
import { get } from '../api'
import { Header, Icons, Meter, findCat, useDictionaries, usePoll } from '../components'
import { aktyvni, poyizdky, spravy } from './shared'

const LOAD_LABEL = { LOW: 'НИЗЬКИЙ', MED: 'СЕРЕДНІЙ', HIGH: 'ВИСОКИЙ' }
const LOAD_PCT = { LOW: 25, MED: 55, HIGH: 90 }

/* ---------- Головна (панель) ---------- */
export default function Home({ openView }) {
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

      <button className="nav-row" onClick={() => openView('alltasks')}>
        <span className="ico">{Icons.task(20)}</span>
        <span className="grow">
          Усі задачі
          <span className="row-sub">з фільтрами за категорією, людиною й датою</span>
        </span>
        <span className="chev">›</span>
      </button>

      {/* налаштування — окремим підписаним рядком: іконкою в шапці її не було
          видно, бо той кут займає дзвіночок */}
      <button className="nav-row" onClick={() => openView('settings')}>
        <span className="ico">{Icons.gear(20)}</span>
        <span className="grow">
          Налаштування
          <span className="row-sub">важливість, категорії, ролі</span>
        </span>
        <span className="chev">›</span>
      </button>
    </div>
  )
}
