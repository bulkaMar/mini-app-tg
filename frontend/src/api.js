import { getInitData } from './telegram'
import { mockResponse } from './mock'

const BASE = import.meta.env.VITE_API_URL || ''
// у браузері без Telegram роль для дев-режиму береться з ?role= (бек має DEV_AUTH=true)
const devRole = new URLSearchParams(location.search).get('role') || 'owner'

export async function api(path, options = {}) {
  const initData = getInitData()
  const headers = {
    ...(initData ? { Authorization: `tma ${initData}` } : { 'X-Dev-Role': devRole }),
    ...(options.body && !(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...options.headers,
  }
  let res
  try {
    res = await fetch(BASE + path, { ...options, headers })
  } catch (err) {
    // бек не запущений → у дев-режимі показуємо мок-дані (тільки коли немає звʼязку,
    // справжні помилки бекенда (4xx/5xx) НЕ маскуємо)
    if (import.meta.env.DEV && !initData) {
      console.warn(`[mock] ${path}: ${err.message}`)
      return mockResponse(path)
    }
    throw new Error('Немає звʼязку з сервером')
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export const get = (path) => api(path)
export const post = (path, body) =>
  api(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) })
export const patch = (path, body) => api(path, { method: 'PATCH', body: JSON.stringify(body) })
export const put = (path, body) => api(path, { method: 'PUT', body: JSON.stringify(body) })
