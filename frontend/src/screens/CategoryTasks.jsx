import { useCallback, useState } from 'react'
import { get } from '../api'
import {
  Header, Icons, NewTaskModal, TaskSheet, colorVar, findCat, useDictionaries,
  useLiveSel, usePoll,
} from '../components'
import TaskItem from './TaskItem'
import { spravy } from './shared'

/* ---------- дрілдаун: власний розділ власниці ----------
   Один екран на будь-який розділ, доданий у Налаштуваннях → Категорії. */
export default function CategoryTasks({ catKey, onBack }) {
  const dict = useDictionaries()
  const cat = findCat(dict, catKey)
  const [tasks, setTasks] = useState(null)
  const [sel, setSel] = useState(null)
  const [adding, setAdding] = useState(false)
  const load = useCallback(
    () => get(`/api/tasks?category=${encodeURIComponent(catKey)}`).then(setTasks).catch(() => setTasks([])),
    [catKey],
  )
  usePoll(load)
  useLiveSel(tasks, sel, setSel)

  if (!tasks) return <div className="loading">Завантаження…</div>
  const color = colorVar(cat?.color)
  const open = tasks.filter((t) => t.status === 'open')
  const done = tasks.filter((t) => t.status === 'done')
  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>
      <Header icon={cat?.icon || 'task'} color={color} title={cat?.label || 'Категорія'} sub={spravy(open.length)} />
      <div className="section-label">Активні</div>
      {open.length === 0 && <div className="empty">Справ немає</div>}
      {open.map((t) => (
        <TaskItem key={t.id} t={t} icon={cat?.icon || 'task'} onOpen={() => setSel(t)} />
      ))}
      <button className="btn-dashed" style={{ color }} onClick={() => setAdding(true)}>
        {Icons.plus(18)} Додати справу
      </button>
      {done.length > 0 && <div className="section-label">Зроблено</div>}
      {done.slice(0, 5).map((t) => (
        <TaskItem key={t.id} t={t} icon={cat?.icon || 'task'} onOpen={() => setSel(t)} />
      ))}
      {adding && (
        <NewTaskModal defaultCategory={catKey} color={color} title={`Нова справа · ${cat?.label || ''}`}
          onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />
      )}
      {sel && (
        <TaskSheet t={sel} color={color} onClose={() => setSel(null)}
          onChanged={() => { setSel(null); load() }} />
      )}
    </div>
  )
}
