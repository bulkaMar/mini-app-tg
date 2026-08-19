import { useEffect, useState } from 'react'
import { get } from './api'
import { initTelegram } from './telegram'
import { Icons, useRoles } from './components'
import Workspace from './screens/Workspace'

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

  // Один екран на всіх: вкладки збираються з того, що людині відкрито (0.14)
  return <Workspace me={me} />
}
