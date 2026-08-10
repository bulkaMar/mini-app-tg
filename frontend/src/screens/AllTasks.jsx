/* Усі задачі з фільтрами: категорія · людина · дата · стан.
   Категорія, людина і стан звужують запит на сервері; дата — вже тут,
   бо «сьогодні» знає лише пристрій (дедлайн зберігається настінним часом). */
import { useCallback, useState } from 'react'
import { get } from '../api'
import {
  Header, Icons, ItemsBadge, NewTaskModal, PriorityMark, TaskFilters, TaskSheet,
  colorVar, findCat, fmtDue, fmtTime, isOverdue, matchesDue, taskQuery,
  useDictionaries, useLiveSel, usePoll,
} from '../components'

const STATUSES = [
  { value: 'open', label: 'В роботі' },
  { value: 'done', label: 'Виконані' },
  { value: '', label: 'Усі' },
]

export default function AllTasks({ onBack }) {
  const dict = useDictionaries()
  const [filters, setFilters] = useState({ status: 'open' })
  const [tasks, setTasks] = useState(null)
  const [sel, setSel] = useState(null)
  const [adding, setAdding] = useState(false)

  const qs = taskQuery(filters)
  const load = useCallback(
    () => get(`/api/tasks${qs}`).then(setTasks).catch(() => setTasks([])),
    [qs],
  )
  usePoll(load)
  useLiveSel(tasks, sel, setSel)

  if (!tasks) return <div className="loading">Завантаження…</div>
  const shown = tasks.filter((t) => matchesDue(t, filters.due))

  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>
      <Header icon="task" color="var(--orange)" title="Усі задачі"
        sub={`знайдено: ${shown.length}`} />

      <div className="seg">
        {STATUSES.map((st) => (
          <button key={st.value} type="button"
            className={`seg-btn ${(filters.status || '') === st.value ? 'on' : ''}`}
            style={(filters.status || '') === st.value
              ? { background: 'var(--orange)', borderColor: 'var(--orange)' } : undefined}
            onClick={() => setFilters({ ...filters, status: st.value })}>
            {st.label}
          </button>
        ))}
      </div>
      <TaskFilters value={filters} onChange={setFilters} />

      {shown.length === 0 && <div className="empty">За такими умовами нічого немає</div>}
      {shown.map((t) => {
        const cat = findCat(dict, t.category)
        const overdue = t.status !== 'done' && isOverdue(t.due)
        return (
          <button key={t.id} className={`item ${t.status === 'done' ? 'done' : ''}`}
            onClick={() => setSel(t)}>
            <span className={`dot ${t.status === 'done' ? 'ok' : overdue ? 'crit' : 'warn'}`} />
            <span className="ico" style={{ color: colorVar(cat?.color) }}>
              {Icons[cat?.icon]?.(19) || Icons.task(19)}
            </span>
            {t.status !== 'done' && <PriorityMark p={t.priority} />}
            <span className="grow">
              {t.text}
              <span className="row-sub">{cat?.label || t.category}</span>
            </span>
            <ItemsBadge t={t} />
            <span className={`tag ${t.status === 'done' ? 'ok' : overdue ? 'crit' : 'warn'}`}>
              {t.status === 'done'
                ? (t.done_at ? fmtTime(t.done_at) : 'готово')
                : t.due ? `до ${fmtDue(t.due)}` : 'без дати'}
            </span>
          </button>
        )
      })}

      <button className="btn-dashed" style={{ color: 'var(--orange)' }} onClick={() => setAdding(true)}>
        {Icons.plus(18)} Додати задачу
      </button>

      {adding && (
        <NewTaskModal canAssign defaultCategory={filters.category}
          onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />
      )}
      {sel && (
        <TaskSheet t={sel} onClose={() => setSel(null)}
          onChanged={() => { setSel(null); load() }} />
      )}
    </div>
  )
}
