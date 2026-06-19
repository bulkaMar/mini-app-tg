import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { get, patch, post } from './api'
import { haptic } from './telegram'
import { onLiveChange } from './live'

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
  pencil: (s) => <I size={s}><path d="M4 20l1.2-4.2L16.5 4.5a2.12 2.12 0 013 3L8.2 18.8z" /><path d="M14.5 6.5l3 3" /></I>,
  close: (s) => <I size={s}><path d="M6 6l12 12M18 6L6 18" /></I>,
  trash: (s) => <I size={s}><path d="M4 7h16" /><path d="M9.5 7V5a1.5 1.5 0 011.5-1.5h2A1.5 1.5 0 0114.5 5v2" /><path d="M6.5 7l1 13h9l1-13" /><path d="M10 11v5M14 11v5" /></I>,
  undo: (s) => <I size={s}><path d="M4 10h10a5 5 0 110 10h-3" /><path d="M8 6l-4 4 4 4" /></I>,
  comment: (s) => <I size={s}><path d="M21 11.5A8.5 8.5 0 0112.5 20c-1.3 0-2.5-.25-3.6-.7L4 21l1.2-4A8.4 8.4 0 014 11.5a8.5 8.5 0 0117 0z" /></I>,
}

export const ROLE_COLOR = { owner: 'var(--ink)', manager: 'var(--blue)', assistant: 'var(--green)', driver: 'var(--gold)' }
export const ROLE_BADGE = { owner: 'ВЛАСНИК', manager: 'МЕНЕДЖЕР', assistant: 'АСИСТЕНТ', driver: 'ВОДІЙ' }
export const TYPE_LABEL = { task: 'ЗАДАЧА', risk: 'ТРИВОГА', money: 'ФІНАНСИ', status: 'СТАТУС' }
export const CAT_LABEL = { production: 'ПРОЄКТ', life: 'ПОБУТ', dog: 'ПЕС', finance: 'ФІНАНСИ', logistics: 'ПОДАЧА' }

/* напрямок запису «хто → кому»: себе показуємо особисто (власник — «Ти», решта — «Я») */
const ROLE_NAME = { owner: 'Власник', manager: 'Менеджер', assistant: 'Асистент', driver: 'Водій' }
function whoName(role, meRole) {
  if (!role) return ''
  if (role === meRole) return meRole === 'owner' ? 'Ти' : 'Я'
  return ROLE_NAME[role] || role
}
export function directionLabel(e, meRole) {
  const from = whoName(e.role, meRole)
  if (!e.target_role || e.target_role === e.role) return from.toUpperCase()
  return `${from} → ${whoName(e.target_role, meRole)}`.toUpperCase()
}

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

/* рядок зі свайпом уліво → відкриває кнопку «Видалити»; видалення лише по кліку
   (захист від випадкового). Pointer-події — працює і пальцем, і мишею. */
const SWIPE_REVEAL = 92 // ширина кнопки, на стільки відʼїжджає картка

