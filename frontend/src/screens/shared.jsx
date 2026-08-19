/* Дрібниці, якими користуються кілька екранів. */
import { Icons, colorVar, findRole } from '../components'
import { openTelegram } from '../telegram'

// українське відмінювання: 1 справа · 3 справи · 8 справ
const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100
  if (a === 1 && b !== 11) return one
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few
  return many
}
export const spravy = (n) => `${n} ${plural(n, 'справа', 'справи', 'справ')}`
export const aktyvni = (n) => `${n} ${plural(n, 'активна', 'активні', 'активних')}`
export const poyizdky = (n) => `${n} ${plural(n, 'поїздка', 'поїздки', 'поїздок')}`

// ім'я активного учасника певної ролі (перше слово)
export const memberName = (team, role) => {
  const u = (team || []).find((m) => m.role === role && m.status === 'active')
  return u && u.name ? u.name.split(' ')[0] : ''
}
// колір ролі з довідника
export const roleColor = (rd, key) => colorVar(findRole(rd, key)?.color || 'muted')
// підпис «хто додав» (роль · ім'я)
export const authorLabel = (rd, role, team) => {
  const word = findRole(rd, role)?.label || role
  const n = memberName(team, role)
  return n ? `${word} · ${n}` : word
}

/* Зв'язок із людиною (6.4). Своїх дзвінків і чатів не робимо — переходимо
   туди, де вже спілкуються. Телефон саме посиланням `tel:`: це єдине, що
   надійно спрацьовує у вебвʼю Telegram і віддає номер системному дзвінку. */
export function CallRow({ phone, username }) {
  if (!phone && !username) return null
  return (
    <div className="call-row">
      {username && (
        <button type="button" className="btn-small" onClick={() => openTelegram(username)}>
          {Icons.send(15)} Написати
        </button>
      )}
      {phone && (
        <a className="btn-small" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
          {Icons.phone(15)} Подзвонити
        </a>
      )}
    </div>
  )
}
