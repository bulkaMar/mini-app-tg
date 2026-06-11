import { useEffect, useRef, useState } from 'react'
import { post } from './api'
import { haptic } from './telegram'

/* ---------- іконки (інлайн SVG, stroke 1.8) ---------- */
const I = ({ children, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
export const Icons = {
  pulse: (s) => <I size={s}><path d="M3 12h4l2-7 4 14 2-7h6" /></I>,
  inbox: (s) => <I size={s}><path d="M3 13h5l2 3h4l2-3h5" /><path d="M5 5h14l2 8v6H3v-6z" /></I>,
  shield: (s) => <I size={s}><path d="M12 3l8 3v6c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6z" /></I>,
  wallet: (s) => <I size={s}><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M16 12h3" /><path d="M3 9h18" /></I>,
  film: (s) => <I size={s}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 14h4M17 9h4M17 14h4" /></I>,
  home: (s) => <I size={s}><path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-5v-6h-4v6H5a1 1 0 01-1-1z" /></I>,
  dog: (s) => <I size={s}><circle cx="8" cy="9" r="1.6" /><circle cx="16" cy="9" r="1.6" /><circle cx="5" cy="13" r="1.4" /><circle cx="19" cy="13" r="1.4" /><path d="M12 13c-2.8 0-4.5 2-4.5 4 0 1.6 1.3 3 3 2.4.8-.3 2.2-.3 3 0 1.7.6 3-.8 3-2.4 0-2-1.7-4-4.5-4z" /></I>,
  truck: (s) => <I size={s}><rect x="2" y="7" width="12" height="9" rx="1.5" /><path d="M14 10h4l3 3v3h-7z" /><circle cx="6.5" cy="17.5" r="1.7" /><circle cx="17.5" cy="17.5" r="1.7" /></I>,
  pin: (s) => <I size={s}><path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></I>,
  fuel: (s) => <I size={s}><rect x="4" y="4" width="9" height="16" rx="1.5" /><path d="M7 8h3" /><path d="M13 9l4-2 3 3v7a1.6 1.6 0 01-3.2 0V13H13" /></I>,
  cart: (s) => <I size={s}><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /><path d="M3 4h2l2.5 11h10L20 7H6" /></I>,
  alert: (s) => <I size={s}><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.2v.1" /></I>,
  check: (s) => <I size={s}><path d="M4.5 12.5l5 5 10-11" /></I>,
  clock: (s) => <I size={s}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></I>,
  mic: (s) => <I size={s}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3" /></I>,
  plus: (s) => <I size={s}><path d="M12 5v14M5 12h14" /></I>,
  send: (s) => <I size={s}><path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" /></I>,
  bell: (s) => <I size={s}><path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 19a2.2 2.2 0 004 0" /></I>,
  addUser: (s) => <I size={s}><circle cx="10" cy="8" r="3.5" /><path d="M4 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M19 7v6M16 10h6" /></I>,
  task: (s) => <I size={s}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></I>,
  back: (s) => <I size={s}><path d="M15 5l-7 7 7 7" /></I>,
}

export const ROLE_COLOR = { owner: 'var(--ink)', manager: 'var(--blue)', assistant: 'var(--green)', driver: 'var(--gold)' }
export const ROLE_BADGE = { owner: 'ВЛАСНИК', manager: 'МЕНЕДЖЕР', assistant: 'АСИСТЕНТ', driver: 'ВОДІЙ' }
export const TYPE_LABEL = { task: 'ЗАДАЧА', risk: 'ТРИВОГА', money: 'ФІНАНСИ', status: 'СТАТУС' }
export const CAT_LABEL = { production: 'ПРОЄКТ', life: 'ПОБУТ', dog: 'ПЕС', finance: 'ФІНАНСИ', logistics: 'ПОДАЧА' }

export function entryColor(e) {
  if (e.type === 'risk') return 'red'
  if (e.type === 'money') return e.role === 'driver' ? 'gold' : 'blue'
  if (e.role === 'manager') return 'blue'
  if (e.role === 'assistant') return 'green'
  if (e.role === 'driver') return 'gold'
  return 'orange'
}

export function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

/* ---------- спільні блоки ---------- */

export function Header({ icon, color, title, sub, right }) {
  return (
    <div className="header">
      <div className="icon-tile" style={{ background: color }}>{Icons[icon]?.(22)}</div>
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div className="spacer" />
      {right}
    </div>
  )
}

export function Entry({ e, label }) {
  return (
    <div className={`entry ${entryColor(e)}`}>
      <div className="top">
        <span className="label">{label ?? (e.type === 'risk' ? `ТРИВОГА${e.level ? ' · ' + e.level.toUpperCase() : ''}` : TYPE_LABEL[e.type] || e.role_label?.toUpperCase())}</span>
        <span className="time">{fmtTime(e.time)}</span>
      </div>
      <div className="text">{e.text}</div>
      {e.meta && <div className="meta">{e.meta}</div>}
    </div>
  )
}

export function TabBar({ tabs, active, onChange }) {
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <button key={t.key} className={active === t.key ? 'active' : ''}
          onClick={() => { haptic(); onChange(t.key) }}>
          {Icons[t.icon]?.(22)}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}

export function Meter({ title, value, pct, level }) {
  return (
    <div className="meter">
      <div className="row">
        <span className="title">{title}</span>
        <span className={`val ${level || ''}`}>{value}</span>
      </div>
      <div className="bar"><i style={{ width: `${Math.min(pct, 100)}%` }} /></div>
    </div>
  )
}

let toastTimer
export function useToast() {
  const [msg, setMsg] = useState(null)
  const show = (m) => {
    setMsg(m)
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => setMsg(null), 2600)
  }
  const node = msg ? <div className="toast">{msg}</div> : null
  return [node, show]
}

/* ---------- диктування: текст + мікрофон → /api/ingest ---------- */
export function Dictate({ placeholder = 'Продиктуй або напиши…', color = 'var(--orange)', onSaved }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const recRef = useRef(null)
  const [toast, showToast] = useToast()

  const submitText = async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      const r = await post('/api/ingest', { text: t })
      setText('')
      showToast(`✅ ${TYPE_LABEL[r.type] || 'Запис'} · ${CAT_LABEL[r.category] || ''} — збережено`)
      onSaved?.(r)
    } catch (err) {
      showToast(`⚠️ ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const toggleRecord = async () => {
    if (recording) {
      recRef.current?.stop()
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast('Мікрофон недоступний у цьому WebView — напиши текстом')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      const chunks = []
      rec.ondataavailable = (e) => chunks.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setRecording(false)
        setBusy(true)
        try {
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
          const fd = new FormData()
          fd.append('file', blob, 'voice.webm')
          const r = await post('/api/ingest/voice', fd)
          showToast(`✅ «${r.transcript?.slice(0, 40) ?? r.text}» — збережено`)
          onSaved?.(r)
        } catch (err) {
          showToast(`⚠️ ${err.message}`)
        } finally {
          setBusy(false)
        }
      }
      recRef.current = rec
      rec.start()
      setRecording(true)
      haptic('medium')
    } catch {
      showToast('Немає доступу до мікрофона')
    }
  }

  return (
    <>
      <div className="dictate">
        <input
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitText()}
          disabled={busy}
        />
        <button
          className={recording ? 'rec' : ''}
          style={{ background: color }}
          onClick={text.trim() ? submitText : toggleRecord}
          disabled={busy}
          aria-label={text.trim() ? 'Надіслати' : 'Диктувати'}
        >
          {text.trim() ? Icons.send(20) : Icons.mic(20)}
        </button>
      </div>
      {toast}
    </>
  )
}

/* ---------- проста шторка-форма ---------- */
export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}
