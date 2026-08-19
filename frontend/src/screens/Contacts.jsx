/* Підвкладка «Контакти» розділу «Люди» (6.2).

   Записник: гример, оренда світла, водій крану. Ці люди в застосунок не
   заходять — у них немає ні ролі, ні доступів, тільки ім'я, телефон і
   підпис «чим займається». Тому їх і тримаємо окремо від команди:
   контакт неможливо випадково пустити всередину.

   Дивитись може кожен, кому відкриті «Люди»; змінювати — власниця. */
import { useCallback, useState } from 'react'
import { get, patch, post } from '../api'
import { CenterModal, ConfirmDialog, Icons, useLiveSel, usePoll, useToast } from '../components'
import { CallRow } from './shared'

const initials = (n) => String(n || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

function ContactModal({ contact, onClose, onSaved, canEdit }) {
  const isNew = !contact
  const [name, setName] = useState(contact?.name || '')
  const [title, setTitle] = useState(contact?.title || '')
  const [phone, setPhone] = useState(contact?.phone || '')
  const [username, setUsername] = useState(contact?.username || '')
  const [note, setNote] = useState(contact?.note || '')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [toast, showToast] = useToast()

  const body = { name: name.trim(), title: title.trim(), phone: phone.trim(), username: username.trim(), note: note.trim() }
  const save = async () => {
    if (!body.name || busy) return
    setBusy(true)
    try {
      if (isNew) await post('/api/contacts', body)
      else await patch(`/api/contacts/${contact.id}`, body)
      onSaved()
    } catch (e) { showToast(e.message, 'warn'); setBusy(false) }
  }
  const remove = async () => {
    setBusy(true)
    try {
      await patch(`/api/contacts/${contact.id}`, { deleted: true })
      onSaved()
    } catch (e) { showToast(e.message, 'warn'); setBusy(false) }
  }

  // без права правити вікно — просто картка: як звати, ким працює, як подзвонити
  if (!canEdit) {
    return (
      <CenterModal title={contact.name} sub={contact.title || 'контакт'} onClose={onClose}>
        <CallRow phone={contact.phone} username={contact.username} />
        {contact.note && <div className="preview-meta" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit', fontWeight: 500 }}>{contact.note}</div>}
        {!contact.phone && !contact.username && <div className="empty">Ні телефону, ні Telegram</div>}
      </CenterModal>
    )
  }

  return (
    <CenterModal
      title={isNew ? 'Новий контакт' : contact.name}
      sub={isNew ? 'без доступу в застосунок' : contact.title || 'контакт'}
      onClose={onClose}
      footer={(
        <>
          <button className="btn-primary" style={{ background: 'var(--orange)', opacity: body.name ? 1 : 0.45 }}
            disabled={busy || !body.name} onClick={save}>
            {busy ? 'Зберігаю…' : isNew ? 'Зберегти' : 'Зберегти зміни'}
          </button>
          {!isNew && (
            <button className="btn-small ghost danger" disabled={busy} onClick={() => setConfirmDel(true)}>
              {Icons.trash(15)} Видалити контакт
            </button>
          )}
        </>
      )}
    >
      <input placeholder="Ім'я" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      <input placeholder="Чим займається (гример, оренда світла…)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input placeholder="Телефон" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input placeholder="@username у Telegram" value={username} onChange={(e) => setUsername(e.target.value)} />
      <textarea rows={3} placeholder="Нотатка (ставка, як домовлялись…)" value={note} onChange={(e) => setNote(e.target.value)} />
      {!isNew && <CallRow phone={contact.phone} username={contact.username} />}
      <div className="preview-meta" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit', fontWeight: 500 }}>
        Контакт не заходить у застосунок і нічого в ньому не бачить.
      </div>
      {confirmDel && (
        <ConfirmDialog text="Впевнені, що видалити контакт?"
          onYes={() => { setConfirmDel(false); remove() }}
          onNo={() => setConfirmDel(false)} />
      )}
      {toast}
    </CenterModal>
  )
}

export default function Contacts({ owner }) {
  const [list, setList] = useState(null)
  const [sel, setSel] = useState(null) // контакт або 'new'

  const load = useCallback(() => get('/api/contacts').then(setList).catch(() => setList([])), [])
  usePoll(load)
  useLiveSel(list, sel === 'new' ? null : sel, setSel)

  if (!list) return <div className="loading">Завантаження…</div>

  return (
    <>
      {list.length === 0 && (
        <div className="empty">
          Записник порожній.{owner ? ' Сюди зручно скласти тих, кого кличеш на зйомки.' : ''}
        </div>
      )}
      {list.length > 0 && (
        <div className="card" style={{ padding: '2px 14px' }}>
          {list.map((c) => (
            <div key={c.id} className="member" role="button" tabIndex={0}
              style={{ cursor: 'pointer' }} onClick={() => setSel(c)}>
              <div className="avatar" style={{ background: 'var(--muted)' }}>{initials(c.name)}</div>
              <div className="info">
                <div className="name">{c.name}</div>
                <div className="uname">
                  {[c.title, c.phone || (c.username ? `@${c.username}` : '')].filter(Boolean).join(' · ') || 'без телефону'}
                </div>
              </div>
              {c.phone && <span className="ico" style={{ color: 'var(--muted)', display: 'flex' }}>{Icons.phone(16)}</span>}
            </div>
          ))}
        </div>
      )}
      {owner && (
        <button className="btn-dashed" style={{ color: 'var(--orange)' }} onClick={() => setSel('new')}>
          {Icons.plus(18)} Додати контакт
        </button>
      )}
      {sel && (
        <ContactModal contact={sel === 'new' ? null : sel} canEdit={owner}
          onClose={() => setSel(null)} onSaved={() => { setSel(null); load() }} />
      )}
    </>
  )
}
