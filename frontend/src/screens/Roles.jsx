/* Екран власниці: «Ролі».
   Ролі — дані простору. Базові (Власник / Менеджер / Асистент / Водій) можна
   перейменувати й перефарбувати, але не видалити: на них тримається роздача
   задач і сповіщення. Решту — вільно.

   «Поводиться як» тимчасово визначає, який екран побачить людина. Коли
   зʼявляться тумблери розділів по кожній людині (0.5–0.7), це поле зникне. */
import { useState } from 'react'
import { del, patch, post } from '../api'
import {
  COLOR_KEYS, CenterModal, ConfirmDialog, Field, Header, Icons, Segmented,
  colorVar, refreshRoles, useRoles, useToast,
} from '../components'

const BASES = [
  { value: 'manager', label: 'Менеджер' },
  { value: 'assistant', label: 'Асистент' },
  { value: 'driver', label: 'Водій' },
]
const BASE_HINT = {
  manager: 'Побачить екран менеджера: проєкти, тривоги, задачі',
  assistant: 'Побачить екран асистента: побут, пес, фінанси',
  driver: 'Побачить екран водія: зміна, поїздки, паливо',
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

function RoleModal({ role, onClose, onSaved }) {
  const isNew = !role
  const isOwner = role?.base === 'owner'
  const [label, setLabel] = useState(role?.label || '')
  const [color, setColor] = useState(role?.color || 'muted')
  const [base, setBase] = useState(BASES.some((b) => b.value === role?.base) ? role.base : 'assistant')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [toast, showToast] = useToast()

  const save = async () => {
    if (!label.trim() || busy) return
    setBusy(true)
    try {
      const body = { label: label.trim(), color, base }
      if (isNew) await post('/api/roles', body)
      else await patch(`/api/roles/${role.id}`, body)
      await refreshRoles()
      onSaved()
    } catch (e) { showToast(e.message, 'warn'); setBusy(false) }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await del(`/api/roles/${role.id}`)
      await refreshRoles()
      onSaved()
    } catch (e) { showToast(e.message, 'warn'); setBusy(false) }
  }

  return (
    <CenterModal
      title={isNew ? 'Нова роль' : 'Роль'}
      sub={role?.is_system ? 'базова' : undefined}
      onClose={onClose}
      footer={(
        <>
          <button className="btn-primary"
            style={{ background: colorVar(color), opacity: label.trim() ? 1 : 0.45 }}
            disabled={busy || !label.trim()} onClick={save}>
            {busy ? 'Зберігаю…' : isNew ? 'Створити роль' : 'Зберегти зміни'}
          </button>
          {!isNew && !role.is_system && (
            <button className="btn-small ghost danger" disabled={busy} onClick={() => setConfirmDel(true)}>
              {Icons.trash(15)} Видалити роль
            </button>
          )}
        </>
      )}
    >
      <input placeholder="Назва (напр. Оператор)" value={label} autoFocus
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()} />
      <Field label="Колір"><ColorPicker value={color} onChange={setColor} /></Field>

      {!isOwner && (
        <Field label="Поводиться як">
          <Segmented options={BASES} value={base} onChange={setBase} color={colorVar(color)} />
          <div className="due-hint">{BASE_HINT[base]}</div>
        </Field>
      )}
      {isOwner && (
        <div className="preview-meta">
          Роль власниці: повний доступ до всього. Її не призначають іншим і не видаляють.
        </div>
      )}
      {!isNew && !role.is_system && role.members > 0 && (
        <div className="preview-meta">
          Цю роль мають людей: {role.members}. Щоб видалити — спершу переведіть їх на іншу.
        </div>
      )}
      {!isNew && role.is_system && !isOwner && (
        <div className="preview-meta">
          Базова роль: на ній тримається роздача задач і сповіщення, тож прибрати не можна.
          Перейменувати й перефарбувати — вільно.
        </div>
      )}
      {confirmDel && (
        <ConfirmDialog text="Впевнені, що видалити роль?"
          onYes={() => { setConfirmDel(false); remove() }}
          onNo={() => setConfirmDel(false)} />
      )}
      {toast}
    </CenterModal>
  )
}

export default function Roles({ onBack }) {
  const { roles } = useRoles()
  const [sel, setSel] = useState(null) // роль або 'new'

  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>
      <Header icon="shield" color="var(--orange)" title="Ролі"
        sub="хто буває в команді" />

      <div className="card" style={{ padding: '2px 14px' }}>
        {roles.map((r) => (
          <div key={r.key} className="dict-row" role="button" tabIndex={0} onClick={() => setSel(r)}>
            <span className="dict-ico" style={{ background: colorVar(r.color) }}>
              {Icons.shield(18)}
            </span>
            <span className="dict-info">
              <span className="dict-name">{r.label}</span>
              <span className="dict-sub">
                {r.base === 'owner' ? 'повний доступ' : r.is_system ? 'базова' : 'своя'}
                {r.members > 0 && ` · людей: ${r.members}`}
              </span>
            </span>
            <span className="ico" style={{ color: 'var(--muted)', display: 'flex' }}>{Icons.pencil(15)}</span>
          </div>
        ))}
      </div>
      <button className="btn-dashed" style={{ color: 'var(--orange)' }} onClick={() => setSel('new')}>
        {Icons.plus(18)} Додати роль
      </button>

      <div className="preview-meta" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit', fontWeight: 500 }}>
        Створена роль одразу зʼявляється у списку, коли додаєш людину в команду.
      </div>

      {sel && (
        <RoleModal role={sel === 'new' ? null : sel}
          onClose={() => setSel(null)} onSaved={() => setSel(null)} />
      )}
    </div>
  )
}
