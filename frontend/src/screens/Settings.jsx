/* Налаштування власниці: один вхід із Головної, усередині підрозділи.
   Назад із підрозділу веде сюди, а не одразу на Головну. */
import { useState } from 'react'
import { Header, Icons } from '../components'
import Categories from './Categories'
import Priorities from './Priorities'
import Roles from './Roles'

const SECTIONS = [
  { key: 'priorities', icon: 'flame', title: 'Важливість', sub: 'рівні терміновості справ' },
  { key: 'categories', icon: 'task', title: 'Категорії', sub: 'куди складаються справи' },
  { key: 'roles', icon: 'shield', title: 'Ролі', sub: 'хто буває в команді' },
]

export default function Settings({ onBack }) {
  const [sub, setSub] = useState(null)
  const back = () => setSub(null)

  if (sub === 'priorities') return <Priorities onBack={back} />
  if (sub === 'categories') return <Categories onBack={back} />
  if (sub === 'roles') return <Roles onBack={back} />

  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>
      <Header icon="gear" color="var(--orange)" title="Налаштування"
        sub="з чого збирається застосунок" />

      {SECTIONS.map((s) => (
        <button key={s.key} className="nav-row" onClick={() => setSub(s.key)}>
          <span className="ico">{Icons[s.icon](20)}</span>
          <span className="grow">
            {s.title}
            <span className="row-sub">{s.sub}</span>
          </span>
          <span className="chev">›</span>
        </button>
      ))}
    </div>
  )
}