export function SwipeRow({ onDelete, children }) {
  const [dx, setDx] = useState(0)
  const [openDel, setOpenDel] = useState(false)
  const [out, setOut] = useState(false)
  const s = useRef(null) // {x, y, dir: 'h'|'v'|null}
  const dragged = useRef(false)

  const onDown = (e) => { s.current = { x: e.clientX, y: e.clientY, dir: null }; dragged.current = false }
  const onMove = (e) => {
    const st = s.current
    if (!st) return
    const dX = e.clientX - st.x
    const dY = e.clientY - st.y
    if (st.dir === null) {
      if (Math.abs(dX) < 8 && Math.abs(dY) < 8) return
      st.dir = Math.abs(dX) > Math.abs(dY) ? 'h' : 'v' // визначаємо напрям один раз
      if (st.dir === 'h') { dragged.current = true; try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ok */ } }
    }
    if (st.dir === 'h') {
      const baseX = openDel ? -SWIPE_REVEAL : 0
      setDx(Math.max(-SWIPE_REVEAL - 16, Math.min(0, baseX + dX))) // тягнемо лише вліво
    }
  }
  const onUp = () => {
    const st = s.current
    s.current = null
    if (!st || st.dir !== 'h') return
    if (dx < -SWIPE_REVEAL / 2) { setOpenDel(true); setDx(-SWIPE_REVEAL); haptic() } // зафіксувати відкритим
    else { setOpenDel(false); setDx(0) }
  }

  const del = () => { setOut(true); haptic(); setTimeout(onDelete, 220) }
  const onRowClick = () => {
    if (dragged.current) { dragged.current = false; return } // це був свайп, не клік
    if (openDel) { setOpenDel(false); setDx(0) } // тап по картці закриває відкриту кнопку
  }

  return (
    <div className={`swipe-row ${out ? 'out' : ''}`}>
      <button className="swipe-del" onClick={del} tabIndex={openDel ? 0 : -1} aria-hidden={!openDel}>
        <span className="swipe-del-circle">{Icons.trash(20)}</span>
        <span className="swipe-del-label">Видалити</span>
      </button>
      <div
        className="swipe-fg"
        style={{ transform: `translateX(${out ? '-110%' : dx + 'px'})`, transition: s.current ? 'none' : 'transform .22s ease' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={onRowClick}
      >
        {children}
      </div>
    </div>
  )
}

/* свайп управо по екрану → назад (для дрілдаунів, як у iOS). Вертикальний скрол не чіпаємо:
   напрям фіксуємо один раз; спрацьовує лише на чіткому горизонтальному жесті управо. */
export function SwipeBack({ onBack, children }) {
  const s = useRef(null) // {x, y, dir: 'h'|'v'|null, fired}

  const onDown = (e) => { s.current = { x: e.clientX, y: e.clientY, dir: null, fired: false } }
  const onMove = (e) => {
    const st = s.current
    if (!st || st.fired) return
    const dx = e.clientX - st.x
    const dy = e.clientY - st.y
    if (st.dir === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      st.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v' // визначаємо напрям один раз
    }
    if (st.dir === 'h' && dx > 70 && Math.abs(dy) < 55) {
      st.fired = true
      haptic()
      onBack()
    }
  }
  const onEnd = () => { s.current = null }

  return (
    <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd}>
      {children}
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

export function Meter({ title, value, pct, level, onEdit }) {
  return (
    <div className="meter">
      <div className="row">
        <span className="title ico-text">
          {title}
          {onEdit && (
            <button className="btn-icon" aria-label="Редагувати" onClick={onEdit}>{Icons.pencil(15)}</button>
          )}
        </span>
        <span className={`val ${level || ''}`}>{value}</span>
      </div>
      <div className="bar"><i style={{ width: `${Math.min(pct, 100)}%` }} /></div>
    </div>
  )
}

let toastTimer, toastTimerOut
export function useToast() {
  const [t, setT] = useState(null) // { msg, kind: 'info'|'ok'|'warn', out }
  const show = (msg, kind = 'info') => {
    clearTimeout(toastTimer); clearTimeout(toastTimerOut)
    setT({ msg, kind, out: false })
    toastTimerOut = setTimeout(() => setT((p) => (p ? { ...p, out: true } : p)), 1700) // почати плавно ховати
    toastTimer = setTimeout(() => setT(null), 2000)
  }
  const node = t
    ? createPortal(
        <div className={`toast ${t.kind} ${t.out ? 'out' : ''}`}>
          {t.kind === 'ok' && Icons.check(16)}
          {t.kind === 'warn' && Icons.alert(16)}
          <span>{t.msg}</span>
        </div>,
        document.body,
      )
    : null
  return [node, show]
}

/* ---------- авто-оновлення екрана: одразу + кожні ms + при поверненні фокуса ----------
   щоб надходження від інших зʼявлялись самі, без перезавантаження сторінки (як дзвіночок) */
export function usePoll(fn, ms = 30000) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const run = () => ref.current()
    run() // первинне завантаження
    const off = onLiveChange(run) // миттєво при зміні на сервері (SSE)
    // оновлюємо й при поверненні в апку: focus не завжди стріляє у Telegram WebView
    const refresh = () => { if (document.visibilityState !== 'hidden') run() }
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = setInterval(run, ms) // запасний пінг, якщо SSE недоступний
    return () => {
      off()
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [ms])
}

/* ---------- блокування фону: поки відкрите центральне вікно, сторінка не гортається ---------- */
function useLockScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
}

