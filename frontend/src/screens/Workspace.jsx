/* Один екран на всіх (0.14).

   Раніше було чотири захардкожені екрани — по одному на роль, — і в них
   намертво вшито, яку категорію показувати. Через це власна роль «Фотограф»
   бачила лише «Проєкти», навіть якщо їй відкрили «Рекламу».

   Тепер вкладки збираються з того, що людині відкрито:
   - по вкладці на кожну доступну категорію задач;
   - Фінанси, Тривоги, Потік, Команда — за тумблерами дозволів;
   - «Моє» є завжди: це особисті записи, їх не відбирають;
   - у власниці замість категорій-вкладок — Головна, звідки вона заходить
     у кожну категорію (інакше в неї було б дев'ять вкладок);
   - «Зміна» лишається тим, чия роль поводиться як водій.
*/
import { useEffect, useState } from 'react'
import { Dictate, NotificationBell, SwipeBack, TabBar, useDictionaries } from '../components'
import { buildTabs, isOwner } from '../tabs'

import AllTasks from './AllTasks'
import CategoryTasks from './CategoryTasks'
import Finance from './Finance'
import Flow from './Flow'
import Home from './Home'
import Mine from './Mine'
import Report from './Report'
import Risks from './Risks'
import Settings from './Settings'
import Shift from './Shift'
import Team from './Team'

export default function Workspace({ me }) {
  const dict = useDictionaries()
  const owner = isOwner(me)
  const tabs = buildTabs(me, dict)

  const [tab, setTab] = useState(tabs[0]?.key || 'mine')
  const [view, setView] = useState(null)   // дрілдаун власниці
  const [refreshKey, setRefreshKey] = useState(0)

  // вкладку могли закрити, поки людина в застосунку — не лишаємо її на порожньому
  useEffect(() => {
    if (tabs.length && !tabs.some((t) => t.key === tab)) setTab(tabs[0].key)
  }, [tabs, tab])

  const back = () => setView(null)
  const drilldown =
    view === 'settings' ? <Settings onBack={back} /> :
    view === 'alltasks' ? <AllTasks onBack={back} /> :
    view === 'risks' ? <Risks onBack={back} /> :
    view === 'money' ? <Finance me={me} onBack={back} /> :
    view ? <CategoryTasks catKey={view} onBack={back} /> :
    null

  const screen =
    drilldown ? <SwipeBack onBack={back}>{drilldown}</SwipeBack> :
    tab === 'home' ? <Home openView={setView} /> :
    tab === 'shift' ? <Shift me={me} /> :
    tab === 'risks' ? <Risks /> :
    tab === 'flow' ? <Flow me={me} /> :
    tab === 'money' ? <Finance me={me} /> :
    tab === 'team' ? <Team /> :
    tab === 'mine' ? <Mine /> :
    tab.startsWith('cat:') ? <CategoryTasks catKey={tab.slice(4)} /> :
    <Mine />

  return (
    <div className={`app ${owner ? 'with-dock' : ''}`}>
      <NotificationBell me={me} />
      <div className="app-scroll">
        <div key={refreshKey}>{screen}</div>
      </div>
      {/* диктовка — інструмент роздачі задач, він лише у власниці.
          Решта надсилає записи кнопкою «Звіт» у Потоці. */}
      {owner && (
        <div className="dictate-dock">
          <Dictate onSaved={() => setRefreshKey((k) => k + 1)} />
        </div>
      )}
      <TabBar
        tabs={tabs}
        active={view ? '' : tab}
        onChange={(k) => { setView(null); setTab(k) }}
      />
    </div>
  )
}
