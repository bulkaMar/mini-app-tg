/* Налаштування → «Важливість».
   Порядок згори вниз задає, що піднімається вгору списків задач.
   Рівень за замовчуванням прибрати не можна — на нього падають задачі
   з видалених рівнів. */
import { useState } from 'react'
import { del, patch, post, put } from '../api'
import {
  CenterModal, ColorPicker, ConfirmDialog, Field, Header, IconPicker, Icons,
  colorVar, refreshDictionaries, useDictionaries, useToast,
} from '../components'

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
    <CenterModal
      title={isNew ? 'Новий рівень' : 'Рівень важливості'}
      sub={prio?.is_default ? 'за замовчуванням' : undefined}
      onClose={onClose}
      footer={(
        <>
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
        </>
      )}
    >
      <input placeholder="Назва (напр. Коли буде час)" value={label} autoFocus
        onChange={(e) => setLabel(e.target.value)} />
      <Field label="Позначка в списку">
        <IconPicker value={icon} onChange={setIcon} color={colorVar(color)} />
      </Field>
      <Field label="Колір"><ColorPicker value={color} onChange={setColor} /></Field>
      {isNew && (
        <div className="preview-meta">
          Новий рівень стає найменш важливим — далі підніміть його стрілками на своє місце.
        </div>
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

export default function Priorities({ onBack }) {
  const dict = useDictionaries()
  const [sel, setSel] = useState(null) // рівень або 'new'
  const [toast, showToast] = useToast()
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
      <Header icon="flame" color="var(--orange)" title="Важливість"
        sub="згори найважливіше" />

      <div className="card" style={{ padding: '2px 14px' }}>
        {priorities.map((p, i) => (
          <div key={p.key} className="dict-row">
            <span className="dict-ico" style={{ background: colorVar(p.color) }}>
              {(p.icon && Icons[p.icon]?.(18)) || Icons.task(18)}
            </span>
            <span className="dict-info" role="button" tabIndex={0} onClick={() => setSel(p)}>
              <span className="dict-name">{p.label}</span>
              <span className="dict-sub">
                {p.is_default ? 'за замовчуванням' : p.is_system ? 'системний' : 'свій'}
              </span>
            </span>
            <span className="dict-move">
              <button className="btn-icon" aria-label="Вище" disabled={i === 0}
                onClick={() => move(i, -1)}>{Icons.chevUp(16)}</button>
              <button className="btn-icon" aria-label="Нижче" disabled={i === priorities.length - 1}
                onClick={() => move(i, 1)}>{Icons.chevDown(16)}</button>
            </span>
            <span className="ico" style={{ color: 'var(--muted)', display: 'flex' }} role="button"
              tabIndex={0} onClick={() => setSel(p)}>{Icons.pencil(15)}</span>
          </div>
        ))}
      </div>
      <button className="btn-dashed" style={{ color: 'var(--orange)' }} onClick={() => setSel('new')}>
        {Icons.plus(18)} Додати рівень
      </button>

      {sel && (
        <PriorityModal prio={sel === 'new' ? null : sel}
          onClose={() => setSel(null)} onSaved={() => setSel(null)} />
      )}
      {toast}
    </div>
  )
}