/* варіанти виконавців для колонки «Кому» */
const ASSIGNEES = [
  { value: 'me', label: 'Я' },
  { value: 'manager', label: 'Менеджер' },
  { value: 'assistant', label: 'Асистент' },
  { value: 'driver', label: 'Водій' },
]

/* ---------- центральне вікно «Перевір і роздай»: список справ + кому ----------
   Одна диктовка ділиться на кілька задач; текст і виконавця можна змінити. */
export function TaskPlanModal({ plan, color = 'var(--orange)', onClose, onSaved }) {
  const [rows, setRows] = useState(() => {
    const src = plan?.tasks?.length ? plan.tasks : [{ text: plan?.transcript || '', assignee: 'me', category: null }]
    return src.map((t, i) => ({
      rid: i,
      text: t.text || '',
      assignee: ASSIGNEES.some((a) => a.value === t.assignee) ? t.assignee : 'me',
      category: t.category || null,
    }))
  })
  const [busy, setBusy] = useState(false)
  const [toast, showToast] = useToast()
  useLockScroll()

  const setText = (rid, v) => setRows((rs) => rs.map((r) => (r.rid === rid ? { ...r, text: v } : r)))
  const setWho = (rid, v) => { haptic(); setRows((rs) => rs.map((r) => (r.rid === rid ? { ...r, assignee: v } : r))) }
  const removeRow = (rid) => { haptic(); setRows((rs) => rs.filter((r) => r.rid !== rid)) }

  const valid = rows.filter((r) => r.text.trim())

  const save = async () => {
    if (!valid.length || busy) return
    setBusy(true)
    try {
      const r = await post('/api/ingest/tasks', {
        tasks: valid.map((r) => ({ text: r.text.trim(), assignee: r.assignee, category: r.category })),
      })
      haptic('medium')
      onSaved?.(r, valid.length)
    } catch (err) {
      showToast(err.message, 'warn')
      setBusy(false)
    }
  }

  return createPortal(
    <div className="overlay plan" onClick={onClose}>
      <div className="plan-modal" onClick={(e) => e.stopPropagation()}>
        <div className="plan-head">
          <h2>Перевір і роздай</h2>
          <button className="btn-icon" aria-label="Закрити" onClick={onClose}>{Icons.close(20)}</button>
        </div>
        <div className="plan-cols">
          <span className="c1">Справа</span>
          <span className="c2">Кому</span>
        </div>
        <div className="plan-list">
          {rows.map((r) => (
            <div className="plan-row" key={r.rid}>
              <input
                className="plan-text"
                value={r.text}
                placeholder="Текст справи"
                onChange={(e) => setText(r.rid, e.target.value)}
              />
              <select className="plan-who" value={r.assignee} onChange={(e) => setWho(r.rid, e.target.value)}>
                {ASSIGNEES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
              {rows.length > 1 && (
                <button className="plan-del" aria-label="Прибрати справу" onClick={() => removeRow(r.rid)}>
                  {Icons.close(16)}
                </button>
              )}
            </div>
          ))}
        </div>
        {plan?.transcript && (
          <div className="transcript-hint">Почув: «{plan.transcript}»</div>
        )}
        <button className="btn-primary" style={{ background: color }} onClick={save} disabled={busy || !valid.length}>
          {Icons.check(18)} {busy ? 'Зберігаю…' : `Роздати${valid.length > 1 ? ` (${valid.length})` : ''}`}
        </button>
        {toast}
      </div>
    </div>,
    document.body,
  )
}

/* ---------- диктування: текст + мікрофон → «Перевір і роздай» → /api/ingest/tasks ---------- */
export function Dictate({ placeholder = 'Продиктуй або напиши…', color = 'var(--orange)', onSaved }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState(null) // null | 'rec' (запис) | 'stt' (розшифровка)
  const [seconds, setSeconds] = useState(0)
  const [plan, setPlan] = useState(null) // {transcript, tasks} → центральне вікно
  const recRef = useRef(null)
  const timerRef = useRef(null)
  const [toast, showToast] = useToast()

  useEffect(() => () => clearInterval(timerRef.current), [])

  const planFromText = async (t) => {
    if (!t.trim() || busy) return
    setBusy(true)
    try {
      const r = await post('/api/ingest/plan', { text: t.trim() })
      setText('')
      setPlan(r)
    } catch (err) {
      showToast(err.message, 'warn')
    } finally {
      setBusy(false)
    }
  }

  const onSavedTasks = (r, n) => {
    setPlan(null)
    showToast(`Роздано задач: ${r?.count ?? n}`, 'ok')
    onSaved?.(r)
  }

  const startRecord = async () => {
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
        clearInterval(timerRef.current)
        setPhase('stt')
        try {
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
          const fd = new FormData()
          fd.append('file', blob, 'voice.webm')
          const r = await post('/api/ingest/voice/plan', fd)
          setPlan(r)
        } catch (err) {
          showToast(err.message, 'warn')
        } finally {
          setPhase(null)
        }
      }
      recRef.current = rec
      rec.start()
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
      setPhase('rec')
      haptic('medium')
    } catch {
      showToast('Немає доступу до мікрофона')
    }
  }

  const stopRecord = () => {
    haptic('medium')
    recRef.current?.stop()
  }

  const fmtSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <>
      <div className="dictate">
        <input
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && planFromText(text)}
          disabled={busy || phase !== null}
        />
        <button
          style={{ background: color }}
          onClick={text.trim() ? () => planFromText(text) : startRecord}
          disabled={busy || phase !== null}
          aria-label={text.trim() ? 'Розкласти' : 'Диктувати'}
        >
          {text.trim() ? Icons.send(20) : Icons.mic(20)}
        </button>
      </div>

      {/* повноекранний оверлей: блокує все, поки йде запис / розшифровка.
          Портал у body — щоб оверлей не застрягав у stacking-context доку
          (інакше таб-бар і поле вводу просвічували поверх нього). */}
      {phase && createPortal(
        <div className="record-overlay">
          {phase === 'rec' ? (
            <>
              <div className="mic-circle">{Icons.mic(40)}</div>
              <div className="rec-time">{fmtSec(seconds)}</div>
              <div className="rec-hint">Йде запис — говори, я слухаю</div>
              <button className="btn-stop" onClick={stopRecord}>
                <span className="stop-square" /> Зупинити
              </button>
            </>
          ) : (
            <>
              <div className="mic-circle stt">{Icons.clock(40)}</div>
              <div className="rec-hint">Розшифровую та прибираю воду…</div>
            </>
          )}
        </div>,
        document.body,
      )}

      {/* центральне вікно «Перевір і роздай» */}
      {plan && (
        <TaskPlanModal plan={plan} color={color} onClose={() => setPlan(null)} onSaved={onSavedTasks} />
      )}
      {toast}
    </>
  )
}

