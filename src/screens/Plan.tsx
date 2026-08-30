import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PLAN_STATUSES, type PlanItem, type PlanStatus } from '../lib/types'
import { formatDate, safeHttpUrl, titleCase } from '../lib/format'
import type { TripData } from '../state/useTripData'
import { Banner, Empty, Sheet, errorMessage } from '../components/ui'
import { ArtSuitcase, IconCalendar, IconLink, IconPlus } from '../components/art'

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

      <div className="page-title">
        <h2>The plan</h2>
        <span className="hand">everything we want to do</span>
      </div>

      <div className="card tight toolbar">
        <div className="chips" role="group" aria-label="Filter ideas by status">
          <button
            className="chip"
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            All <span className="count">{data.planItems.length}</span>
          </button>
          {PLAN_STATUSES.map((s) => (
            <button
              key={s}
              className="chip"
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
            >
              {titleCase(s)} <span className="count">{counts.get(s) ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="toolbar-end">
          <label className="field sort-field">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as 'date-asc' | 'date-desc')}>
              <option value="date-asc">Earliest first</option>
              <option value="date-desc">Latest first</option>
            </select>
          </label>
          <button className="btn primary" onClick={() => setEditing('new')}>
            <IconPlus /> Add an idea
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <Empty
          art={<ArtSuitcase />}
          title={data.planItems.length === 0 ? 'The first page is blank' : 'Nothing under that stamp'}
        >
          {data.planItems.length === 0
            ? 'Add the first thing you want to do — a beach, a bar, a hike at sunrise.'
            : 'No ideas carry this status yet. Try another filter.'}
        </Empty>
      ) : (
        <div className="postcards">
          {visible.map((item) => {
            const href = safeHttpUrl(item.link)
            return (
              <article className="postcard card cut liftable" key={item.id}>
                <span className={`stamp ${item.status} tilt postcard-stamp`}>{item.status}</span>
                <h3 className="postcard-title">{item.title}</h3>
                {item.item_date ? (
                  <p className="date-ticket">
                    <IconCalendar size={14} /> {formatDate(item.item_date)}
                  </p>
                ) : (
                  <p className="tiny faint">No date yet</p>
                )}
                {item.note ? <p className="small postcard-note">{item.note}</p> : null}
                {href ? (
                  <a className="small postcard-link" href={href} target="_blank" rel="noopener noreferrer">
                    <IconLink /> <span className="truncate">{href.replace(/^https?:\/\//, '')}</span>
                  </a>
                ) : null}
                <hr className="divider" />
                <div className="row between postcard-foot">
                  <span className="tiny faint truncate">Added by {data.nameFor(item.created_by)}</span>
                  <span className="row" style={{ gap: 2 }}>
                    <button className="btn ghost small" onClick={() => setEditing(item)}>Edit</button>
                    <button className="btn ghost small danger" onClick={() => void remove(item)}>Delete</button>
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      )}

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
        <div className="full stamp-preview" aria-hidden="true">
          <span className={`stamp ${draft.status} tilt`}>{draft.status}</span>
          <span className="tiny faint">how it will be stamped</span>
        </div>
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
