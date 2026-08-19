/* Картка людини (6.3, 6.4).

   Відкривається з розділу «Люди» → людина. Показує три речі:
   як зв'язатись, що на людині зараз, і що вона встигла зробити.

   Хто це бачить: власниця — будь-кого, решта — тільки себе. Так вирішує
   сервер; тут ми лише не показуємо кнопок, яких людині однаково не дадуть.
   Чат і дзвінок — переходом у Telegram та в телефон, своїх не робимо. */
import { useCallback, useState } from 'react'
import { get } from '../api'
import {
  Header, Icons, findCat, fmtTime, money, useDictionaries, usePoll, useRoles,
} from '../components'
import TaskItem from './TaskItem'
import { MemberSheet, untilLabel } from './Team'
import { CallRow, roleColor, spravy } from './shared'

const HISTORY = {
  task: { icon: 'check', label: 'Виконано' },
  expense: { icon: 'cart', label: 'Витрата' },
  risk: { icon: 'alert', label: 'Тривога' },
  report: { icon: 'inbox', label: 'Звіт' },
}

// «додано 12.08.2026»
const dayLabel = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p2 = (n) => String(n).padStart(2, '0')
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`
}

export default function Person({ id, owner, onBack }) {
  const rd = useRoles()
  const dict = useDictionaries()
  const [p, setP] = useState(null)
  const [failed, setFailed] = useState(null)
  const [editing, setEditing] = useState(false)

  const load = useCallback(
    () => get(`/api/people/${id}`).then((d) => { setP(d); setFailed(null) }).catch((e) => setFailed(e.message)),
    [id],
  )
  usePoll(load)

  if (failed) {
    return (
      <div className="screen">
        <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>
        <div className="empty">{failed}</div>
      </div>
    )
  }
  if (!p) return <div className="loading">Завантаження…</div>

  const color = roleColor(rd, p.role)
  const initials = String(p.name || p.username || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const invited = p.status === 'invited'

  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>
      <Header icon="users" color={color} title={p.name || `@${p.username}`}
        sub={(p.role_label || p.role) + (invited ? ' · запрошення надіслано' : '')} />

      <div className="card person-top">
        <div className="avatar" style={{ background: invited ? '#d9c79a' : color }}>{initials}</div>
        <div className="info">
          <div className="name">{p.username ? `@${p.username}` : 'без Telegram'}</div>
          <div className="uname">
            {p.phone || 'телефон не вказано'}
            {p.since ? ` · у команді з ${dayLabel(p.since)}` : ''}
          </div>
        </div>
      </div>

      <CallRow phone={p.phone} username={p.username} />
      {!p.phone && !p.username && (
        <div className="empty">Ні Telegram, ні телефону — зв'язатись нічим</div>
      )}

      {owner && (
        <>
          {p.access_expired && (
            <div className="privacy-note" style={{ color: 'var(--red)' }}>
              {Icons.lock(15)} Строк доступу вичерпано — зараз людина не заходить
            </div>
          )}
          {!p.access_expired && p.access_until && (
            <div className="privacy-note">{Icons.clock(15)} Доступ до {untilLabel(p.access_until)}</div>
          )}
          {p.employment === 'temporary' && (
            <div className="privacy-note">
              {Icons.clock(15)} Тимчасовий — бачить лише те, що зʼявилось після додавання
            </div>
          )}
        </>
      )}

      <div className="stat-row">
        <div className="stat"><b>{p.stats.open}</b><span>у роботі</span></div>
        <div className="stat"><b>{p.stats.done}</b><span>виконано</span></div>
        {/* суму приховано тому, кому вимкнено поле «Суми» — тоді тут прочерк */}
        <div className="stat">
          <b>{money(p.stats.spent)}</b>
          <span>{p.stats.expenses ? `витрат: ${p.stats.expenses}` : 'витрат немає'}</span>
        </div>
      </div>

      <div className="section-label">Зараз на людині · {spravy(p.stats.open)}</div>
      {p.tasks.length === 0 && <div className="empty">Відкритих справ немає</div>}
      {p.tasks.map((t) => (
        <TaskItem key={t.id} t={t} icon={findCat(dict, t.category)?.icon || 'task'} onOpen={onBack} />
      ))}

      <div className="section-label">Історія роботи</div>
      {p.history.length === 0 && <div className="empty">Записів ще немає</div>}
      {p.history.map((h, i) => {
        const cfg = HISTORY[h.type] || HISTORY.report
        return (
          <div className="entry" key={`${h.type}-${i}`}>
            <div className="top">
              <span className="label">{cfg.label}</span>
              <span className="time">{fmtTime(h.time)}</span>
            </div>
            <div className="text">
              {h.text}
              {h.type === 'expense' && h.amount ? ` · ${money(h.amount)}` : ''}
            </div>
          </div>
        )
      })}

      {/* доступи налаштовує лише власниця, і чужі — не свої */}
      {owner && p.role !== 'owner' && (
        <button className="btn-dashed" style={{ color: 'var(--orange)' }} onClick={() => setEditing(true)}>
          {Icons.gear(18)} Налаштувати доступ
        </button>
      )}
      {editing && (
        <MemberSheet m={p} rd={rd} onClose={() => setEditing(false)}
          onChanged={() => { setEditing(false); onBack() }} />
      )}
    </div>
  )
}
