import { useCallback, useState } from 'react'
import { get, patch, post } from '../api'
import {
  CenterModal, ConfirmDialog, Field, Header, Icons, Segmented, assignableRoles,
  colorVar, findRole, useRoles, useSheets, usePoll, useToast,
} from '../components'
import { roleColor } from './shared'

const EMPLOYMENT = [
  { value: 'permanent', label: 'Постійний' },
  { value: 'temporary', label: 'Тимчасовий' },
]
const FINANCE_SCOPE = [
  { value: 'all', label: 'Усі листи' },
  { value: 'sheets', label: 'Вибрані' },
]
// розділи застосунку, які можна відкривати чи закривати по кожній людині.
// «Тільки список» пропонуємо лише там, де є що ховати — зведення й суми.
const APP_SECTIONS = [
  { key: 'tasks', label: 'Задачі', hint: 'списки справ' },
  { key: 'finance', label: 'Фінанси', hint: 'витрати й бюджет', hasSummary: true },
  { key: 'risks', label: 'Тривоги', hint: 'проблеми, що горять' },
  { key: 'feed', label: 'Потік', hint: 'стрічка надходжень' },
  { key: 'team', label: 'Команда', hint: 'список людей' },
]
const STATE_FULL = [
  { value: 'full', label: 'Повний' },
  { value: 'list', label: 'Тільки список' },
  { value: 'none', label: 'Закрито' },
]
const STATE_SIMPLE = [
  { value: 'full', label: 'Відкрито' },
  { value: 'none', label: 'Закрито' },
]

const ACCESS_PERIODS = [
  { value: 0, label: 'Безстроково' },
  { value: 12, label: '12 годин' },
  { value: 24, label: 'Доба' },
  { value: 72, label: '3 доби' },
  { value: 168, label: 'Тиждень' },
]
// «до 12.08, 14:30» для підпису в списку команди
const untilLabel = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p2 = (n) => String(n).padStart(2, '0')
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}, ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/* Зайнятість + які листи витрат людині відкриті. Використовується і при
   додаванні, і при редагуванні учасника. */
function AccessFields({
  employment, setEmployment, scope, setScope, picked, setPicked, hours, setHours, until,
  sections, setSections, fields, setFields,
}) {
  const { sheets } = useSheets()
  const toggle = (id) =>
    setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])

  return (
    <>
      <Field label="Зайнятість">
        <Segmented options={EMPLOYMENT} value={employment} onChange={setEmployment} />
        <div className="due-hint">
          {employment === 'temporary'
            ? 'Бачитиме лише те, що зʼявиться з дня, коли ви його додали'
            : 'Бачитиме відкриті листи цілком, разом зі старими записами'}
        </div>
      </Field>
      <Field label="Строк доступу">
        <Segmented options={ACCESS_PERIODS} value={hours} onChange={setHours} />
        <div className="due-hint">
          {hours === 0
            ? 'Вхід працює, доки ви самі не приберете людину'
            : until
              ? `Зараз вхід діє до ${untilLabel(until)}. Новий строк почнеться від моменту збереження`
              : 'Відлік почнеться від моменту збереження, потім вхід анулюється сам'}
        </div>
      </Field>
      <Field label="Що людина бачить">
        <div className="perm-list">
          {APP_SECTIONS.map((sec) => (
            <div className="perm-row" key={sec.key}>
              <div className="perm-name">
                {sec.label}
                <span className="row-sub">{sec.hint}</span>
              </div>
              <Segmented
                options={sec.hasSummary ? STATE_FULL : STATE_SIMPLE}
                value={sections[sec.key] || 'full'}
                onChange={(v) => setSections({ ...sections, [sec.key]: v })} />
            </div>
          ))}
        </div>
        <div className="due-hint">
          «Тільки список» — видно самі записи, без бюджету, відсотків і діаграми.
        </div>
      </Field>
      <Field label="Окремі поля">
        <Segmented
          options={[{ value: 'yes', label: 'Суми видно' }, { value: 'no', label: 'Суми приховані' }]}
          value={fields.amounts === false ? 'no' : 'yes'}
          onChange={(v) => setFields({ ...fields, amounts: v === 'yes' })} />
        <div className="due-hint">
          Приховані суми: людина бачить, що куплено, але не бачить, за скільки.
        </div>
      </Field>
      <Field label="Доступ до фінансів">
        <Segmented options={FINANCE_SCOPE} value={scope} onChange={setScope} />
      </Field>
      {scope === 'sheets' && (
        <Field label="Які саме листи">
          <div className="seg">
            {sheets.map((sh) => (
              <button key={sh.id} type="button"
                className={`seg-btn ${picked.includes(sh.id) ? 'on' : ''}`}
                style={picked.includes(sh.id)
                  ? { background: 'var(--orange)', borderColor: 'var(--orange)' } : undefined}
                onClick={() => toggle(sh.id)}>
                {sh.name}
              </button>
            ))}
          </div>
          {picked.length === 0 && <div className="due-hint">Не обрано жодного — фінансів не побачить</div>}
        </Field>
      )}
    </>
  )
}


