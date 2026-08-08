/* Екран власниці: «Розділи та важливість».
   Системні записи можна перейменувати й перефарбувати, але не видалити —
   на них побудовані екрани команди. Свої — додавати й видаляти вільно. */
import { useState } from 'react'
import { del, patch, post, put } from '../api'
import {
  COLOR_KEYS, CenterModal, ConfirmDialog, Field, Header, Icons, PICKABLE_ICONS,
  Segmented, assignableRoles, colorVar, refreshDictionaries, useDictionaries,
  useRoles, useToast,
} from '../components'

/* ---------- вибір іконки та кольору ---------- */
function IconPicker({ value, onChange, color }) {
  return (
    <div className="pick-grid">
      {PICKABLE_ICONS.map((name) => (
        <button key={name} type="button" className={`pick-ico ${value === name ? 'on' : ''}`}
          style={value === name ? { borderColor: color, color } : undefined}
          aria-label={name} onClick={() => onChange(name)}>
          {Icons[name]?.(20)}
        </button>
      ))}
    </div>
  )
}

function ColorPicker({ value, onChange }) {
  return (
    <div className="pick-colors">
      {COLOR_KEYS.map((c) => (
        <button key={c} type="button" className={`pick-color ${value === c ? 'on' : ''}`}
          style={{ background: colorVar(c) }} aria-label={c} onClick={() => onChange(c)} />
      ))}
    </div>
  )
}

