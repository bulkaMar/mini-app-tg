/* Налаштування → «Категорії».
   Системні (Проєкти / Побут / Пес / Поїздки) перейменовуються й
   перефарбовуються, але не видаляються — на них побудовані екрани команди.
   Свої — додавати й видаляти вільно. */
import { useState } from 'react'
import { del, patch, post } from '../api'
import {
  CenterModal, ColorPicker, ConfirmDialog, Field, Header, IconPicker, Icons,
  assignableRoles, colorVar, refreshDictionaries, useDictionaries, useRoles, useToast,
} from '../components'

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
      // сервер каже: у категорії є справи — питаємо, куди їх перенести
      const m = /^tasks_present:(\d+)$/.exec(e.message)
      if (m) {
        setTaskCount(Number(m[1]))
        setMoveTo(others[0]?.key || '')
      } else showToast(e.message, 'warn')
      setBusy(false)
    }
  }

  return (
    <CenterModal
      title={isNew ? 'Нова категорія' : 'Категорія'}
      sub={cat?.is_system ? 'системна' : undefined}
      onClose={onClose}
      footer={(
        <>
          <button className="btn-primary"
            style={{ background: colorVar(color), opacity: label.trim() ? 1 : 0.45 }}
            disabled={busy || !label.trim()} onClick={save}>
            {busy ? 'Зберігаю…' : isNew ? 'Створити категорію' : 'Зберегти зміни'}
          </button>
          {!isNew && !cat.is_system && (
            <button className="btn-small ghost danger" disabled={busy} onClick={() => setConfirmDel(true)}>
              {Icons.trash(15)} Видалити категорію
            </button>
          )}
        </>
      )}
    >
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

      {!isNew && cat.is_system && (
        <div className="preview-meta">
          Системна категорія: на ній побудовані екрани команди, тож видалити не можна —
          але перейменувати й перефарбувати вільно.
        </div>
      )}

      {confirmDel && (
        <ConfirmDialog text="Впевнені, що видалити категорію?"
          onYes={() => { setConfirmDel(false); remove(null) }}
          onNo={() => setConfirmDel(false)} />
      )}
      {taskCount > 0 && (
        <CenterModal title="Куди перенести справи?"
          sub={`у категорії ${taskCount}`} onClose={() => setTaskCount(0)}>
          <div className="preview-meta">
            Категорія не порожня. Оберіть, куди перекласти справи — нічого не загубиться.
          </div>
          <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            {others.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <button className="btn-primary" style={{ background: 'var(--red)' }}
            disabled={busy || !moveTo} onClick={() => { setTaskCount(0); remove(moveTo) }}>
            Перенести й видалити категорію
          </button>
        </CenterModal>
      )}
      {toast}
    </CenterModal>
  )
}

export default function Categories({ onBack }) {
  const dict = useDictionaries()
  const [sel, setSel] = useState(null) // категорія або 'new'
  const categories = dict.categories || []

  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>
      <Header icon="task" color="var(--orange)" title="Категорії"
        sub="куди складаються справи" />

      <div className="card" style={{ padding: '2px 14px' }}>
        {categories.map((c) => (
          <div key={c.key} className="dict-row" role="button" tabIndex={0} onClick={() => setSel(c)}>
            <span className="dict-ico" style={{ background: colorVar(c.color) }}>
              {Icons[c.icon]?.(18) || Icons.task(18)}
            </span>
            <span className="dict-info">
              <span className="dict-name">{c.label}</span>
              <span className="dict-sub">
                {c.is_system ? 'системна' : 'своя'}
                {c.roles?.length ? ` · бачать: ${c.roles.length}` : ' · тільки власниця'}
              </span>
            </span>
            <span className="ico" style={{ color: 'var(--muted)', display: 'flex' }}>{Icons.pencil(15)}</span>
          </div>
        ))}
      </div>
      <button className="btn-dashed" style={{ color: 'var(--orange)' }} onClick={() => setSel('new')}>
        {Icons.plus(18)} Додати категорію
      </button>

      {sel && (
        <CategoryModal cat={sel === 'new' ? null : sel} categories={categories}
          onClose={() => setSel(null)} onSaved={() => setSel(null)} />
      )}
    </div>
  )
}
