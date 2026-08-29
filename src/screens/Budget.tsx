import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { COST_CATEGORIES, type Cost, type CostCategory, type SplitType } from '../lib/types'
import { computeBudgetTotals, computeMemberShares } from '../lib/calc'
import { formatMoney, titleCase } from '../lib/format'
import type { TripData } from '../state/useTripData'
import { Banner, Empty, Sheet, Stat, errorMessage } from '../components/ui'

type Draft = {
  description: string
  category: CostCategory
  estimated_amount: string
  actual_amount: string
  note: string
  split_type: SplitType
  assigned_to: string
}

export function BudgetScreen({ data, userId }: { data: TripData; userId: string }) {
  const [editing, setEditing] = useState<Cost | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const currency = data.trip?.currency ?? 'EUR'

  const totals = useMemo(() => computeBudgetTotals(data.costs), [data.costs])
  const shares = useMemo(
    () => computeMemberShares(data.costs, data.memberIds),
    [data.costs, data.memberIds],
  )

  async function save(draft: Draft, existing: Cost | null) {
    const estimated = Number(draft.estimated_amount)
    const actual = draft.actual_amount.trim() === '' ? null : Number(draft.actual_amount)
    if (!Number.isFinite(estimated) || estimated < 0) { setError('Estimated cost must be zero or more.'); return }
    if (actual !== null && (!Number.isFinite(actual) || actual < 0)) { setError('Actual cost must be zero or more.'); return }
    if (draft.split_type === 'personal' && !draft.assigned_to) { setError('Choose who this personal cost belongs to.'); return }

    const payload = {
      trip_id: data.trip!.id,
      description: draft.description.trim(),
      category: draft.category,
      estimated_amount: Math.round(estimated * 100) / 100,
      actual_amount: actual === null ? null : Math.round(actual * 100) / 100,
      note: draft.note.trim() || null,
      split_type: draft.split_type,
      assigned_to: draft.split_type === 'personal' ? draft.assigned_to : null,
    }

    const res = existing
      ? await supabase.from('costs').update(payload).eq('id', existing.id)
      : await supabase.from('costs').insert({ ...payload, created_by: userId })

    if (res.error) { setError(errorMessage(res.error, 'Could not save this cost.')); return }
    setError(null)
    setEditing(null)
    await data.refresh()
  }

  async function remove(cost: Cost) {
    if (!confirm(`Delete "${cost.description}"?`)) return
    const { error: err } = await supabase.from('costs').delete().eq('id', cost.id)
    if (err) { setError(errorMessage(err, 'Could not delete this cost.')); return }
    await data.refresh()
  }

  const usedCategories = COST_CATEGORIES.filter(
    (c) => totals.byCategory[c].estimated > 0 || totals.byCategory[c].actual > 0,
  )

  return (
    <>
      {error ? <Banner kind="error">{error}</Banner> : null}

      <div className="card">
        <div className="row between">
          <h2>Trip budget</h2>
          <span className="small muted">
            {data.members.length} {data.members.length === 1 ? 'member' : 'members'}
          </span>
        </div>
        <div className="split">
          <Stat label="Estimated" value={formatMoney(totals.estimated, currency)} />
          <Stat label="Actual so far" value={formatMoney(totals.actual, currency)} />
        </div>
        <button className="btn primary block" onClick={() => setEditing('new')}>Add a cost</button>
      </div>

      {usedCategories.length > 0 ? (
        <div className="card">
          <h2>By category</h2>
          <div>
            {usedCategories.map((category) => (
              <div className="kv" key={category}>
                <span>{titleCase(category)}</span>
                <span className="num">
                  {formatMoney(totals.byCategory[category].estimated, currency)}
                  <span className="muted small">
                    {' · actual '}{formatMoney(totals.byCategory[category].actual, currency)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card">
        <h2>Each member&rsquo;s share</h2>
        <p className="small muted">
          Shared costs are split between all {data.members.length} current
          {data.members.length === 1 ? ' member' : ' members'}. Personal costs go entirely to one person.
        </p>
        <div>
          {data.members.map((member) => (
            <div className="kv" key={member.userId}>
              <span className="truncate">
                {member.name}{member.userId === userId ? ' (you)' : ''}
              </span>
              <span className="num">
                {formatMoney(shares[member.userId]?.estimated ?? 0, currency)}
                <span className="muted small">
                  {' · actual '}{formatMoney(shares[member.userId]?.actual ?? 0, currency)}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="list">
        <h2>Costs</h2>
        {data.costs.length === 0 ? (
          <Empty>No costs yet. Add flights, a place to stay, or anything else you expect to pay for.</Empty>
        ) : (
          data.costs.map((cost) => (
            <article className="card tight" key={cost.id}>
              <div className="row between">
                <h3 className="grow">{cost.description}</h3>
                <span className="pill">{cost.category}</span>
              </div>
              <div className="row between">
                <span className="small muted">
                  {cost.split_type === 'equal'
                    ? 'Split equally'
                    : `Personal · ${data.nameFor(cost.assigned_to)}`}
                </span>
                <span className="num strong">{formatMoney(cost.estimated_amount, currency)}</span>
              </div>
              {cost.actual_amount !== null ? (
                <div className="row between small muted">
                  <span>Actual</span>
                  <span className="num">{formatMoney(cost.actual_amount, currency)}</span>
                </div>
              ) : null}
              {cost.note ? <p className="small">{cost.note}</p> : null}
              <div className="row between">
                <span className="small muted">Added by {data.nameFor(cost.created_by)}</span>
                <span className="row">
                  <button className="btn ghost small" onClick={() => setEditing(cost)}>Edit</button>
                  <button className="btn ghost small danger" onClick={() => void remove(cost)}>Delete</button>
                </span>
              </div>
            </article>
          ))
        )}
      </div>

      {editing ? (
        <CostForm
          cost={editing === 'new' ? null : editing}
          data={data}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </>
  )
}

function CostForm(props: {
  cost: Cost | null
  data: TripData
  onClose: () => void
  onSave: (draft: Draft, existing: Cost | null) => Promise<void>
}) {
  const [draft, setDraft] = useState<Draft>(
    props.cost
      ? {
          description: props.cost.description,
          category: props.cost.category,
          estimated_amount: String(props.cost.estimated_amount),
          actual_amount: props.cost.actual_amount === null ? '' : String(props.cost.actual_amount),
          note: props.cost.note ?? '',
          split_type: props.cost.split_type,
          assigned_to: props.cost.assigned_to ?? '',
        }
      : {
          description: '',
          category: 'other',
          estimated_amount: '',
          actual_amount: '',
          note: '',
          split_type: 'equal',
          assigned_to: '',
        },
  )
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  return (
    <Sheet title={props.cost ? 'Edit cost' : 'Add a cost'} onClose={props.onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          await props.onSave(draft, props.cost)
          setBusy(false)
        }}
      >
        <label className="field full">
          Description
          <input
            required
            maxLength={200}
            autoFocus
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Return flights"
          />
        </label>
        <label className="field">
          Category
          <select value={draft.category} onChange={(e) => set('category', e.target.value as CostCategory)}>
            {COST_CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
          </select>
        </label>
        <label className="field">
          Estimated ({props.data.trip?.currency})
          <input
            required
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={draft.estimated_amount}
            onChange={(e) => set('estimated_amount', e.target.value)}
          />
        </label>
        <label className="field">
          Actual (optional)
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={draft.actual_amount}
            onChange={(e) => set('actual_amount', e.target.value)}
          />
        </label>
        <label className="field">
          Who pays
          <select
            value={draft.split_type}
            onChange={(e) => set('split_type', e.target.value as SplitType)}
          >
            <option value="equal">Split equally</option>
            <option value="personal">One member</option>
          </select>
        </label>
        {draft.split_type === 'personal' ? (
          <label className="field full">
            Assigned to
            <select
              required
              value={draft.assigned_to}
              onChange={(e) => set('assigned_to', e.target.value)}
            >
              <option value="">Choose a member…</option>
              {props.data.members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="field full">
          Note (optional)
          <textarea maxLength={2000} value={draft.note} onChange={(e) => set('note', e.target.value)} />
        </label>
        <button className="btn primary full" type="submit" disabled={busy || !draft.description.trim()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Sheet>
  )
}
