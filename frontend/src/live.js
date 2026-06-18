// Живі оновлення через SSE: одне спільне зʼєднання EventSource на весь застосунок.
// Сервер пушить подію `change`, коли в БД щось змінилось — підписники перезавантажують свої дані.
import { getInitData } from './telegram'

const BASE = import.meta.env.VITE_API_URL || ''
const subs = new Set()
let es = null
let retry = null

function open() {
  if (es || typeof EventSource === 'undefined') return
  const initData = getInitData()
  // initData у query, бо EventSource не вміє слати кастомні заголовки
  const qs = initData ? `?auth=${encodeURIComponent(initData)}` : ''
  try {
    es = new EventSource(BASE + '/api/events' + qs)
  } catch {
    return
  }
  es.addEventListener('change', () => {
    subs.forEach((fn) => { try { fn() } catch { /* ok */ } })
  })
  es.onerror = () => {
    // EventSource перепідключається сам; якщо зовсім закрилось — пробуємо заново через 3с
    if (es && es.readyState === 2) {
      es = null
      clearTimeout(retry)
      if (subs.size) retry = setTimeout(open, 3000)
    }
  }
}

// Підписатися на живі зміни. Повертає функцію відписки.
export function onLiveChange(fn) {
  subs.add(fn)
  open()
  return () => {
    subs.delete(fn)
    if (subs.size === 0 && es) { es.close(); es = null; clearTimeout(retry) }
  }
}
