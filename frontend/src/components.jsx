import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { del, get, patch, post } from './api'
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
  // важливість: полум'я — супер термінова, подвійна стрілка вгору — важлива
  flame: (s) => <I size={s}><path d="M12 21a6 6 0 006-6c0-4-3.5-6.5-6-9.5-2.5 3-6 5.5-6 9.5a6 6 0 006 6z" /><path d="M12 21a2.6 2.6 0 002.6-2.6c0-1.7-1.6-2.7-2.6-4.1-1 1.4-2.6 2.4-2.6 4.1A2.6 2.6 0 0012 21z" /></I>,
  up: (s) => <I size={s}><path d="M6 13l6-6 6 6" /><path d="M6 18l6-6 6 6" /></I>,
  gear: (s) => <I size={s}><circle cx="12" cy="12" r="3.2" /><path d="M19.4 14.5a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5v.2a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H2a2 2 0 010-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H10a1.6 1.6 0 001-1.5V2a2 2 0 014 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V10a1.6 1.6 0 001.5 1h.2a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z" /></I>,
  chevUp: (s) => <I size={s}><path d="M6 15l6-6 6 6" /></I>,
  chevDown: (s) => <I size={s}><path d="M6 9l6 6 6-6" /></I>,
}

/* ---------- розділи задач і рівні важливості ----------
   Живуть у БД: власниця додає/перейменовує/видаляє свої (екран «Розділи та важливість»).
   Тут — спільний кеш на весь застосунок: одне завантаження, усі підписники оновлюються
   разом, у т.ч. миттєво при зміні на сервері (SSE). */

const COLOR_VAR = {
  blue: 'var(--blue)', green: 'var(--green)', gold: 'var(--gold)', orange: 'var(--orange)',
  red: 'var(--red)', ink: 'var(--ink)', warn: 'var(--warn)', muted: 'var(--muted)',
}
export const COLOR_KEYS = Object.keys(COLOR_VAR)
export const colorVar = (c) => COLOR_VAR[c] || 'var(--orange)'

// іконки, які можна поставити своєму розділу чи рівню важливості
export const PICKABLE_ICONS = [
  'task', 'film', 'home', 'dog', 'pin', 'truck', 'fuel', 'cart',
  'wallet', 'alert', 'flame', 'up', 'clock', 'bell', 'shield', 'pulse',
]

let _dict = { categories: [], priorities: [] }
let _dictLoaded = false
const _dictSubs = new Set()

async function loadDictionaries() {
  try {
    const d = await get('/api/dictionaries')
    if (!d || !Array.isArray(d.categories) || !Array.isArray(d.priorities)) return
    _dict = d
    _dictLoaded = true
    _dictSubs.forEach((fn) => { try { fn(d) } catch { /* ok */ } })
  } catch { /* бек недоступний — списки лишаться порожніми, екрани не падають */ }
}

export function useDictionaries() {
  const [d, setD] = useState(_dict)
  useEffect(() => {
    _dictSubs.add(setD)
    if (!_dictLoaded) loadDictionaries()
    const off = onLiveChange(loadDictionaries) // хтось змінив довідник → оновлюємось
    return () => { _dictSubs.delete(setD); off() }
  }, [])
  return d
}
export const refreshDictionaries = loadDictionaries

/* ---------- листи витрат: той самий спільний кеш, що й для довідників ---------- */
let _sheets = { sheets: [], can_manage: false }
let _sheetsLoaded = false
const _sheetSubs = new Set()

async function loadSheets() {
  try {
    const d = await get('/api/finance/sheets')
    if (!d || !Array.isArray(d.sheets)) return
    _sheets = d
    _sheetsLoaded = true
    _sheetSubs.forEach((fn) => { try { fn(d) } catch { /* ok */ } })
  } catch { /* бек недоступний — лишається порожній список */ }
}

export function useSheets() {
  const [d, setD] = useState(_sheets)
  useEffect(() => {
    _sheetSubs.add(setD)
    if (!_sheetsLoaded) loadSheets()
    const off = onLiveChange(loadSheets)
    return () => { _sheetSubs.delete(setD); off() }
  }, [])
  return d
}
export const refreshSheets = loadSheets

export const findCat = (dict, key) => dict?.categories?.find((c) => c.key === key)
export const findPrio = (dict, key) => dict?.priorities?.find((p) => p.key === key)
// варіанти для Segmented: тільки ті розділи, куди цій людині можна класти задачі
export const catOptions = (dict) => (dict?.categories || [])
  .filter((c) => c.can_use)
  .map((c) => ({ value: c.key, label: c.label, icon: c.icon, color: colorVar(c.color) }))
export const prioOptions = (dict) => (dict?.priorities || [])
  .map((p) => ({ value: p.key, label: p.label, icon: p.icon, color: colorVar(p.color) }))