/* ---------- грошове поле: «12 000 ₴» прямо під час вводу, курсор перед ₴ ---------- */
const HRV_SUFFIX = ' ₴'

export function MoneyInput({ value, onChange, placeholder = 'Сума, ₴', invalid }) {
  // value — рядок із цифр ('12000'); у полі показуємо '12 000 ₴', назад віддаємо чисті цифри
  const ref = useRef(null)
  const display = value
    ? Number(String(value).replace(/\D/g, '') || 0).toLocaleString('uk-UA') + HRV_SUFFIX
    : ''

  const handle = (e) => {
    const v = e.target.value
    let digits = v.replace(/\D/g, '')
    // backspace зʼїв лише суфікс « ₴» — користувач хотів стерти останню цифру
    if (display && (v === display.slice(0, -1) || v === display.slice(0, -2))) digits = digits.slice(0, -1)
    onChange(digits.slice(0, 12))
  }

  // після кожного вводу тримаємо курсор перед « ₴»
  const placeCursor = () => {
    const el = ref.current
    if (!el || !el.value) return
    const pos = el.value.length - HRV_SUFFIX.length
    if (el.selectionStart > pos) el.setSelectionRange(pos, pos)
  }
  useEffect(placeCursor)

  return (
    <div className={`money-input ${invalid ? 'invalid' : ''}`}>
      <input ref={ref} type="text" inputMode="numeric" placeholder={placeholder}
        value={display} onChange={handle} onFocus={() => setTimeout(placeCursor, 0)}
        onClick={placeCursor} />
    </div>
  )
}

