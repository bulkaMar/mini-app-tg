/* Які вкладки бачить конкретна людина (0.14).

   Винесено окремо від екрана навмисно: це чиста логіка без React, тож її
   можна прогнати тестом на справжніх відповідях сервера — саме тут
   вирішується, хто що бачить, і мовчазна помилка була б непомітною.

   Правила:
   - «Моє» є завжди: особисті записи не відбирають;
   - категорії стають вкладками в усіх, крім власниці — у неї їх список
     і так на Головній, інакше було б девʼять вкладок;
   - решта розділів — за тумблерами дозволів;
   - «Зміна» лишається тим, чия роль поводиться як водій.
*/

export const baseOf = (me) => me?.base || me?.role || 'assistant'
export const isOwner = (me) => baseOf(me) === 'owner'
const opened = (me, section) => (me?.sections?.[section] || 'full') !== 'none'

export function buildTabs(me, dict) {
  const owner = isOwner(me)
  const tabs = []

  if (owner) tabs.push({ key: 'home', icon: 'pulse', label: 'Головна' })
  if (baseOf(me) === 'driver') tabs.push({ key: 'shift', icon: 'truck', label: 'Зміна' })

  if (!owner && opened(me, 'tasks')) {
    for (const c of dict?.categories || []) {
      if (c.can_use) tabs.push({ key: `cat:${c.key}`, icon: c.icon, label: c.label })
    }
  }

  if (opened(me, 'risks')) tabs.push({ key: 'risks', icon: 'alert', label: 'Тривоги' })
  if (opened(me, 'feed')) tabs.push({ key: 'flow', icon: 'inbox', label: 'Потік' })
  if (opened(me, 'finance')) tabs.push({ key: 'money', icon: 'wallet', label: 'Фінанси' })
  tabs.push({ key: 'mine', icon: 'note', label: 'Моє' })
  if (opened(me, 'team')) tabs.push({ key: 'team', icon: 'shield', label: 'Команда' })

  return tabs
}
