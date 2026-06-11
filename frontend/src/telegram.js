// Тонка обгортка над Telegram WebApp API
export const tg = window.Telegram?.WebApp ?? null

export function initTelegram() {
  if (!tg) return
  tg.ready()
  tg.expand()
  try {
    tg.setHeaderColor('#f2efe8')
    tg.setBackgroundColor('#f2efe8')
  } catch {
    /* старі клієнти */
  }
}

export function getInitData() {
  return tg?.initData || ''
}

export function haptic(type = 'light') {
  try {
    tg?.HapticFeedback?.impactOccurred(type)
  } catch {
    /* ok */
  }
}