/* ---------- вікно розділу ---------- */
function CategoryModal({ cat, categories, onClose, onSaved }) {
  const rd = useRoles()
  const isNew = !cat
  const [label, setLabel] = useState(cat?.label || '')
  const [icon, setIcon] = useState(cat?.icon || 'task')
  const [color, setColor] = useState(cat?.color || 'orange')
  const [roles, setRoles] = useState(cat?.roles || [])
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [moveTo, setMoveTo] = useState('')
  const [taskCount, setTaskCount] = useState(0)
  const [toast, showToast] = useToast()

  const others = categories.filter((c) => c.key !== cat?.key)
  const toggleRole = (r) =>
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))

  const save = async () => {
    if (!label.trim() || busy) return
    setBusy(true)
    try {
      const body = { label: label.trim(), icon, color, roles }
      if (isNew) await post('/api/categories', body)
      else await patch(`/api/categories/${cat.id}`, body)
      await refreshDictionaries()
      onSaved()
    } catch (e) { showToast(e.message, 'warn'); setBusy(false) }
  }

  const remove = async (target) => {
    setBusy(true)
    try {
      await del(`/api/categories/${cat.id}${target ? `?move_to=${encodeURIComponent(target)}` : ''}`)
      await refreshDictionaries()
      onSaved()
    } catch (e) {
      // сервер каже: у розділі є справи — питаємо, куди їх перенести
      const m = /^tasks_present:(\d+)$/.exec(e.message)
      if (m) {
        setTaskCount(Number(m[1]))
        setMoveTo(others[0]?.key || '')
      } else showToast(e.message, 'warn')
      setBusy(false)
    }
  }

  return (
    <CenterModal title={isNew ? 'Новий розділ' : 'Розділ'}
      sub={cat?.is_system ? 'системний' : undefined} onClose={onClose}>
      <input placeholder="Назва (напр. Реклама)" value={label} autoFocus
        onChange={(e) => setLabel(e.target.value)} />
      <Field label="Іконка"><IconPicker value={icon} onChange={setIcon} color={colorVar(color)} /></Field>
      <Field label="Колір"><ColorPicker value={color} onChange={setColor} /></Field>
      <Field label="Хто бачить (власниця — завжди)">
        <div className="seg">
          {assignableRoles(rd).map((r) => (
            <button key={r.key} type="button"
              className={`seg-btn ${roles.includes(r.key) ? 'on' : ''}`}
              style={roles.includes(r.key)
                ? { background: colorVar(color), borderColor: colorVar(color) } : undefined}
              onClick={() => toggleRole(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      </Field>

      <button className="btn-primary"
        style={{ background: colorVar(color), opacity: label.trim() ? 1 : 0.45 }}
        disabled={busy || !label.trim()} onClick={save}>
        {busy ? 'Зберігаю…' : isNew ? 'Створити розділ' : 'Зберегти зміни'}
      </button>

      {!isNew && !cat.is_system && (
        <button className="btn-small ghost danger" disabled={busy} onClick={() => setConfirmDel(true)}>
          {Icons.trash(15)} Видалити розділ
        </button>
      )}
      {!isNew && cat.is_system && (
        <div className="preview-meta">
          Системний розділ: на ньому побудовані екрани команди, тож видалити не можна —
          але перейменувати й перефарбувати вільно.
        </div>
      )}

      {confirmDel && (
        <ConfirmDialog text="Впевнені, що видалити розділ?"
          onYes={() => { setConfirmDel(false); remove(null) }}
          onNo={() => setConfirmDel(false)} />
      )}
      {taskCount > 0 && (
        <CenterModal title="Куди перенести справи?"
          sub={`у розділі ${taskCount}`} onClose={() => setTaskCount(0)}>
          <div className="preview-meta">
            Розділ не порожній. Оберіть, куди перекласти справи — нічого не загубиться.
          </div>
          <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            {others.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <button className="btn-primary" style={{ background: 'var(--red)' }}
            disabled={busy || !moveTo} onClick={() => { setTaskCount(0); remove(moveTo) }}>
            Перенести й видалити розділ
          </button>
        </CenterModal>
      )}
      {toast}
    </CenterModal>
  )
}

/* ---------- вікно рівня важливості ---------- */
function PriorityModal({ prio, onClose, onSaved }) {
  const isNew = !prio
  const [label, setLabel] = useState(prio?.label || '')
  const [icon, setIcon] = useState(prio?.icon || 'up')
  const [color, setColor] = useState(prio?.color || 'warn')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [toast, showToast] = useToast()

  const save = async () => {
    if (!label.trim() || busy) return
    setBusy(true)
    try {
      const body = { label: label.trim(), icon, color }
      if (isNew) await post('/api/priorities', body)
      else await patch(`/api/priorities/${prio.id}`, body)
      await refreshDictionaries()
      onSaved()
    } catch (e) { showToast(e.message, 'warn'); setBusy(false) }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await del(`/api/priorities/${prio.id}`)
      await refreshDictionaries()
      onSaved()
    } catch (e) { showToast(e.message, 'warn'); setBusy(false) }
  }

  return (
    <CenterModal title={isNew ? 'Новий рівень' : 'Рівень важливості'}
      sub={prio?.is_default ? 'за замовчуванням' : undefined} onClose={onClose}>
      <input placeholder="Назва (напр. Коли буде час)" value={label} autoFocus
        onChange={(e) => setLabel(e.target.value)} />
      <Field label="Позначка в списку"><IconPicker value={icon} onChange={setIcon} color={colorVar(color)} /></Field>
      <Field label="Колір"><ColorPicker value={color} onChange={setColor} /></Field>
      {isNew && (
        <div className="preview-meta">
          Новий рівень стає найменш важливим — далі підніміть його стрілками на своє місце.
        </div>
      )}

      <button className="btn-primary"
        style={{ background: colorVar(color), opacity: label.trim() ? 1 : 0.45 }}
        disabled={busy || !label.trim()} onClick={save}>
        {busy ? 'Зберігаю…' : isNew ? 'Створити рівень' : 'Зберегти зміни'}
      </button>

      {!isNew && !prio.is_default && (
        <button className="btn-small ghost danger" disabled={busy} onClick={() => setConfirmDel(true)}>
          {Icons.trash(15)} Видалити рівень
        </button>
      )}
      {!isNew && prio.is_default && (
        <div className="preview-meta">
          Рівень за замовчуванням: на нього падають задачі з видалених рівнів, тож прибрати не можна.
        </div>
      )}
      {confirmDel && (
        <ConfirmDialog text="Задачі з цим рівнем стануть звичайними. Видалити?"
          onYes={() => { setConfirmDel(false); remove() }}
          onNo={() => setConfirmDel(false)} />
      )}
      {toast}
    </CenterModal>
  )
}

/* ---------- сам екран ---------- */
export default function Dictionaries({ onBack }) {
  const dict = useDictionaries()
  const [cat, setCat] = useState(null)       // { …розділ } або 'new'
  const [prio, setPrio] = useState(null)
  const [toast, showToast] = useToast()

  const categories = dict.categories || []
  const priorities = dict.priorities || []

  const move = async (idx, dir) => {
    const next = [...priorities]
    const to = idx + dir
    if (to < 0 || to >= next.length) return
    ;[next[idx], next[to]] = [next[to], next[idx]]
    try {
      await put('/api/priorities/order', { ids: next.map((p) => p.id) })
      await refreshDictionaries()
    } catch (e) { showToast(e.message, 'warn') }
  }

  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>
      <Header icon="gear" color="var(--orange)" title="Розділи та важливість"
        sub="що можна вибирати при створенні справи" />

      <div className="section-label">Розділи задач</div>
      <div className="card" style={{ padding: '2px 14px' }}>
        {categories.map((c) => (
          <div key={c.key} className="dict-row" role="button" tabIndex={0} onClick={() => setCat(c)}>
            <span className="dict-ico" style={{ background: colorVar(c.color) }}>
              {Icons[c.icon]?.(18) || Icons.task(18)}
            </span>
            <span className="dict-info">
              <span className="dict-name">{c.label}</span>
              <span className="dict-sub">
                {c.is_system ? 'системний' : 'свій'}
                {c.roles?.length ? ` · бачать: ${c.roles.length}` : ' · тільки власниця'}
              </span>
            </span>
            <span className="ico" style={{ color: 'var(--muted)', display: 'flex' }}>{Icons.pencil(15)}</span>
          </div>
        ))}
      </div>
      <button className="btn-dashed" style={{ color: 'var(--orange)' }} onClick={() => setCat('new')}>
        {Icons.plus(18)} Додати розділ
      </button>

      <div className="section-label">Важливість · згори найважливіше</div>
      <div className="card" style={{ padding: '2px 14px' }}>
        {priorities.map((p, i) => (
          <div key={p.key} className="dict-row">
            <span className="dict-ico" style={{ background: colorVar(p.color) }}>
              {(p.icon && Icons[p.icon]?.(18)) || Icons.task(18)}
            </span>
            <span className="dict-info" role="button" tabIndex={0} onClick={() => setPrio(p)}>
              <span className="dict-name">{p.label}</span>
              <span className="dict-sub">{p.is_default ? 'за замовчуванням' : p.is_system ? 'системний' : 'свій'}</span>
            </span>
            <span className="dict-move">
              <button className="btn-icon" aria-label="Вище" disabled={i === 0}
                onClick={() => move(i, -1)}>{Icons.chevUp(16)}</button>
              <button className="btn-icon" aria-label="Нижче" disabled={i === priorities.length - 1}
                onClick={() => move(i, 1)}>{Icons.chevDown(16)}</button>
            </span>
            <span className="ico" style={{ color: 'var(--muted)', display: 'flex' }} role="button"
              tabIndex={0} onClick={() => setPrio(p)}>{Icons.pencil(15)}</span>
          </div>
        ))}
      </div>
      <button className="btn-dashed" style={{ color: 'var(--orange)' }} onClick={() => setPrio('new')}>
        {Icons.plus(18)} Додати рівень
      </button>

      {cat && (
        <CategoryModal cat={cat === 'new' ? null : cat} categories={categories}
          onClose={() => setCat(null)} onSaved={() => setCat(null)} />
      )}
      {prio && (
        <PriorityModal prio={prio === 'new' ? null : prio}
          onClose={() => setPrio(null)} onSaved={() => setPrio(null)} />
      )}
      {toast}
    </div>
  )
}