/* ---------- Команда ---------- */
export default function Team() {
  const [team, setTeam] = useState(null)
  const [adding, setAdding] = useState(false)
  const [sel, setSel] = useState(null) // вибраний учасник → редагування
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('manager')
  const [employment, setEmployment] = useState('permanent')
  const [scope, setScope] = useState('all')
  const [picked, setPicked] = useState([])
  const [hours, setHours] = useState(0)
  const [sections, setSections] = useState({})
  const [fields, setFields] = useState({})
  const [toast, showToast] = useToast()

  const rd = useRoles()
  const load = useCallback(() => get('/api/team').then(setTeam).catch(() => setTeam([])), [])
  usePoll(load)

  const invite = async () => {
    if (!username.trim()) return
    try {
      await post('/api/team', {
        username: username.trim(), name: name.trim(), role,
        employment, finance_scope: scope, finance_sheets: picked, access_hours: hours,
        sections, fields,
      })
      setAdding(false); setUsername(''); setName('')
      showToast('Запрошення надіслано', 'ok')
      load()
    } catch (e) { showToast(e.message, 'warn') }
  }

  if (!team) return <div className="loading">Завантаження…</div>
  const initials = (n) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  // ролі, яких ще немає в команді — зайняту роль у дропдауні не пропонуємо
  const used = new Set(team.map((m) => m.role))
  const freeRoles = assignableRoles(rd)
    .filter((r) => !used.has(r.key))
    .map((r) => ({ value: r.key, label: r.label }))
  const openAdd = () => {
    setRole(freeRoles[0]?.value || ''); setUsername(''); setName('')
    setEmployment('permanent'); setScope('all'); setPicked([]); setHours(0)
    setSections({}); setFields({})
    setAdding(true)
  }
  const canInvite = username.trim() && name.trim() // кнопка активна лише коли заповнені поля

  return (
    <div className="screen">
      <Header icon="shield" color="var(--orange)" title="Команда" sub={`${team.length} учасники`} />
      <div className="card" style={{ padding: '2px 14px' }}>
        {team.map((m) => (
          <div key={m.id} className={`member ${m.status === 'invited' ? 'invited' : ''}`}
            role={m.role === 'owner' ? undefined : 'button'} tabIndex={m.role === 'owner' ? undefined : 0}
            style={m.role === 'owner' ? undefined : { cursor: 'pointer' }}
            onClick={m.role === 'owner' ? undefined : () => setSel(m)}>
            <div className="avatar" style={{ background: m.status === 'invited' ? '#d9c79a' : roleColor(rd, m.role) }}>
              {m.role === 'owner' ? 'Я' : initials(m.name || m.username || '?')}
            </div>
            <div className="info">
              <div className="name">{m.name || `@${m.username}`}</div>
              <div className="uname">
                {m.status === 'invited' ? 'запрошення надіслано' : m.role === 'owner' ? 'повний доступ' : m.username ? `@${m.username}` : ''}
                {m.employment === 'temporary' && ' · тимчасовий'}
                {m.access_expired
                  ? ' · доступ закінчився'
                  : m.access_until ? ` · до ${untilLabel(m.access_until)}` : ''}
              </div>
            </div>
            <span className={`badge ${m.status === 'invited' ? 'outline' : ''}`}
              style={{
                background: m.status === 'invited' ? 'transparent' : roleColor(rd, m.role),
                color: m.status === 'invited' ? roleColor(rd, m.role) : '#fff',
              }}>
              {(m.role_label || m.role).toUpperCase()}
            </span>
            {m.role !== 'owner' && (
              <span className="ico" style={{ color: 'var(--muted)', display: 'flex' }}>{Icons.pencil(15)}</span>
            )}
          </div>
        ))}
      </div>
      {freeRoles.length > 0 ? (
        <button className="btn-dashed" style={{ color: 'var(--orange)' }} onClick={openAdd}>
          {Icons.addUser(20)} Додати учасника
        </button>
      ) : (
        <div className="empty">Усі ролі зайняті — видали учасника, щоб додати іншого</div>
      )}

      {adding && (
        <CenterModal title="Новий учасник" sub={(findRole(rd, role)?.label || '').toUpperCase()}
          onClose={() => setAdding(false)}>
          <input placeholder="@username у Telegram" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input placeholder="Ім'я (як показувати)" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {freeRoles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <AccessFields employment={employment} setEmployment={setEmployment}
            scope={scope} setScope={setScope} picked={picked} setPicked={setPicked}
            hours={hours} setHours={setHours}
            sections={sections} setSections={setSections}
            fields={fields} setFields={setFields} />
          <button className="btn-primary" style={{ background: 'var(--orange)', opacity: canInvite ? 1 : 0.45 }}
            disabled={!canInvite} onClick={invite}>
            Додати учасника
          </button>
        </CenterModal>
      )}
      {sel && (
        <MemberSheet m={sel} rd={rd} onClose={() => setSel(null)}
          onChanged={() => { setSel(null); load() }} />
      )}
      {toast}
    </div>
  )
}

/* ---------- редагування учасника ---------- */
function MemberSheet({ m, rd, onClose, onChanged }) {
  const fin = (m.permissions || {}).finance || {}
  const [name, setName] = useState(m.name || '')
  const [username, setUsername] = useState(m.username || '')
  const [role, setRole] = useState(m.role)
  const [employment, setEmployment] = useState(m.employment || 'permanent')
  const [scope, setScope] = useState(fin.scope || 'all')
  const [picked, setPicked] = useState(fin.sheets || [])
  const [hours, setHours] = useState(0)   // 0 = не чіпати наявний строк
  const [sections, setSections] = useState(m.sections || {})
  const [fields, setFields] = useState(m.fields || {})
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [toast, showToast] = useToast()
  const changed =
    name.trim() !== (m.name || '') ||
    username.trim().replace(/^@/, '') !== (m.username || '') ||
    role !== m.role ||
    employment !== (m.employment || 'permanent') ||
    scope !== (fin.scope || 'all') ||
    JSON.stringify([...picked].sort()) !== JSON.stringify([...(fin.sheets || [])].sort()) ||
    hours !== 0 ||
    JSON.stringify(sections) !== JSON.stringify(m.sections || {}) ||
    JSON.stringify(fields) !== JSON.stringify(m.fields || {})

  const save = async (extra = {}) => {
    if (busy) return
    setBusy(true)
    try {
      await patch(`/api/team/${m.id}`, {
        name: name.trim(), username: username.trim(), role,
        employment, finance_scope: scope, finance_sheets: picked, sections, fields,
        ...(hours !== 0 ? { access_hours: hours } : {}), ...extra,
      })
      onChanged()
    } catch (e) { showToast(e.message, 'warn') } finally { setBusy(false) }
  }

  return (
    <CenterModal
      title={m.name || `@${m.username}`}
      sub={`${(findRole(rd, role)?.label || role).toUpperCase()}${m.status === 'invited' ? ' · запрошення' : ''}`}
      onClose={onClose}
    >
      <input placeholder="Ім'я (як показувати)" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="@username у Telegram" value={username} onChange={(e) => setUsername(e.target.value)} />
      <select value={role} onChange={(e) => setRole(e.target.value)}>
        {assignableRoles(rd).map((r) => (
          <option key={r.key} value={r.key}>{r.label}</option>
        ))}
      </select>
      <AccessFields employment={employment} setEmployment={setEmployment}
        scope={scope} setScope={setScope} picked={picked} setPicked={setPicked}
        hours={hours} setHours={setHours} until={m.access_until}
        sections={sections} setSections={setSections}
        fields={fields} setFields={setFields} />
      {m.access_expired && (
        <div className="preview-meta" style={{ color: 'var(--red)' }}>
          Строк доступу вичерпано — людина зараз не заходить. Оберіть новий строк,
          щоб відкрити знову.
        </div>
      )}
      <button className="btn-primary" style={{ background: 'var(--orange)', opacity: changed ? 1 : 0.45 }}
        disabled={busy || !changed} onClick={() => save()}>
        {busy ? 'Зберігаю…' : 'Зберегти зміни'}
      </button>
      <button className="btn-small ghost danger" onClick={() => setConfirmDel(true)} disabled={busy}>
        {Icons.trash(15)} Видалити з команди
      </button>
      {confirmDel && (
        <ConfirmDialog text="Впевнені, що видалити?"
          onYes={() => { setConfirmDel(false); save({ deleted: true }) }}
          onNo={() => setConfirmDel(false)} />
      )}
      {toast}
    </CenterModal>
  )
}
