/* Розділ «Люди» (Етап 6) — колишня «Команда».

   Два списки під одним заголовком:
   - **Команда** — ті, хто заходить у застосунок: роль, доступи, строк;
   - **Контакти** — записник тих, хто не заходить (гример, оренда світла).

   Розділені навмисно: контакт не має ролі й дозволів, тож не може випадково
   опинитись серед тих, кому щось відкрито. Тап по людині відкриває її картку.

   Ключ дозволу лишився «team» — щоб уже налаштовані тумблери не злетіли. */
import { useState } from 'react'
import { CenterModal, Header, Icons, SwipeBack } from '../components'
import { isOwner } from '../tabs'
import Contacts from './Contacts'
import Person from './Person'
import Team from './Team'
import { CallRow } from './shared'

const GROUPS = [
  { key: 'team', label: 'Команда', icon: 'shield', sub: 'заходять у застосунок' },
  { key: 'contacts', label: 'Контакти', icon: 'phone', sub: 'записник без доступу' },
]

export default function People({ me }) {
  const [group, setGroup] = useState('team')
  const [personId, setPersonId] = useState(null)  // повна картка
  const [peek, setPeek] = useState(null)          // чужа картка очима не власниці
  const owner = isOwner(me)
  const cfg = GROUPS.find((g) => g.key === group)

  /* Повну картку (задачі, історія) відкриває власниця — і кожен свою власну.
     Чужу людині показуємо коротко: як звати, ким працює, як зв'язатись.
     Так само вирішує й сервер, тут ми просто не ведемо в глухий кут. */
  const openMember = (m) => {
    if (owner || m.id === me?.id) setPersonId(m.id)
    else setPeek(m)
  }

  if (personId) {
    return (
      <SwipeBack onBack={() => setPersonId(null)}>
        <Person id={personId} owner={owner} onBack={() => setPersonId(null)} />
      </SwipeBack>
    )
  }

  return (
    <div className="screen">
      <Header icon="users" color="var(--orange)" title="Люди" sub={cfg.sub} />

      <div className="seg">
        {GROUPS.map((g) => (
          <button key={g.key} type="button" className={`seg-btn ${group === g.key ? 'on' : ''}`}
            style={group === g.key ? { background: 'var(--orange)', borderColor: 'var(--orange)' } : undefined}
            onClick={() => setGroup(g.key)}>
            {Icons[g.icon](15)} {g.label}
          </button>
        ))}
      </div>

      {group === 'team'
        ? <Team owner={owner} onOpen={openMember} />
        : <Contacts owner={owner} />}

      {peek && (
        <CenterModal title={peek.name || `@${peek.username}`}
          sub={peek.role_label || peek.role} onClose={() => setPeek(null)}>
          <CallRow phone={peek.phone} username={peek.username} />
          {!peek.phone && !peek.username && <div className="empty">Зв'язатись нічим</div>}
        </CenterModal>
      )}
    </div>
  )
}