/* позначка важливості в рядку списку (рівень за замовчуванням не позначаємо) */
export function PriorityMark({ p }) {
  const dict = useDictionaries()
  const prio = findPrio(dict, p)
  if (!prio || prio.is_default) return null
  const color = colorVar(prio.color)
  return (
    <span className="prio" style={{ color }} title={prio.label}>
      {prio.icon && Icons[prio.icon]
        ? Icons[prio.icon](15)
        : <span className="prio-dot" style={{ background: color }} />}
    </span>
  )
}

/* найважливіші — вгору (для списків, зібраних із кількох розділів) */
export const byPriority = (dict) => (a, b) =>
  (findPrio(dict, a.priority)?.rank ?? 1000) - (findPrio(dict, b.priority)?.rank ?? 1000)

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
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  const now = new Date()
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const diff = Math.round((day(now) - day(d)) / 86400000) // різниця в днях
  if (diff <= 0) return time // сьогодні
  if (diff === 1) return `Вчора ${time}`
  if (diff < 7) {
    const wd = d.toLocaleDateString('uk-UA', { weekday: 'long' })
    return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${time}`
  }
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  if (d.getFullYear() === now.getFullYear()) return `${dd}.${mm} ${time}`
  return `${dd}.${mm}.${d.getFullYear()} ${time}`
}

/* ---------- дедлайн: дата + необовʼязковий час ----------
   З сервера приходить рядком: «2026-08-10» (на весь день) або «2026-08-10T14:30».
   Розбираємо вручну, бо new Date('2026-08-10') у JS — це опівніч за Гринвічем,
   а не за нашим часом: без цього дедлайн «протухав» на кілька годин раніше. */
const p2 = (n) => String(n).padStart(2, '0')

export function parseDue(due) {
  if (!due) return null
  const [d, t = ''] = String(due).split('T')
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return null
  const [hh, mm] = t.split(':').map(Number)
  const hasTime = Number.isFinite(hh) && Number.isFinite(mm)
  return { y, m, day, hh: hasTime ? hh : null, mm: hasTime ? mm : null }
}

/* момент, після якого дедлайн вважається пропущеним:
   заданий час — саме він; без часу — кінець того дня */
export function dueMoment(due) {
  const p = parseDue(due)
  if (!p) return null
  return p.hh === null
    ? new Date(p.y, p.m - 1, p.day, 23, 59, 59)
    : new Date(p.y, p.m - 1, p.day, p.hh, p.mm)
}
export const isOverdue = (due) => { const m = dueMoment(due); return !!m && m <= new Date() }

export function fmtDue(due) {          // коротко для плашки: «10.08» / «10.08 14:30»
  const p = parseDue(due)
  if (!p) return ''
  const d = `${p2(p.day)}.${p2(p.m)}`
  return p.hh === null ? d : `${d} ${p2(p.hh)}:${p2(p.mm)}`
}
export function fmtDueLong(due) {      // повністю: «10.08.2026» / «10.08.2026, 14:30»
  const p = parseDue(due)
  if (!p) return ''
  const d = `${p2(p.day)}.${p2(p.m)}.${p.y}`
  return p.hh === null ? d : `${d}, ${p2(p.hh)}:${p2(p.mm)}`
}

// розкладання/збирання для полів вводу
export const dueDatePart = (due) => (due ? String(due).split('T')[0] : '')
export const dueTimePart = (due) => (String(due || '').split('T')[1] || '').slice(0, 5)
export const joinDue = (date, timeStr) => (date ? (timeStr ? `${date}T${timeStr}` : date) : null)

/* поле дедлайну: дата + час. Порожній час = «на весь день». */
export function DueField({ date, time, onChange, label = "Дедлайн (необов'язково)" }) {
  const setDate = (v) => onChange(v, v ? time : '') // прибрали дату — час теж зайвий
  return (
    <Field label={label}>
      <div className="due-row">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" value={time} disabled={!date} step="300"
          onChange={(e) => onChange(date, e.target.value)} />
        {time && (
          <button type="button" className="btn-icon" aria-label="Прибрати час"
            onClick={() => onChange(date, '')}>{Icons.close(16)}</button>
        )}
      </div>
      {date && !time && <div className="due-hint">Без часу — на весь день</div>}
    </Field>
  )
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
    <div className="swipe-back" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd}>
      {children}
    </div>
  )
}

export function TabBar({ tabs, active, onChange }) {
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <button key={t.key} className={`${active === t.key ? 'active' : ''}${t.badge ? ' has-badge' : ''}`}
          onClick={() => { haptic(); onChange(t.key) }}>
          <span className="tab-ico">
            {Icons[t.icon]?.(22)}
            {t.badge > 0 && <span className="tab-badge">{t.badge > 9 ? '9+' : t.badge}</span>}
          </span>
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

/* ---------- кругова діаграма витрат (donut) з анімацією появи ---------- */
export function DonutChart({ data, centerValue, centerCap }) {
  const [grow, setGrow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setGrow(true), 60); return () => clearTimeout(t) }, [])
  const sum = data.reduce((s, d) => s + d.value, 0) || 1
  let start = 0
  const slices = data.map((d) => {
    const pct = (d.value / sum) * 100
    const s = { color: d.color, label: d.label, value: d.value, start, pctRound: Math.round(pct), len: Math.max(pct - 1.2, 0.6) }
    start += pct
    return s
  })
  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg viewBox="0 0 100 100" className="donut-svg">
          <circle className="donut-track" cx="50" cy="50" r="42" pathLength="100" />
          {slices.map((s, i) => (
            <circle key={i} cx="50" cy="50" r="42" className="donut-slice" stroke={s.color} pathLength="100"
              strokeDasharray={grow ? `${s.len} ${100 - s.len}` : '0 100'}
              strokeDashoffset={-s.start} style={{ transitionDelay: `${i * 0.1}s` }} />
          ))}
        </svg>
        <div className="donut-center">
          <div className="donut-total">{centerValue}</div>
          {centerCap && <div className="donut-cap">{centerCap}</div>}
        </div>
      </div>
      <div className="donut-legend">
        {slices.map((s, i) => (
          <div className="donut-leg" key={i}>
            <span className="donut-leg-dot" style={{ background: s.color }} />
            <span className="donut-leg-label">{s.label}</span>
            <span className="donut-leg-val">{s.value.toLocaleString('uk-UA')} ₴ · {s.pctRound}%</span>
          </div>
        ))}
      </div>
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

/* ---------- тримає відкрите вікно в актуальному стані ----------
   коли список перезавантажився (хтось інший відредагував запис), підставляємо свіжий
   запис із тим самим id — зміни видно одразу, без перевідкриття. Зник запис → вікно закриється. */
export function useLiveSel(list, sel, setSel) {
  useEffect(() => {
    if (!sel) return
    const fresh = (list || []).find((x) => x.id === sel.id) || null
    if (fresh !== sel) setSel(fresh)
  }, [list, sel, setSel])
}

/* ---------- блокування фону: поки відкрите центральне вікно, сторінка не гортається ---------- */
function useLockScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
}

/* ---------- поле з підписом і вибір «одне з кількох» ---------- */

export function Field({ label, children }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
    </div>
  )
}

export function Segmented({ options, value, onChange, color = 'var(--orange)' }) {
  return (
    <div className="seg">
      {options.map((o) => {
        const on = value === o.value
        const c = o.color || color
        return (
          <button
            key={o.value}
            type="button"
            className={`seg-btn ${on ? 'on' : ''}`}
            style={on ? { background: c, borderColor: c } : undefined}
            onClick={() => { haptic(); onChange(o.value) }}
          >
            {o.icon && Icons[o.icon]?.(15)}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- вибір листа витрат ----------
   «Усі листи» зʼявляється лише коли листів більше одного. */
export const ALL_SHEETS = 'all'

export function SheetPicker({ value, onChange, onManage }) {
  const { sheets, can_manage } = useSheets()
  if (!sheets.length) return null
  return (
    <div className="sheet-picker">
      <span className="ico">{Icons.wallet(18)}</span>
      <select value={value || ''} onChange={(e) => { haptic(); onChange(e.target.value) }}>
        {sheets.length > 1 && <option value={ALL_SHEETS}>Усі листи разом</option>}
        {sheets.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
      </select>
      {can_manage && onManage && (
        <button className="btn-icon" aria-label="Керувати листами" onClick={onManage}>
          {Icons.pencil(16)}
        </button>
      )}
    </div>
  )
}

/* обирає лист за замовчуванням («Загальний бюджет»), коли список приїхав */
export function useSheetSelection() {
  const { sheets } = useSheets()
  const [sheet, setSheet] = useState('')
  useEffect(() => {
    if (!sheets.length) return
    if (sheet === ALL_SHEETS || sheets.some((s) => String(s.id) === sheet)) return
    const general = sheets.find((s) => s.is_general) || sheets[0]
    setSheet(String(general.id))
  }, [sheets]) // eslint-disable-line react-hooks/exhaustive-deps
  return [sheet, setSheet, sheets]
}

/* ---------- керування листами: додати / перейменувати / видалити ---------- */
function SheetEditModal({ sheet, sheets, color, onClose, onSaved }) {
  const isNew = !sheet
  const [name, setName] = useState(sheet?.name || '')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [moveTo, setMoveTo] = useState('')
  const [count, setCount] = useState(0)
  const [toast, showToast] = useToast()
  const others = sheets.filter((s) => s.id !== sheet?.id)

  const save = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      if (isNew) await post('/api/finance/sheets', { name: name.trim() })
      else await patch(`/api/finance/sheets/${sheet.id}`, { name: name.trim() })
      await refreshSheets()
      onSaved()
    } catch (e) { showToast(e.message, 'warn'); setBusy(false) }
  }

  const remove = async (target) => {
    setBusy(true)
    try {
      await del(`/api/finance/sheets/${sheet.id}${target ? `?move_to=${target}` : ''}`)
      await refreshSheets()
      onSaved()
    } catch (e) {
      const m = /^expenses_present:(\d+)$/.exec(e.message)
      if (m) { setCount(Number(m[1])); setMoveTo(String(others[0]?.id || '')) }
      else showToast(e.message, 'warn')
      setBusy(false)
    }
  }

  return (
    <CenterModal
      title={isNew ? 'Новий лист витрат' : 'Лист витрат'}
      sub={sheet?.is_general ? 'загальний' : undefined}
      onClose={onClose}
      footer={(
        <>
          <button className="btn-primary" style={{ background: color, opacity: name.trim() ? 1 : 0.45 }}
            disabled={busy || !name.trim()} onClick={save}>
            {busy ? 'Зберігаю…' : isNew ? 'Створити лист' : 'Зберегти зміни'}
          </button>
          {!isNew && !sheet.is_general && (
            <button className="btn-small ghost danger" disabled={busy} onClick={() => setConfirmDel(true)}>
              {Icons.trash(15)} Видалити лист
            </button>
          )}
        </>
      )}
    >
      <input placeholder="Назва (напр. Зйомка Nike)" value={name} autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()} />
      {isNew && <div className="preview-meta">У листа буде свій бюджет і свої витрати</div>}
      {sheet?.is_general && (
        <div className="preview-meta">
          Загальний лист прибрати не можна — саме туди йдуть витрати, для яких лист не вказано.
        </div>
      )}
      {confirmDel && (
        <ConfirmDialog text="Впевнені, що видалити лист?"
          onYes={() => { setConfirmDel(false); remove(null) }}
          onNo={() => setConfirmDel(false)} />
      )}
      {count > 0 && (
        <CenterModal title="Куди перенести витрати?" sub={`у листі ${count}`} onClose={() => setCount(0)}>
          <div className="preview-meta">Лист не порожній. Оберіть, куди перекласти — нічого не загубиться.</div>
          <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            {others.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </select>
          <button className="btn-primary" style={{ background: 'var(--red)' }}
            disabled={busy || !moveTo} onClick={() => { setCount(0); remove(moveTo) }}>
            Перенести й видалити лист
          </button>
        </CenterModal>
      )}
      {toast}
    </CenterModal>
  )
}

export function SheetsModal({ color = 'var(--orange)', onClose }) {
  const { sheets } = useSheets()
  const [edit, setEdit] = useState(null) // обʼєкт листа або 'new'
  return (
    <CenterModal title="Листи витрат" sub={`${sheets.length}`} onClose={onClose}>
      <div className="card" style={{ padding: '2px 14px' }}>
        {sheets.map((s) => (
          <div key={s.id} className="dict-row" role="button" tabIndex={0} onClick={() => setEdit(s)}>
            <span className="dict-ico" style={{ background: s.is_general ? 'var(--ink)' : color }}>
              {Icons.wallet(18)}
            </span>
            <span className="dict-info">
              <span className="dict-name">{s.name}</span>
              <span className="dict-sub">{s.is_general ? 'загальний' : 'свій лист'}</span>
            </span>
            <span className="ico" style={{ color: 'var(--muted)', display: 'flex' }}>{Icons.pencil(15)}</span>
          </div>
        ))}
      </div>
      <button className="btn-dashed" style={{ color }} onClick={() => setEdit('new')}>
        {Icons.plus(18)} Додати лист
      </button>
      {edit && (
        <SheetEditModal sheet={edit === 'new' ? null : edit} sheets={sheets} color={color}
          onClose={() => setEdit(null)} onSaved={() => setEdit(null)} />
      )}
    </CenterModal>
  )
}

/* ---------- підзадачі та чекліст усередині задачі ----------
   Підзадачі — нумерований список, чекліст — галочки. Пункт додається/редагується
   в окремому віконці поверх, після чого воно закривається й пункт видно у списку. */

const ITEM_KINDS = {
  subtask: { title: 'Підзадачі', one: 'підзадачу', add: 'Додати підзадачу', modal: 'Підзадача' },
  check: { title: 'Чекліст', one: 'пункт', add: 'Додати пункт', modal: 'Пункт чеклісту' },
}

function ItemModal({ kind, item, color, onClose, onSave, onDelete }) {
  const [text, setText] = useState(item?.text || '')
  const cfg = ITEM_KINDS[kind]
  const valid = text.trim()
  const submit = () => { if (valid) { onSave(text.trim()); onClose() } }

  return (
    <CenterModal
      title={item ? cfg.modal : `Нова ${cfg.one}`}
      onClose={onClose}
      footer={(
        <>
          <button className="btn-primary" style={{ background: color, opacity: valid ? 1 : 0.45 }}
            disabled={!valid} onClick={submit}>
            {item ? 'Зберегти' : 'Додати'}
          </button>
          {item && (
            <button className="btn-small ghost danger" onClick={() => { onDelete(); onClose() }}>
              {Icons.trash(15)} Прибрати
            </button>
          )}
        </>
      )}
    >
      <textarea rows={2} value={text} autoFocus placeholder="Що саме треба зробити"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }} />
    </CenterModal>
  )
}

export function TaskItemsEditor({ items, onChange, color = 'var(--orange)' }) {
  const [editing, setEditing] = useState(null) // { kind, index|null }

  const list = (kind) => items.map((it, i) => ({ it, i })).filter(({ it }) => it.kind === kind)
  const toggle = (i) => {
    haptic()
    onChange(items.map((it, idx) => (idx === i ? { ...it, done: !it.done } : it)))
  }
  const saveText = (kind, index, text) => {
    haptic()
    if (index === null) onChange([...items, { kind, text, done: false }])
    else onChange(items.map((it, idx) => (idx === index ? { ...it, text } : it)))
  }
  const removeAt = (index) => { haptic(); onChange(items.filter((_, idx) => idx !== index)) }

  const section = (kind) => {
    const rows = list(kind)
    const cfg = ITEM_KINDS[kind]
    return (
      <Field label={rows.length ? `${cfg.title} · ${rows.filter(({ it }) => it.done).length}/${rows.length}` : cfg.title}>
        {rows.map(({ it, i }, n) => (
          <div key={i} className={`ti-row ${it.done ? 'done' : ''}`}>
            <button type="button" className="ti-tick" aria-label={it.done ? 'Зняти' : 'Виконано'}
              style={it.done ? { background: color, borderColor: color } : undefined}
              onClick={() => toggle(i)}>
              {kind === 'subtask'
                ? (it.done ? Icons.check(13) : <span className="ti-num">{n + 1}</span>)
                : (it.done ? Icons.check(13) : null)}
            </button>
            <span className="ti-text" role="button" tabIndex={0} onClick={() => toggle(i)}>{it.text}</span>
            <button type="button" className="btn-icon" aria-label="Змінити"
              onClick={() => setEditing({ kind, index: i })}>{Icons.pencil(14)}</button>
          </div>
        ))}
        <button type="button" className="btn-dashed slim" style={{ color }}
          onClick={() => setEditing({ kind, index: null })}>
          {Icons.plus(16)} {cfg.add}
        </button>
      </Field>
    )
  }

  return (
    <>
      {section('subtask')}
      {section('check')}
      {editing && (
        <ItemModal
          kind={editing.kind}
          item={editing.index === null ? null : items[editing.index]}
          color={color}
          onClose={() => setEditing(null)}
          onSave={(text) => saveText(editing.kind, editing.index, text)}
          onDelete={() => removeAt(editing.index)}
        />
      )}
    </>
  )
}

/* лічильник виконаних пунктів у рядку списку задач */
export function ItemsBadge({ t }) {
  if (!t.items_total) return null
  const all = t.items_done === t.items_total
  return (
    <span className={`tag ${all ? 'ok' : 'muted'}`} title="Підзадачі та чекліст">
      {t.items_done}/{t.items_total}
    </span>
  )
}

/* ---------- нова задача: текст + розділ + важливість + дедлайн ----------
   Одне вікно на всі екрани — розділи приходять із /api/me (що дозволено ролі). */
export function NewTaskModal({
  defaultCategory,
  color = 'var(--orange)',
  title = 'Нова задача',
  placeholder = 'Що треба зробити',
  onClose,
  onSaved,
}) {
  const dict = useDictionaries()
  const cats = catOptions(dict)
  const prios = prioOptions(dict)
  const defPrio = dict.priorities?.find((p) => p.is_default)?.key || prios[prios.length - 1]?.value

  const [text, setText] = useState('')
  const [category, setCategory] = useState(defaultCategory || '')
  const [priority, setPriority] = useState('')
  const [due, setDue] = useState('')      // «2026-08-10»
  const [dueTime, setDueTime] = useState('') // «14:30» або порожньо = на весь день
  const [items, setItems] = useState([]) // підзадачі й чекліст — поки задачі немає, тримаємо тут
  const [busy, setBusy] = useState(false)
  const [toast, showToast] = useToast()

  // довідники приїжджають асинхронно — підставляємо дефолти, коли вони готові
  useEffect(() => {
    if (!cats.some((c) => c.value === category)) setCategory(cats[0]?.value || '')
  }, [dict.categories]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!prios.some((p) => p.value === priority)) setPriority(defPrio || '')
  }, [dict.priorities]) // eslint-disable-line react-hooks/exhaustive-deps

  const valid = text.trim() && category && priority

  const save = async () => {
    if (!valid || busy) return
    setBusy(true)
    try {
      await post('/api/tasks', {
        text: text.trim(), category, priority, due: joinDue(due, dueTime), items,
      })
      haptic('medium')
      onSaved()
    } catch (e) { showToast(e.message, 'warn'); setBusy(false) }
  }

  return (
    <CenterModal
      title={title}
      onClose={onClose}
      footer={(
        <button className="btn-primary" style={{ background: color, opacity: valid ? 1 : 0.45 }}
          disabled={busy || !valid} onClick={save}>
          {busy ? 'Зберігаю…' : 'Зберегти'}
        </button>
      )}
    >
      <input placeholder={placeholder} value={text} autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()} />
      {cats.length > 1 && (
        <Field label="Розділ">
          <Segmented options={cats} value={category} onChange={setCategory} color={color} />
        </Field>
      )}
      {prios.length > 1 && (
        <Field label="Важливість">
          <Segmented options={prios} value={priority} onChange={setPriority} color={color} />
        </Field>
      )}
      <DueField date={due} time={dueTime} onChange={(d, t) => { setDue(d); setDueTime(t) }} />
      <TaskItemsEditor items={items} onChange={setItems} color={color} />
      {toast}
    </CenterModal>
  )
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
// розділ за замовчуванням, якщо AI його не підказав — за виконавцем
const ASSIGNEE_CATEGORY = { manager: 'production', assistant: 'life', driver: 'logistics', me: 'life' }

export function TaskPlanModal({ plan, color = 'var(--orange)', onClose, onSaved }) {
  const dict = useDictionaries()
  const cats = catOptions(dict)
  const prios = prioOptions(dict)
  const defPrio = dict.priorities?.find((p) => p.is_default)?.key || prios[prios.length - 1]?.value
  // розділ за виконавцем міг бути перейменований/видалений — тоді беремо перший наявний
  const fallbackCat = (assignee) => {
    const byRole = ASSIGNEE_CATEGORY[assignee]
    return cats.some((c) => c.value === byRole) ? byRole : cats[0]?.value || ''
  }

  const [rows, setRows] = useState(() => {
    const src = plan?.tasks?.length ? plan.tasks : [{ text: plan?.transcript || '', assignee: 'me' }]
    return src.map((t, i) => ({
      rid: i,
      text: t.text || '',
      assignee: ASSIGNEES.some((a) => a.value === t.assignee) ? t.assignee : 'me',
      category: t.category || '',
      priority: t.priority || '',
    }))
  })
  const [busy, setBusy] = useState(false)
  const [toast, showToast] = useToast()
  useLockScroll()

  // довідники могли ще не приїхати, коли вікно відкрилось → доповнюємо порожні поля
  useEffect(() => {
    if (!cats.length || !prios.length) return
    setRows((rs) => rs.map((r) => ({
      ...r,
      category: cats.some((c) => c.value === r.category) ? r.category : fallbackCat(r.assignee),
      priority: prios.some((p) => p.value === r.priority) ? r.priority : defPrio,
    })))
  }, [dict.categories, dict.priorities]) // eslint-disable-line react-hooks/exhaustive-deps

  const setText = (rid, v) => setRows((rs) => rs.map((r) => (r.rid === rid ? { ...r, text: v } : r)))
  const setField = (rid, field, v) => {
    haptic()
    setRows((rs) => rs.map((r) => (r.rid === rid ? { ...r, [field]: v } : r)))
  }
  const removeRow = (rid) => { haptic(); setRows((rs) => rs.filter((r) => r.rid !== rid)) }

  const valid = rows.filter((r) => r.text.trim())

  const save = async () => {
    if (!valid.length || busy) return
    setBusy(true)
    try {
      const r = await post('/api/ingest/tasks', {
        tasks: valid.map((r) => ({
          text: r.text.trim(), assignee: r.assignee, category: r.category, priority: r.priority,
        })),
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
        <div className="plan-list">
          {rows.map((r) => (
            <div className="plan-row" key={r.rid}>
              <div className="plan-row-top">
                <input
                  className="plan-text"
                  value={r.text}
                  placeholder="Текст справи"
                  onChange={(e) => setText(r.rid, e.target.value)}
                />
                {rows.length > 1 && (
                  <button className="plan-del" aria-label="Прибрати справу" onClick={() => removeRow(r.rid)}>
                    {Icons.close(16)}
                  </button>
                )}
              </div>
              <div className="plan-row-opts">
                <label className="plan-opt">
                  <span className="plan-opt-label">Кому</span>
                  <select value={r.assignee} onChange={(e) => setField(r.rid, 'assignee', e.target.value)}>
                    {ASSIGNEES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </label>
                <label className="plan-opt">
                  <span className="plan-opt-label">Розділ</span>
                  <select value={r.category} onChange={(e) => setField(r.rid, 'category', e.target.value)}>
                    {cats.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </label>
                <label className="plan-opt">
                  <span className="plan-opt-label">Важливість</span>
                  <select value={r.priority} onChange={(e) => setField(r.rid, 'priority', e.target.value)}>
                    {prios.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
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
  const edited = useRef(false) // користувач сам почав правити → не перетираємо його ввід
  // підхоплюємо зовнішні зміни (інший учасник відредагував) наживо, поки сам не редагую
  useEffect(() => {
    if (edited.current) return
    setComment(e.comment || '')
    setAmount(e.amount ? String(Math.round(e.amount)) : '')
  }, [e.comment, e.amount])
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
    <CenterModal title={e.text || 'Витрата'} onClose={onClose}>
      <div className="preview-meta ico-text">
        {e.approved ? Icons.check(13) : Icons.clock(13)}
        {e.approved ? 'підтверджено' : 'чекає підтвердження'} · {fmtTime(e.approved && e.approved_at ? e.approved_at : e.time)}
      </div>
      <MoneyInput value={amount} onChange={(v) => { edited.current = true; setAmount(v) }} placeholder="Сума" invalid={!amountValid} />
      <textarea rows={3} value={comment} onChange={(ev) => { edited.current = true; setComment(ev.target.value) }}
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
    </CenterModal>
  )
}

/* ---------- шторка задачі: редагування, виконано, видалення ---------- */
export function TaskSheet({ t, color = 'var(--orange)', onClose, onChanged }) {
  const dict = useDictionaries()
  const [text, setText] = useState(t.text)
  const [due, setDue] = useState(dueDatePart(t.due))
  const [dueTime, setDueTime] = useState(dueTimePart(t.due))
  const [category, setCategory] = useState(t.category)
  const [priority, setPriority] = useState(t.priority || 'normal')
  const [items, setItems] = useState(t.items || [])
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [toast, showToast] = useToast()
  const edited = useRef(false) // користувач сам почав правити → не перетираємо його ввід
  // підхоплюємо зовнішні зміни (інший учасник відредагував) наживо, поки сам не редагую
  useEffect(() => {
    if (edited.current) return
    setText(t.text)
    setDue(dueDatePart(t.due))
    setDueTime(dueTimePart(t.due))
    setCategory(t.category)
    setPriority(t.priority || 'normal')
    setItems(t.items || [])
  }, [t.text, t.due, t.category, t.priority, JSON.stringify(t.items || [])])

  // галочку в чеклісті зберігаємо одразу — чекати «Зберегти зміни» тут неприродно
  const saveItems = async (next) => {
    edited.current = true
    setItems(next)
    try {
      await patch(`/api/tasks/${t.id}`, {
        items: next.map(({ kind, text: it, done }) => ({ kind, text: it, done })),
      })
    } catch (err) { showToast(err.message, 'warn') }
  }
  // розділ можна змінити лише на той, що дозволений цій ролі
  const catOpts = catOptions(dict)
  const prioOpts = prioOptions(dict)
  const changed =
    text.trim() !== t.text ||
    joinDue(due, dueTime) !== (t.due || null) ||
    category !== t.category ||
    priority !== (t.priority || 'normal')

  const save = async (extra = {}) => {
    if (busy) return
    setBusy(true)
    try {
      await patch(`/api/tasks/${t.id}`, {
        text: text.trim(), due: joinDue(due, dueTime), category, priority, ...extra,
      })
      onChanged()
    } catch (err) { showToast(err.message, 'warn') } finally { setBusy(false) }
  }

  return (
    <CenterModal
      title="Задача"
      onClose={onClose}
      footer={(
        <>
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
        </>
      )}
    >
      <div className="preview-meta ico-text">
        {t.status === 'done' ? Icons.check(13) : Icons.clock(13)}
        {t.status === 'done' ? `виконано${t.done_at ? ' · ' + fmtTime(t.done_at) : ''}` : 'в роботі'}
        {findCat(dict, t.category) ? ` · ${findCat(dict, t.category).label}` : ''}
      </div>
      <textarea rows={3} value={text} onChange={(e) => { edited.current = true; setText(e.target.value) }}
        placeholder="Текст задачі" />
      {t.status !== 'done' && catOpts.length > 1 && (
        <Field label="Розділ">
          <Segmented options={catOpts} value={category} color={color}
            onChange={(v) => { edited.current = true; setCategory(v) }} />
        </Field>
      )}
      {t.status !== 'done' && prioOpts.length > 1 && (
        <Field label="Важливість">
          <Segmented options={prioOpts} value={priority} color={color}
            onChange={(v) => { edited.current = true; setPriority(v) }} />
        </Field>
      )}
      {t.status !== 'done' ? (
        <DueField date={due} time={dueTime}
          onChange={(d, tm) => { edited.current = true; setDue(d); setDueTime(tm) }} />
      ) : (t.due && (
        <div className="preview-meta ico-text">
          {Icons.clock(13)} Дедлайн: {fmtDueLong(t.due)}
        </div>
      ))}
      <TaskItemsEditor items={items} onChange={saveItems} color={color} />
      <button className="btn-small ghost danger" onClick={() => setConfirmDel(true)} disabled={busy}>
        {Icons.trash(15)} Видалити задачу
      </button>
      {confirmDel && (
        <ConfirmDialog text="Впевнені, що видалити?"
          onYes={() => { setConfirmDel(false); save({ deleted: true }) }}
          onNo={() => setConfirmDel(false)} />
      )}
      {toast}
    </CenterModal>
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

/* ---------- віконце по центру екрана (не знизу): підпис-роль у шапці ----------
   `footer` — дії, які лишаються на місці, поки вміст гортається (довгі форми).
   Escape закриває лише верхнє вікно: коли поверх відкрите ще одне (напр. «Нова
   підзадача»), нижнє має лишитись. */
const _modalStack = []

export function CenterModal({ title, sub, onClose, children, footer }) {
  const self = useRef({})
  useEffect(() => {
    const me = self.current
    _modalStack.push(me)
    const h = (e) => {
      if (e.key === 'Escape' && _modalStack[_modalStack.length - 1] === me) onClose()
    }
    window.addEventListener('keydown', h)
    return () => {
      window.removeEventListener('keydown', h)
      const i = _modalStack.indexOf(me)
      if (i >= 0) _modalStack.splice(i, 1)
    }
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
        {footer && <div className="center-modal-foot">{footer}</div>}
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

/* спільний сигнал «позначку бачено змінено» — щоб таб «Потік» і дзвіночок
   скидались одночасно (а не чекали наступного опитування) */
const _seenSubs = new Set()
function onSeenChange(fn) { _seenSubs.add(fn); return () => _seenSubs.delete(fn) }
function fireSeenChange() { _seenSubs.forEach((fn) => { try { fn() } catch { /* ok */ } }) }

/* лічильник нових у стрічці (бейдж на табі «Потік») — та сама логіка, що й дзвіночок;
   ділиться позначкою «бачено» через localStorage, тож обидва індикатори синхронні */
export function useFeedUnread(me) {
  const storeKey = `pult:feedSeen:${me?.telegram_id ?? 'x'}`
  const dismissKey = `pult:feedDismissed:${me?.telegram_id ?? 'x'}`
  const [feed, setFeed] = useState([])
  const [seen, setSeen] = useState(() => {
    const v = Number(localStorage.getItem(storeKey))
    return localStorage.getItem(storeKey) !== null && Number.isFinite(v) ? v : null
  })
  const seenRef = useRef(seen)
  seenRef.current = seen
  const feedRef = useRef(feed)
  feedRef.current = feed

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const f = await get('/api/feed')
        if (!alive || !Array.isArray(f)) return
        setFeed(f)
        if (seenRef.current === null) {
          const maxId = f.reduce((m, e) => Math.max(m, e.id), 0)
          localStorage.setItem(storeKey, String(maxId))
          setSeen(maxId)
        }
      } catch { /* мовчки */ }
    }
    load()
    const off = onLiveChange(load)
    const timer = setInterval(load, FEED_POLL_MS)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { alive = false; off(); clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [storeKey])

  // інший індикатор (дзвіночок) позначив бачено — підхоплюємо одразу
  useEffect(() => onSeenChange(() => {
    const v = Number(localStorage.getItem(storeKey))
    if (localStorage.getItem(storeKey) !== null && Number.isFinite(v)) setSeen(v)
  }), [storeKey])

  let dismissed
  try { dismissed = new Set(JSON.parse(localStorage.getItem(dismissKey) || '[]')) } catch { dismissed = new Set() }
  const base = seen === null ? Infinity : seen
  const count = feed.filter((e) => e.id > base && e.role !== me?.role && !dismissed.has(e.id)).length

  const markSeen = useCallback(() => {
    const maxId = feedRef.current.reduce((m, e) => Math.max(m, e.id), 0)
    if (maxId > 0) { localStorage.setItem(storeKey, String(maxId)); setSeen(maxId); fireSeenChange() }
  }, [storeKey])

  return { count, markSeen }
}

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

  // таб «Потік» (або інший індикатор) позначив бачено — підхоплюємо одразу
  useEffect(() => onSeenChange(() => {
    const v = Number(localStorage.getItem(storeKey))
    if (localStorage.getItem(storeKey) !== null && Number.isFinite(v)) setSeen(v)
  }), [storeKey])

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
    fireSeenChange()
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