/* ---------- шторка витрати: коментар + підтвердження ---------- */
export function ExpenseSheet({ e, canApprove, color = 'var(--orange)', onClose, onChanged }) {
  const [comment, setComment] = useState(e.comment || '')
  const [amount, setAmount] = useState(e.amount ? String(Math.round(e.amount)) : '')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [toast, showToast] = useToast()
  const amountValid = Number(amount) > 0
  const changed = comment.trim() !== (e.comment || '') || (amountValid && Number(amount) !== e.amount)

  const save = async (extra = {}) => {
    if (busy) return
    setBusy(true)
    try {
      const body = { comment: comment.trim(), ...extra }
      if (amountValid) body.amount = Number(amount)
      await patch(`/api/money/${e.id}`, body)
      onChanged()
    } catch (err) { showToast(err.message, 'warn') } finally { setBusy(false) }
  }

  const remove = () => setConfirmDel(true)

  return (
    <Sheet title={e.text || 'Витрата'} onClose={onClose}>
      <div className="preview-meta ico-text">
        {e.approved ? Icons.check(13) : Icons.clock(13)}
        {e.approved ? 'підтверджено' : 'чекає підтвердження'} · {fmtTime(e.time)}
      </div>
      <MoneyInput value={amount} onChange={setAmount} placeholder="Сума" invalid={!amountValid} />
      <textarea rows={3} value={comment} onChange={(ev) => setComment(ev.target.value)}
        placeholder="Коментар (напр.: наступного разу купи дешевше)" />
      <button className="btn-primary" style={{ background: color, opacity: changed && amountValid ? 1 : 0.45 }}
        onClick={() => save()} disabled={busy || !changed || !amountValid}>
        {busy ? 'Зберігаю…' : 'Зберегти зміни'}
      </button>
      {canApprove && (e.approved ? (
        <button className="btn-small ghost" onClick={() => save({ approved: false })} disabled={busy}>
          {Icons.undo(15)} Зняти підтвердження
        </button>
      ) : (
        <button className="btn-confirm wide" onClick={() => save({ approved: true })} disabled={busy}>
          {Icons.check(18)} Підтвердити
        </button>
      ))}
      <button className="btn-small ghost danger" onClick={remove} disabled={busy}>
        {Icons.trash(15)} Видалити витрату
      </button>
      {confirmDel && (
        <ConfirmDialog text="Впевнені, що видалити?"
          onYes={() => { setConfirmDel(false); save({ deleted: true }) }}
          onNo={() => setConfirmDel(false)} />
      )}
      {toast}
    </Sheet>
  )
}

