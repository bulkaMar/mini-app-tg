import { useCallback, useEffect, useState } from 'react'
import { get, post, put } from '../api'
import {
  ALL_SHEETS, CenterModal, DonutChart, ExpenseSheet, Header, Icons, Meter,
  MoneyInput, NoSheets, SheetPicker, SheetsModal, colorVar, money, seesAmounts,
  seesSummary, useLiveSel, usePoll, useRoles, useSheetSelection, useToast,
} from '../components'
import { authorLabel } from './shared'

/* ---------- Фінанси ---------- */
export default function Finance({ me, onBack }) {
  const [m, setM] = useState(null)
  const [team, setTeam] = useState([])
  const [adding, setAdding] = useState(false)
  const [sel, setSel] = useState(null) // вибрана витрата → шторка з коментарем
  const [editBudget, setEditBudget] = useState(false)
  const [manageSheets, setManageSheets] = useState(false)
  const [text, setText] = useState('')
  const [amount, setAmount] = useState('')
  const [toast, showToast] = useToast()
  const [sheet, setSheet, sheets, noSheets] = useSheetSelection()
  const rd = useRoles()
  const allSheets = sheet === ALL_SHEETS
  // зведення й суми — за дозволами; сервер їх однаково не віддасть, тут лише не малюємо
  const summary = seesSummary(me, 'finance') && m?.summary !== false
  const showAmounts = seesAmounts(me) && m?.amounts !== false

  const load = useCallback(() => {
    if (!sheet) return
    get(`/api/money?sheet=${sheet}`).then(setM).catch(() => {})
    get('/api/team').then(setTeam).catch(() => {})
  }, [sheet])
  usePoll(load)
  useLiveSel(m?.expenses, sel, setSel) // відкрита витрата оновлюється наживо

  const addExpense = async () => {
    if (!text.trim() || !amount) return
    try {
      // у режимі «усі листи» витрата йде в загальний
      const target = allSheets ? (sheets.find((s) => s.is_general) || sheets[0]) : null
      await post('/api/money', {
        text: text.trim(), amount: Number(amount),
        sheet_id: allSheets ? target?.id : Number(sheet),
      })
      setAdding(false); setText(''); setAmount('')
      load()
    } catch (e) { showToast(e.message, 'warn') }
  }

  const approve = async (id) => {
    try { await post(`/api/money/${id}/approve`); load() } catch (e) { showToast(e.message, 'warn') }
  }

  if (noSheets) return <NoSheets onBack={onBack} />
  if (!m) return <div className="loading">Завантаження…</div>
  const monthName = new Date().toLocaleDateString('uk-UA', { month: 'long' })

  // діаграма: в одному листі ділимо за напрямом, у режимі «усі листи» — за листами
  const AREA = { manager: ['Проєкти', 'var(--blue)'], assistant: ['Побут', 'var(--green)'], driver: ['Логістика', 'var(--gold)'], owner: ['Інше', 'var(--orange)'] }
  const SHEET_COLORS = ['var(--orange)', 'var(--blue)', 'var(--green)', 'var(--gold)', 'var(--red)', 'var(--ink)']
  const bucket = {}
  ;(m.expenses || []).forEach((e) => {
    const key = allSheets ? e.sheet_id : e.owner_role
    bucket[key] = (bucket[key] || 0) + (e.amount || 0)
  })
  const donutData = Object.entries(bucket)
    .filter(([, v]) => v > 0)
    .map(([key, v], i) => {
      if (allSheets) {
        const s = sheets.find((x) => String(x.id) === String(key))
        return { label: s?.name || 'Без листа', color: SHEET_COLORS[i % SHEET_COLORS.length], value: Math.round(v) }
      }
      return { label: (AREA[key] || [key])[0], color: (AREA[key] || [key, 'var(--muted)'])[1], value: Math.round(v) }
    })
    .sort((a, b) => b.value - a.value)
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0)

  return (
    <div className="screen">
      {onBack && <button className="back-btn" onClick={onBack}>{Icons.back(16)} Назад</button>}
      <Header icon="wallet" color="var(--orange)" title="Фінанси" sub={monthName} />
      <SheetPicker value={sheet} onChange={setSheet} onManage={() => setManageSheets(true)} />
      {summary && (
        <>
          <div className="stat-grid">
            <div className="stat"><div className="num">{m.spent.toLocaleString('uk-UA')} <small>₴</small></div><div className="lbl">витрачено</div></div>
            <div className="stat"><div className="num">{m.budget_pct}<small>%</small></div><div className="lbl">бюджету</div></div>
          </div>
          <Meter title={allSheets ? 'Бюджет усіх листів' : 'Бюджет місяця'}
            value={`${Math.round(m.budget).toLocaleString('uk-UA')} ₴ · ${m.budget_pct}%`}
            pct={m.budget_pct} level={m.budget_pct > 100 ? 'high' : m.budget_pct >= 80 ? 'med' : 'low'}
            onEdit={allSheets ? undefined : () => setEditBudget(true)} />
        </>
      )}
      {summary && donutData.length > 0 && (
        <div className="card">
          <div className="donut-title">{allSheets ? 'Як розкладено по листах' : 'На що йдуть гроші'}</div>
          <DonutChart data={donutData} centerValue={`${donutTotal.toLocaleString('uk-UA')} ₴`} centerCap="всього" />
        </div>
      )}
      <button className="btn-primary" style={{ background: 'var(--orange)' }} onClick={() => setAdding(true)}>
        {Icons.plus(20)} Додати витрату
      </button>

      <div className="section-label">Останні витрати</div>
      {m.expenses.length === 0 && <div className="empty">Витрат ще немає</div>}
      {m.expenses.map((e) => (
        <div key={e.id} className="item" role="button" tabIndex={0} onClick={() => setSel(e)}>
          <span className={`dot ${e.approved ? 'ok' : 'warn'}`} />
          <span className="ico">{e.owner_role === 'driver' ? Icons.fuel(19) : e.owner_role === 'assistant' ? Icons.cart(19) : Icons.film(19)}</span>
          <span className="grow">
            {e.text || 'Витрата'}
            <span className="row-sub">{authorLabel(rd, e.owner_role, team)}</span>
            {e.comment && <span className="comment-line">{Icons.comment(13)} {e.comment}</span>}
          </span>
          <span className="amount">{showAmounts ? money(e.amount) : '—'}</span>
          {!e.approved && m.can_approve && (
            <button className="btn-confirm" aria-label="Підтвердити"
              onClick={(ev) => { ev.stopPropagation(); approve(e.id) }}>
              {Icons.check(16)}
            </button>
          )}
          <button className="btn-icon" aria-label="Редагувати"
            onClick={(ev) => { ev.stopPropagation(); setSel(e) }}>
            {Icons.pencil(16)}
          </button>
        </div>
      ))}

      {adding && (
        <CenterModal title="Нова витрата" onClose={() => setAdding(false)}>
          <input placeholder="На що (напр. Оренда обладнання)" value={text} onChange={(e) => setText(e.target.value)} />
          <MoneyInput value={amount} onChange={setAmount} placeholder="Сума" />
          <button className="btn-primary"
            style={{ background: 'var(--orange)', opacity: text.trim() && Number(amount) > 0 ? 1 : 0.45 }}
            disabled={!text.trim() || !(Number(amount) > 0)}
            onClick={addExpense}>
            Зберегти
          </button>
        </CenterModal>
      )}
      {sel && (
        <ExpenseSheet e={sel} canApprove={m.can_approve} onClose={() => setSel(null)}
          onChanged={() => { setSel(null); load() }} />
      )}
      {editBudget && (
        <BudgetSheet sheet={sheet} onClose={() => setEditBudget(false)}
          onSaved={() => { setEditBudget(false); load() }} />
      )}
      {manageSheets && (
        <SheetsModal onClose={() => { setManageSheets(false); load() }} />
      )}
      {toast}
    </div>
  )
}

