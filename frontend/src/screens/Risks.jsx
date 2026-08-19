import { useCallback, useState } from 'react'
import { get, post } from '../api'
import { Header, Icons, fmtTime, usePoll, useToast } from '../components'
import { aktyvni } from './shared'

/* ---------- дрілдаун: Тривоги ---------- */
export default function Risks({ onBack }) {
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
