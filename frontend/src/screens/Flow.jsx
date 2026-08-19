import { useCallback, useState } from 'react'
import { get } from '../api'
import { Entry, Header, Icons, directionLabel, usePoll } from '../components'
import Report from './Report'

/* ---------- Потік ---------- */
export default function Flow({ me }) {
  const [feed, setFeed] = useState(null)
  const [report, setReport] = useState(false)
  const load = useCallback(() => get('/api/feed').then(setFeed).catch(() => setFeed([])), [])
  usePoll(load)
  if (!feed) return <div className="loading">Завантаження…</div>
  return (
    <div className="screen">
      <Header icon="inbox" color="var(--orange)" title="Потік" sub={`${feed.length} записів`} />
      <button className="btn-primary" style={{ background: 'var(--orange)' }} onClick={() => setReport(true)}>
        {Icons.plus(20)} Звіт
      </button>
      {feed.length === 0 && <div className="empty">Записів ще немає</div>}
      {feed.map((e) => <Entry key={e.id} e={e} label={directionLabel(e, me?.role)} />)}
      {report && <Report onClose={(sent) => { setReport(false); if (sent) load() }} />}
    </div>
  )
}
