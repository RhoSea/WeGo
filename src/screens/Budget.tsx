import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { COST_CATEGORIES, type Cost, type CostCategory, type SplitType } from '../lib/types'
import { computeBudgetTotals, computeMemberShares, equalShare } from '../lib/calc'
import { formatMoney, titleCase } from '../lib/format'
import type { TripData } from '../state/useTripData'
import { Banner, Empty, LedgerRow, Sheet, Stat, errorMessage } from '../components/ui'
import { ArtReceipt, IconPlus, SketchBar, seedFrom } from '../components/art'

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

  // Biggest first: the chart answers "where does the money go" at a glance.
  const chartRows = useMemo(() => {
    return COST_CATEGORIES
      .map((category) => ({ category, ...totals.byCategory[category] }))
      .filter((row) => row.estimated > 0 || row.actual > 0)
      .sort((a, b) => Math.max(b.estimated, b.actual) - Math.max(a.estimated, a.actual))
  }, [totals])

  const chartMax = chartRows.reduce((max, r) => Math.max(max, r.estimated, r.actual), 0)
  const shared = data.costs.filter((c) => c.split_type === 'equal')
  const personal = data.costs.filter((c) => c.split_type === 'personal')
  const headCount = data.members.length

  return (
    <>
      {error ? <Banner kind="error">{error}</Banner> : null}

      <div className="page-title">
        <h2>The ledger</h2>
        <span className="hand">what it all adds up to</span>
      </div>

      <div className="card">
        <div className="split three">
          <Stat label="Estimated" value={formatMoney(totals.estimated, currency)} accent="teal" />
          <Stat label="Spent so far" value={formatMoney(totals.actual, currency)} accent="coral" />
          <Stat
            label="Per traveller"
            value={formatMoney(equalShare(totals.estimated, headCount), currency)}
            hint={`if every cost were split ${headCount} ${headCount === 1 ? 'way' : 'ways'}`}
            accent="gold"
          />
        </div>
        <button className="btn primary block" onClick={() => setEditing('new')}>
          <IconPlus /> Add a cost
        </button>
      </div>

      {chartRows.length > 0 ? (
        <div className="card">
          <div className="row between wrap">
            <h3>Where the money goes</h3>
            <span className="chart-key tiny muted">
              <span className="key-swatch ghost" aria-hidden="true" /> estimated
              <span className="key-swatch" aria-hidden="true" /> spent
            </span>
          </div>
          <div className="chart">
            {chartRows.map((row) => (
              <div className="chart-row" key={row.category}>
                <div className="row between chart-labels">
                  <span className="chart-name">{titleCase(row.category)}</span>
                  <span className="num tiny">
                    {formatMoney(row.estimated, currency)}
                    {row.actual > 0 ? (
                      <span className="faint"> · {formatMoney(row.actual, currency)} spent</span>
                    ) : null}
                  </span>
                </div>
                <div className="chart-track">
                  <SketchBar
                    ghost
                    fraction={chartMax > 0 ? row.estimated / chartMax : 0}
                    color={`var(--cat-${row.category})`}
                    seed={seedFrom(row.category)}
                  />
                  <SketchBar
                    fraction={chartMax > 0 ? row.actual / chartMax : 0}
                    color={`var(--cat-${row.category})`}
                    seed={seedFrom(`${row.category}-actual`)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card">
        <h3>Each traveller&rsquo;s share</h3>
        <p className="small muted">
          Shared costs are split between all {headCount} current
          {headCount === 1 ? ' traveller' : ' travellers'}; personal costs go entirely to one person.
          Shares re-divide the moment somebody joins.
        </p>
        <div className="ledger">
          {data.members.map((member) => (
            <LedgerRow
              key={member.userId}
              name={<>{member.name}{member.userId === userId ? ' (you)' : ''}</>}
              amount={formatMoney(shares[member.userId]?.estimated ?? 0, currency)}
              hint={
                (shares[member.userId]?.actual ?? 0) > 0
                  ? `· ${formatMoney(shares[member.userId].actual, currency)} spent`
                  : undefined
              }
            />
          ))}
          <LedgerRow total name="Whole trip" amount={formatMoney(totals.estimated, currency)} />
        </div>
      </div>

      {data.costs.length === 0 ? (
        <Empty art={<ArtReceipt />} title="Nothing on the bill yet">
          Add flights, a place to stay, or anything else you expect to pay for.
        </Empty>
      ) : (
        <>
          <CostGroup
            title="Shared costs"
            note={`split ${headCount} ${headCount === 1 ? 'way' : 'ways'}`}
            costs={shared}
            data={data}
            currency={currency}
            headCount={headCount}
            onEdit={setEditing}
            onRemove={remove}
          />
          <CostGroup
            title="Personal costs"
            note="charged to one person"
            costs={personal}
            data={data}
            currency={currency}
            headCount={headCount}
            onEdit={setEditing}
            onRemove={remove}
          />
        </>
      )}

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

function CostGroup(props: {
  title: string
  note: string
  costs: Cost[]
  data: TripData
  currency: string
  headCount: number
  onEdit: (cost: Cost) => void
  onRemove: (cost: Cost) => Promise<void>
}) {
  if (props.costs.length === 0) return null
  const { currency, data } = props
  return (
    <section className="cost-group">
      <div className="row between wrap group-head">
        <h3>{props.title}</h3>
        <span className={`stamp ${props.title === 'Shared costs' ? 'teal' : 'booked'}`}>{props.note}</span>
      </div>
      <div className="cost-list">
        {props.costs.map((cost) => (
          <article className="card tight cost-card liftable" key={cost.id}>
            <span className="cat-chip" style={{ ['--cat' as string]: `var(--cat-${cost.category})` }}>
              <i aria-hidden="true" />{titleCase(cost.category)}
            </span>
            <div className="row between top">
              <h4 className="grow cost-title">{cost.description}</h4>
              <span className="cost-amount num">{formatMoney(cost.estimated_amount, currency)}</span>
            </div>
            <div className="row between wrap cost-meta">
              <span className="small muted">
                {cost.split_type === 'equal'
                  ? `${formatMoney(equalShare(cost.estimated_amount, props.headCount), currency)} each`
                  : `All of it: ${data.nameFor(cost.assigned_to)}`}
              </span>
              {cost.actual_amount !== null ? (
                <span className="small num muted">
                  {formatMoney(cost.actual_amount, currency)} actually spent
                </span>
              ) : null}
            </div>
            {cost.note ? <p className="small cost-note">{cost.note}</p> : null}
            <hr className="divider" />
            <div className="row between">
              <span className="tiny faint truncate">Added by {data.nameFor(cost.created_by)}</span>
              <span className="row" style={{ gap: 2 }}>
                <button className="btn ghost small" onClick={() => props.onEdit(cost)}>Edit</button>
                <button className="btn ghost small danger" onClick={() => void props.onRemove(cost)}>Delete</button>
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
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
  const members = props.data.members.length

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
            <option value="personal">One traveller</option>
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
              <option value="">Choose a traveller…</option>
              {props.data.members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <p className="full tiny muted split-hint">
            Split equally means {members} {members === 1 ? 'person pays' : 'people each pay'}{' '}
            {draft.estimated_amount && Number.isFinite(Number(draft.estimated_amount))
              ? formatMoney(equalShare(Number(draft.estimated_amount), members), props.data.trip?.currency ?? 'EUR')
              : 'a share'}
            . It re-divides whenever somebody joins.
          </p>
        )}
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
