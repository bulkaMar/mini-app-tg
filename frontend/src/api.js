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
  try {
    const res = await fetch(BASE + path, { ...options, headers })
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}))
      throw new Error(detail.detail || `HTTP ${res.status}`)
    }
    return res.json()
  } catch (err) {
    // бек не запущений або DEV_AUTH вимкнено → у дев-режимі показуємо мок-дані
    if (import.meta.env.DEV && !initData) {
      console.warn(`[mock] ${path}: ${err.message}`)
      return mockResponse(path)
    }
    throw err
  }
}

export const get = (path) => api(path)
export const post = (path, body) =>
  api(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) })
export const patch = (path, body) => api(path, { method: 'PATCH', body: JSON.stringify(body) })
