import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PLAN_STATUSES, type PlanItem, type PlanStatus } from '../lib/types'
import { formatDate, safeHttpUrl, titleCase } from '../lib/format'
import type { TripData } from '../state/useTripData'
import { Banner, Empty, Sheet, errorMessage } from '../components/ui'

type Draft = {
  title: string
  item_date: string
  link: string
  note: string
  status: PlanStatus
}

const emptyDraft: Draft = { title: '', item_date: '', link: '', note: '', status: 'idea' }

export function PlanScreen({ data, userId }: { data: TripData; userId: string }) {
  const [filter, setFilter] = useState<'all' | PlanStatus>('all')
  const [sort, setSort] = useState<'date-asc' | 'date-desc'>('date-asc')
  const [editing, setEditing] = useState<PlanItem | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const visible = useMemo(() => {
    const filtered = filter === 'all' ? data.planItems : data.planItems.filter((i) => i.status === filter)
    const direction = sort === 'date-asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      // Undated ideas always sit at the bottom, whichever way the list is sorted.
      if (!a.item_date && !b.item_date) return a.created_at.localeCompare(b.created_at)
      if (!a.item_date) return 1
      if (!b.item_date) return -1
      return a.item_date.localeCompare(b.item_date) * direction
    })
  }, [data.planItems, filter, sort])

  async function save(draft: Draft, existing: PlanItem | null) {
    const payload = {
      trip_id: data.trip!.id,
      title: draft.title.trim(),
      item_date: draft.item_date || null,
      link: draft.link.trim() ? safeHttpUrl(draft.link.trim()) : null,
      note: draft.note.trim() || null,
      status: draft.status,
    }
    if (draft.link.trim() && !payload.link) {
      setError('Links must start with http:// or https://')
      return
    }

    const res = existing
      ? await supabase.from('plan_items').update(payload).eq('id', existing.id)
      : await supabase.from('plan_items').insert({ ...payload, created_by: userId })

    if (res.error) { setError(errorMessage(res.error, 'Could not save this idea.')); return }
    setError(null)
    setEditing(null)
    await data.refresh()
  }

  async function remove(item: PlanItem) {
    if (!confirm(`Delete "${item.title}"?`)) return
    const { error: err } = await supabase.from('plan_items').delete().eq('id', item.id)
    if (err) { setError(errorMessage(err, 'Could not delete this idea.')); return }
    await data.refresh()
  }

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of data.planItems) map.set(item.status, (map.get(item.status) ?? 0) + 1)
    return map
  }, [data.planItems])

  return (
    <>
      {error ? <Banner kind="error">{error}</Banner> : null}

      <div className="card tight">
        <div className="row wrap">
          <label className="field grow">
            Filter by status
            <select value={filter} onChange={(e) => setFilter(e.target.value as 'all' | PlanStatus)}>
              <option value="all">All ({data.planItems.length})</option>
              {PLAN_STATUSES.map((s) => (
                <option key={s} value={s}>{titleCase(s)} ({counts.get(s) ?? 0})</option>
              ))}
            </select>
          </label>
          <label className="field grow">
            Sort by date
            <select value={sort} onChange={(e) => setSort(e.target.value as 'date-asc' | 'date-desc')}>
              <option value="date-asc">Earliest first</option>
              <option value="date-desc">Latest first</option>
            </select>
          </label>
        </div>
        <button className="btn primary block" onClick={() => setEditing('new')}>Add an idea</button>
      </div>

      <div className="list">
        {visible.length === 0 ? (
          <Empty>
            {data.planItems.length === 0
              ? 'No ideas yet. Add the first thing you want to do.'
              : 'Nothing matches this filter.'}
          </Empty>
        ) : (
          visible.map((item) => {
            const href = safeHttpUrl(item.link)
            return (
              <article className="card tight" key={item.id}>
                <div className="row between">
                  <h3 className="grow">{item.title}</h3>
                  <span className={`pill ${item.status}`}>{item.status}</span>
                </div>
                {item.item_date ? <p className="small muted">{formatDate(item.item_date)}</p> : null}
                {item.note ? <p className="small">{item.note}</p> : null}
                {href ? (
                  <a className="small truncate" href={href} target="_blank" rel="noopener noreferrer">{href}</a>
                ) : null}
                <div className="row between">
                  <span className="small muted">Added by {data.nameFor(item.created_by)}</span>
                  <span className="row">
                    <button className="btn ghost small" onClick={() => setEditing(item)}>Edit</button>
                    <button className="btn ghost small danger" onClick={() => void remove(item)}>Delete</button>
                  </span>
                </div>
              </article>
            )
          })
        )}
      </div>

      {editing ? (
        <PlanForm
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </>
  )
}

function PlanForm(props: {
  item: PlanItem | null
  onClose: () => void
  onSave: (draft: Draft, existing: PlanItem | null) => Promise<void>
}) {
  const [draft, setDraft] = useState<Draft>(
    props.item
      ? {
          title: props.item.title,
          item_date: props.item.item_date ?? '',
          link: props.item.link ?? '',
          note: props.item.note ?? '',
          status: props.item.status,
        }
      : emptyDraft,
  )
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  return (
    <Sheet title={props.item ? 'Edit idea' : 'Add an idea'} onClose={props.onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          await props.onSave(draft, props.item)
          setBusy(false)
        }}
      >
        <label className="field full">
          Title
          <input
            required
            maxLength={200}
            autoFocus
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Sunset boat trip"
          />
        </label>
        <label className="field">
          Date (optional)
          <input type="date" value={draft.item_date} onChange={(e) => set('item_date', e.target.value)} />
        </label>
        <label className="field">
          Status
          <select value={draft.status} onChange={(e) => set('status', e.target.value as PlanStatus)}>
            {PLAN_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
        </label>
        <label className="field full">
          Link (optional)
          <input
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={draft.link}
            onChange={(e) => set('link', e.target.value)}
          />
        </label>
        <label className="field full">
          Note (optional)
          <textarea maxLength={2000} value={draft.note} onChange={(e) => set('note', e.target.value)} />
        </label>
        <button className="btn primary full" type="submit" disabled={busy || !draft.title.trim()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Sheet>
  )
}
