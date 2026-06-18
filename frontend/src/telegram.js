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
  // вимикаємо вертикальний свайп Telegram (свайп вниз = згорнути апку),
  // щоб видалення сповіщень/жести не закривали Mini App випадково
  try {
    tg.disableVerticalSwipes?.()
  } catch {
    /* старі клієнти (до Bot API 7.7) */
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
