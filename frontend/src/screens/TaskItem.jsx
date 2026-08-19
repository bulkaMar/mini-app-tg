import { Icons, ItemsBadge, PriorityMark, fmtDue, fmtTime, isOverdue } from '../components'

/* ---------- спільне для задач ---------- */
export default function TaskItem({ t, icon, onOpen }) {
  const overdue = isOverdue(t.due)
  return (
    <button className={`item ${t.status === 'done' ? 'done' : ''}`} onClick={onOpen}>
      <span className={`dot ${t.status === 'done' ? 'ok' : overdue ? 'crit' : 'warn'}`} />
      <span className="ico">{Icons[icon]?.(19)}</span>
      {t.status !== 'done' && <PriorityMark p={t.priority} />}
      <span className="grow">{t.text}</span>
      <ItemsBadge t={t} />
      <span className={`tag ${t.status === 'done' ? 'ok' : overdue ? 'crit' : 'warn'}`}>
        {t.status === 'done' ? (t.done_at ? fmtTime(t.done_at) : 'готово') : overdue ? 'терміново' : t.due ? `до ${fmtDue(t.due)}` : 'сьогодні'}
      </span>
      <span className="ico" style={{ color: 'var(--muted)' }}>{Icons.pencil(15)}</span>
    </button>
  )
}