/* ---------- бюджет місяця: секції «на що + сума» ---------- */
function BudgetSheet({ sheet, onClose, onSaved }) {
  const [items, setItems] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, showToast] = useToast()

  useEffect(() => {
    get(`/api/budget?sheet=${sheet}`)
      .then((b) => setItems(
        b.items.length
          ? b.items.map((i) => ({ name: i.name, amount: String(Math.round(i.amount)) }))
          : [{ name: '', amount: '' }],
      ))
      .catch(() => setItems([{ name: '', amount: '' }]))
  }, [sheet])

  const upd = (idx, field, v) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: v } : it)))
  const removeRow = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx))
  const addRow = () => setItems((prev) => [...prev, { name: '', amount: '' }])

  const total = (items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const valid = items && items.every((i) => i.name.trim() && Number(i.amount) > 0)

  const save = async () => {
    setBusy(true)
    try {
      await put(`/api/budget?sheet=${sheet}`, {
        items: items.map((i) => ({ name: i.name.trim(), amount: Number(i.amount) })),
      })
      onSaved()
    } catch (e) { showToast(e.message, 'warn') } finally { setBusy(false) }
  }

  return (
    <CenterModal title="Бюджет місяця" onClose={onClose}>
      {!items && <div className="loading" style={{ padding: '16px 0' }}>Завантаження…</div>}
      {items && (
        <>
          {items.map((it, idx) => (
            <div key={idx} className="budget-row">
              <input placeholder="На що (напр. Продакшн)" value={it.name}
                onChange={(e) => upd(idx, 'name', e.target.value)} />
              <MoneyInput value={it.amount} onChange={(v) => upd(idx, 'amount', v)} placeholder="Сума" />
              <button className="btn-icon" aria-label="Прибрати секцію" onClick={() => removeRow(idx)}>
                {Icons.trash(16)}
              </button>
            </div>
          ))}
          <button className="btn-dashed" style={{ color: 'var(--orange)' }} onClick={addRow}>
            {Icons.plus(18)} Додати секцію
          </button>
          <div className="preview-meta">Разом: {total.toLocaleString('uk-UA')} ₴ на місяць</div>
          <button className="btn-primary" style={{ background: 'var(--orange)', opacity: valid ? 1 : 0.45 }}
            disabled={busy || !valid} onClick={save}>
            {busy ? 'Зберігаю…' : 'Зберегти'}
          </button>
        </>
      )}
      {toast}
    </CenterModal>
  )
}