/* ---------- шторка задачі: редагування, виконано, видалення ---------- */
export function TaskSheet({ t, color = 'var(--orange)', onClose, onChanged }) {
  const [text, setText] = useState(t.text)
  const [due, setDue] = useState(t.due || '')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [toast, showToast] = useToast()
  const changed = text.trim() !== t.text || (due || '') !== (t.due || '')

  const save = async (extra = {}) => {
    if (busy) return
    setBusy(true)
    try {
      await patch(`/api/tasks/${t.id}`, { text: text.trim(), due: due || null, ...extra })
      onChanged()
    } catch (err) { showToast(err.message, 'warn') } finally { setBusy(false) }
  }

  return (
    <Sheet title="Задача" onClose={onClose}>
      <div className="preview-meta ico-text">
        {t.status === 'done' ? Icons.check(13) : Icons.clock(13)}
        {t.status === 'done' ? 'виконано' : 'в роботі'} · {CAT_LABEL[t.category] || ''}
      </div>
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Текст задачі" />
      <label className="transcript-hint">Дедлайн (необов'язково)</label>
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      <button className="btn-primary" style={{ background: color, opacity: changed && text.trim() ? 1 : 0.45 }}
        disabled={busy || !changed || !text.trim()} onClick={() => save()}>
        {busy ? 'Зберігаю…' : 'Зберегти зміни'}
      </button>
      {t.status === 'open' ? (
        <button className="btn-confirm wide" onClick={() => save({ status: 'done' })} disabled={busy}>
          {Icons.check(18)} Виконано
        </button>
      ) : (
        <button className="btn-small ghost" onClick={() => save({ status: 'open' })} disabled={busy}>
          {Icons.undo(15)} Повернути в роботу
        </button>
      )}
      <button className="btn-small ghost danger" onClick={() => setConfirmDel(true)} disabled={busy}>
        {Icons.trash(15)} Видалити задачу
      </button>
      {confirmDel && (
        <ConfirmDialog text="Впевнені, що видалити?"
          onYes={() => { setConfirmDel(false); save({ deleted: true }) }}
          onNo={() => setConfirmDel(false)} />
      )}
      {toast}
    </Sheet>
  )
}

/* ---------- підтвердження посередині екрана: Так / Ні ---------- */
export function ConfirmDialog({ text, onYes, onNo }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onNo()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onNo])
  return (
    <div className="overlay center" onClick={onNo}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-text">{text}</div>
        <div className="confirm-actions">
          <button className="btn-yes" onClick={() => { haptic('medium'); onYes() }}>Так</button>
          <button className="btn-no" onClick={onNo}>Ні</button>
        </div>
      </div>
    </div>
  )
}

