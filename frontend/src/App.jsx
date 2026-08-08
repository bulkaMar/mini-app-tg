import { useEffect, useState } from 'react'
import { get } from './api'
import { initTelegram } from './telegram'
import { Icons, useRoles } from './components'
import Owner from './screens/Owner'
import Manager from './screens/Manager'
import Assistant from './screens/Assistant'
import Driver from './screens/Driver'

export default function App() {
  const [me, setMe] = useState(null)
  const [error, setError] = useState(null)
  useRoles() // тримаємо довідник ролей завантаженим для всього застосунку

  useEffect(() => {
    initTelegram()
    get('/api/me').then(setMe).catch((e) => setError(e.message))
  }, [])

  if (error) {
    return (
      <div className="app" style={{ justifyContent: 'center' }}>
        <div className="screen" style={{ textAlign: 'center', gap: 8 }}>
          <div style={{ color: 'var(--red)', display: 'flex', justifyContent: 'center' }}>{Icons.alert(44)}</div>
          <h1 style={{ fontSize: 20 }}>Немає доступу</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            {error}. Відкрий додаток через бота в Telegram або попроси власника додати тебе в команду.
          </p>
        </div>
      </div>
    )
  }

  if (!me) return <div className="loading" style={{ paddingTop: '40vh' }}>Завантаження…</div>

  // Роутинг за «поводиться як»: у власної ролі («Фотограф») своя назва й колір,
  // але екран — один із чотирьох базових, поки немає тумблерів розділів (0.5–0.7).
  switch (me.base || me.role) {
    case 'owner': return <Owner me={me} />
    case 'manager': return <Manager me={me} />
    case 'assistant': return <Assistant me={me} />
    case 'driver': return <Driver me={me} />
    default: return <Assistant me={me} />
  }
}
