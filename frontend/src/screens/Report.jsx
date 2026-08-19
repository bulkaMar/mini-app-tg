/* Надіслати запис власниці вільним текстом.
   Раніше ця кнопка була тільки в менеджера («Звіт зі зйомки») — і це був
   єдиний спосіб для команди щось написати. Тепер доступна всім у Потоці. */
import { useState } from 'react'
import { post } from '../api'
import { CenterModal, Icons, useToast } from '../components'

export default function Report({ onClose }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, showToast] = useToast()

  const send = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      await post('/api/ingest', { text: text.trim() })
      onClose(true)
    } catch (e) { showToast(e.message, 'warn'); setBusy(false) }
  }

  return (
    <CenterModal
      title="Звіт" onClose={() => onClose(false)}
      footer={(
        <button className="btn-primary"
          style={{ background: 'var(--orange)', opacity: text.trim() ? 1 : 0.45 }}
          disabled={busy || !text.trim()} onClick={send}>
          {busy ? 'Надсилаю…' : 'Надіслати'}
        </button>
      )}
    >
      <textarea rows={4} value={text} autoFocus
        placeholder="Напр.: знято 3 сцени з 5, локація на чт під питанням"
        onChange={(e) => setText(e.target.value)} />
      <div className="preview-meta" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit', fontWeight: 500 }}>
        Запис потрапить у стрічку, а власниці прийде сповіщення.
      </div>
      {toast}
    </CenterModal>
  )
}
