/* Дрібниці, якими користуються кілька екранів. */
import { colorVar, findRole } from '../components'

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
