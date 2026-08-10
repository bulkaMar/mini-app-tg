/* Вкладка «Моє»: Нотатки і Особисте.
   Обидва списки бачить тільки автор — це окрема таблиця на сервері, тож
   записи не потрапляють ні в стрічку, ні в панель, ні в те, що читає AI. */
import { useCallback, useState } from 'react'
import { del, patch, post } from '../api'
import { get } from '../api'
import {
  CenterModal, ConfirmDialog, Header, Icons, fmtTime, useLiveSel, usePoll, useToast,
} from '../components'

const KINDS = [
  {
    key: 'note',
    label: 'Нотатки',
    icon: 'note',
    title: 'Нотатки',
    sub: 'робочі записи для себе',
    add: 'Додати нотатку',
    placeholder: 'Напр.: пароль вайфаю на локації',
    hint: 'Ці записи бачиш тільки ти.',
    empty: 'Нотаток ще немає',
  },
  {
    key: 'private',
    label: 'Особисте',
    icon: 'lock',
    title: 'Особисте',
    sub: 'свої справи й думки',
    add: 'Додати запис',
    placeholder: 'Напр.: записатись до лікаря',
    hint: 'Не бачить ніхто — ні команда, ні власниця. Ці записи не йдуть у стрічку, звіти чи AI.',
    empty: 'Тут поки порожньо',
  },
]

function NoteModal({ note, kind, onClose, onSaved }) {
  const cfg = KINDS.find((k) => k.key === kind)
  const isNew = !note
  const [text, setText] = useState(note?.text || '')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [toast, showToast] = useToast()

  const save = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      if (isNew) await post('/api/notes', { kind, text: text.trim() })
      else await patch(`/api/notes/${note.id}`, { text: text.trim() })
      onSaved()
    } catch (e) { showToast(e.message, 'warn'); setBusy(false) }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await patch(`/api/notes/${note.id}`, { deleted: true })
      onSaved()
    } catch (e) { showToast(e.message, 'warn'); setBusy(false) }
  }

  return (
    <CenterModal
      title={isNew ? cfg.add : cfg.title}
      sub={note?.time ? fmtTime(note.time) : undefined}
      onClose={onClose}
      footer={(
        <>
          <button className="btn-primary"
            style={{ background: 'var(--orange)', opacity: text.trim() ? 1 : 0.45 }}
            disabled={busy || !text.trim()} onClick={save}>
            {busy ? 'Зберігаю…' : isNew ? 'Зберегти' : 'Зберегти зміни'}
          </button>
          {!isNew && (
            <button className="btn-small ghost danger" disabled={busy} onClick={() => setConfirmDel(true)}>
              {Icons.trash(15)} Видалити
            </button>
          )}
        </>
      )}
    >
      <textarea rows={6} value={text} autoFocus placeholder={cfg.placeholder}
        onChange={(e) => setText(e.target.value)} />
      <div className="preview-meta" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit', fontWeight: 500 }}>
        {cfg.hint}
      </div>
      {confirmDel && (
        <ConfirmDialog text="Впевнені, що видалити запис?"
          onYes={() => { setConfirmDel(false); remove() }}
          onNo={() => setConfirmDel(false)} />
      )}
      {toast}
    </CenterModal>
  )
}

export default function Mine() {
  const [kind, setKind] = useState('note')
  const [notes, setNotes] = useState(null)
  const [sel, setSel] = useState(null)   // запис або 'new'
  const [toast, showToast] = useToast()
  const cfg = KINDS.find((k) => k.key === kind)

  const load = useCallback(
    () => get(`/api/notes?kind=${kind}`).then(setNotes).catch(() => setNotes([])),
    [kind],
  )
  usePoll(load)
  useLiveSel(notes, sel === 'new' ? null : sel, (v) => setSel(v))

  const toggle = async (n) => {
    setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, done: !x.done } : x)))
    try { await patch(`/api/notes/${n.id}`, { done: !n.done }) }
    catch (e) { showToast(e.message, 'warn'); load() }
  }

  return (
    <div className="screen">
      <Header icon={cfg.icon} color="var(--orange)" title={cfg.title} sub={cfg.sub} />

      <div className="seg">
        {KINDS.map((k) => (
          <button key={k.key} type="button" className={`seg-btn ${kind === k.key ? 'on' : ''}`}
            style={kind === k.key ? { background: 'var(--orange)', borderColor: 'var(--orange)' } : undefined}
            onClick={() => { setKind(k.key); setNotes(null) }}>
            {Icons[k.icon](15)} {k.label}
          </button>
        ))}
      </div>

      {kind === 'private' && (
        <div className="privacy-note">
          {Icons.lock(15)} Не бачить ніхто — ні команда, ні власниця
        </div>
      )}

      {!notes && <div className="loading">Завантаження…</div>}
      {notes && notes.length === 0 && <div className="empty">{cfg.empty}</div>}
      {notes && notes.map((n) => (
        <div key={n.id} className={`note-row ${n.done ? 'done' : ''}`}>
          <button type="button" className="ti-tick" aria-label={n.done ? 'Зняти' : 'Готово'}
            style={n.done ? { background: 'var(--orange)', borderColor: 'var(--orange)' } : undefined}
            onClick={() => toggle(n)}>
            {n.done ? Icons.check(13) : null}
          </button>
          <span className="note-text" role="button" tabIndex={0} onClick={() => setSel(n)}>
            {n.text}
            <span className="row-sub">{fmtTime(n.time)}</span>
          </span>
          <button className="btn-icon" aria-label="Змінити" onClick={() => setSel(n)}>
            {Icons.pencil(15)}
          </button>
        </div>
      ))}

      <button className="btn-dashed" style={{ color: 'var(--orange)' }} onClick={() => setSel('new')}>
        {Icons.plus(18)} {cfg.add}
      </button>

      {sel && (
        <NoteModal note={sel === 'new' ? null : sel} kind={kind}
          onClose={() => setSel(null)} onSaved={() => { setSel(null); load() }} />
      )}
      {toast}
    </div>
  )
}