/* ---------- проста шторка-форма ---------- */
export function Sheet({ title, onClose, children, action }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <div className="sheet-head-right">
            {action}
            <button className="btn-icon" aria-label="Закрити" onClick={onClose}>{Icons.close(20)}</button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

/* ---------- віконце по центру екрана (не знизу): підпис-роль у шапці ---------- */
export function CenterModal({ title, sub, onClose, children }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  useLockScroll()
  return createPortal(
    <div className="overlay center-modal-wrap" onClick={onClose}>
      <div className="center-modal" onClick={(e) => e.stopPropagation()}>
        <div className="center-modal-head">
          <div className="center-modal-titles">
            <h2>{title}</h2>
            {sub && <div className="center-modal-sub">{sub}</div>}
          </div>
          <button className="btn-icon" aria-label="Закрити" onClick={onClose}>{Icons.close(20)}</button>
        </div>
        <div className="center-modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/* ---------- дзвіночок: лічильник нових надходжень у стрічці ---------- */
// Єдине джерело — /api/feed (бек уже фільтрує за роллю). Рахуємо записи, що
// зʼявились після «востаннє бачених» і не від самого користувача; позначку
// тримаємо в localStorage, опитуємо стрічку раз на 15 с і при поверненні фокуса.
const FEED_POLL_MS = 15000

export function NotificationBell({ me }) {
  const storeKey = `pult:feedSeen:${me?.telegram_id ?? 'x'}`
  const dismissKey = `pult:feedDismissed:${me?.telegram_id ?? 'x'}`
  const [feed, setFeed] = useState([])
  const [seen, setSeen] = useState(() => {
    const v = Number(localStorage.getItem(storeKey))
    return localStorage.getItem(storeKey) !== null && Number.isFinite(v) ? v : null // null = ще не ініціалізовано
  })
  // локально прибрані сповіщення (по користувачу) — стрічку команди не чіпаємо
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(dismissKey) || '[]')) } catch { return new Set() }
  })
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState([]) // знімок «нових» на момент відкриття шторки
  const seenRef = useRef(seen)
  seenRef.current = seen

  const persistDismissed = (set) => localStorage.setItem(dismissKey, JSON.stringify([...set].slice(-300)))
  const dismiss = (id) => setDismissed((prev) => { const n = new Set(prev); n.add(id); persistDismissed(n); return n })
  const clearAll = (ids) => setDismissed((prev) => {
    const n = new Set(prev); ids.forEach((id) => n.add(id)); persistDismissed(n); return n
  })

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const f = await get('/api/feed')
        if (!alive || !Array.isArray(f)) return
        setFeed(f)
        // перший запуск: усе наявне вважаємо переглянутим — горить лише те, що прийде далі
        if (seenRef.current === null) {
          const maxId = f.reduce((m, e) => Math.max(m, e.id), 0)
          localStorage.setItem(storeKey, String(maxId))
          setSeen(maxId)
        }
      } catch { /* бек недоступний — мовчки, дзвіночок просто не горить */ }
    }
    load()
    const off = onLiveChange(load) // миттєво при зміні на сервері (SSE)
    const timer = setInterval(load, FEED_POLL_MS) // запасний пінг
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { alive = false; off(); clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [storeKey])

  const base = seen === null ? Infinity : seen // поки позначку не зчитано — нічого не «нове»
  const fresh = feed.filter((e) => e.id > base && e.role !== me?.role && !dismissed.has(e.id))
  const count = fresh.length
  const shownList = shown.filter((e) => !dismissed.has(e.id))
  const earlierList = feed.filter((e) => !shown.some((s) => s.id === e.id) && !dismissed.has(e.id)).slice(0, 12)
  const total = shownList.length + earlierList.length

  const openSheet = () => {
    haptic()
    setShown(fresh)
    const maxId = feed.reduce((m, e) => Math.max(m, e.id), seen ?? 0)
    localStorage.setItem(storeKey, String(maxId))
    setSeen(maxId)
    setOpen(true)
  }

  return (
    <>
      {/* дзвіночок усередині .app (як таб-бар) — фіксований до екрана.
          НЕ портал у body: на iOS прямий нащадок body «їде» зі скролом. */}
      <div className="notif-wrap">
        <button className={`notif-bell ${count ? 'has-new' : ''}`} onClick={openSheet}
          aria-label={count ? `Сповіщення: ${count} нових` : 'Сповіщення'}>
          {Icons.bell(22)}
          {count > 0 && <span className="notif-badge">{count > 9 ? '9+' : count}</span>}
        </button>
      </div>
      {open && (
        <Sheet
          title="Сповіщення"
          onClose={() => setOpen(false)}
          action={total > 0 && (
            <button className="btn-clear-all" onClick={() => clearAll([...shownList, ...earlierList].map((e) => e.id))}>
              Очистити все
            </button>
          )}
        >
          {shownList.length > 0 && <div className="section-label">Нове</div>}
          {shownList.map((e) => (
            <SwipeRow key={e.id} onDelete={() => dismiss(e.id)}><Entry e={e} label={directionLabel(e, me?.role)} /></SwipeRow>
          ))}
          {earlierList.length > 0 && <div className="section-label">{shownList.length > 0 ? 'Раніше' : 'Стрічка'}</div>}
          {earlierList.map((e) => (
            <SwipeRow key={e.id} onDelete={() => dismiss(e.id)}><Entry e={e} label={directionLabel(e, me?.role)} /></SwipeRow>
          ))}
          {total === 0 && <div className="empty">Поки тихо</div>}
        </Sheet>
      )}
    </>
  )
}
