import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { SavingsEntry } from '../lib/types'
import { computeMemberShares, computeSavingsProgress, sumSavings } from '../lib/calc'
import { formatDate, formatMoney, todayISO } from '../lib/format'
import type { TripData } from '../state/useTripData'
import { Banner, Empty, ProgressBar, Sheet, Stat, errorMessage } from '../components/ui'

type Draft = { amount: string; entry_date: string; note: string }

export function SavingsScreen({ data, userId }: { data: TripData; userId: string }) {
  const [editing, setEditing] = useState<SavingsEntry | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const trip = data.trip!
  const currency = trip.currency

  const shares = useMemo(
    () => computeMemberShares(data.costs, data.memberIds),
    [data.costs, data.memberIds],
  )

  const progressByMember = useMemo(() => {
    return data.members.map((member) => ({
      member,
      progress: computeSavingsProgress({
        target: shares[member.userId]?.estimated ?? 0,
        saved: sumSavings(data.savings, member.userId),
        departureDate: trip.departure_date,
        savingStartDate: trip.created_at,
      }),
    }))
  }, [data.members, data.savings, shares, trip.departure_date, trip.created_at])

  const mine = progressByMember.find((p) => p.member.userId === userId)
  const myEntries = data.savings.filter((entry) => entry.user_id === userId)

  async function save(draft: Draft, existing: SavingsEntry | null) {
    const amount = Number(draft.amount)
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter an amount greater than zero.'); return }

    const payload = {
      trip_id: trip.id,
      amount: Math.round(amount * 100) / 100,
      entry_date: draft.entry_date || todayISO(),
      note: draft.note.trim() || null,
    }

    const res = existing
      ? await supabase.from('savings_entries').update(payload).eq('id', existing.id)
      : await supabase.from('savings_entries').insert({ ...payload, user_id: userId })

    if (res.error) { setError(errorMessage(res.error, 'Could not save this contribution.')); return }
    setError(null)
    setEditing(null)
    await data.refresh()
  }

  async function remove(entry: SavingsEntry) {
    if (!confirm('Delete this contribution?')) return
    const { error: err } = await supabase.from('savings_entries').delete().eq('id', entry.id)
    if (err) { setError(errorMessage(err, 'Could not delete this contribution.')); return }
    await data.refresh()
  }

  return (
    <>
      {error ? <Banner kind="error">{error}</Banner> : null}

      <Banner kind="info">
        WeGo only keeps a record of what everyone says they have saved. It never moves or holds money.
      </Banner>

      {mine ? (
        <div className="card">
          <div className="row between">
            <h2>Your savings</h2>
            <span className={`pill ${mine.progress.onTrack ? 'good' : 'bad'}`}>
              {mine.progress.onTrack ? 'On track' : 'Behind'}
            </span>
          </div>
          <ProgressBar
            value={mine.progress.progress}
            tone={mine.progress.onTrack ? 'good' : 'warn'}
          />
          <div className="split">
            <Stat label="Target" value={formatMoney(mine.progress.target, currency)} />
            <Stat label="Saved" value={formatMoney(mine.progress.saved, currency)} />
            <Stat label="Remaining" value={formatMoney(mine.progress.remaining, currency)} />
            <Stat
              label="Days to go"
              value={mine.progress.departed ? '—' : String(mine.progress.daysUntilDeparture)}
            />
          </div>

          {mine.progress.departed ? (
            <Banner kind="warn">
              The departure date ({formatDate(trip.departure_date)}) has passed, so there is no savings
              rate left to show.
              {mine.progress.remaining > 0
                ? ` You are still ${formatMoney(mine.progress.remaining, currency)} short of your share.`
                : ' You reached your target.'}
            </Banner>
          ) : (
            <div className="split">
              <Stat label="Per week" value={formatMoney(mine.progress.weeklyNeeded ?? 0, currency)} />
              <Stat label="Per month" value={formatMoney(mine.progress.monthlyNeeded ?? 0, currency)} />
            </div>
          )}

          <button className="btn primary block" onClick={() => setEditing('new')}>
            Record a contribution
          </button>
        </div>
      ) : null}

      <div className="card">
        <h2>Everyone&rsquo;s progress</h2>
        {progressByMember.map(({ member, progress }) => (
          <div className="col" key={member.userId}>
            <div className="row between small">
              <span className="truncate">
                {member.name}{member.userId === userId ? ' (you)' : ''}
              </span>
              <span className="num muted">
                {formatMoney(progress.saved, currency)} / {formatMoney(progress.target, currency)}
              </span>
            </div>
            <ProgressBar value={progress.progress} tone={progress.onTrack ? 'good' : 'warn'} />
            <span className="small muted">
              {progress.departed
                ? progress.remaining > 0
                  ? `Departure passed · ${formatMoney(progress.remaining, currency)} short`
                  : 'Departure passed · target reached'
                : `${formatMoney(progress.weeklyNeeded ?? 0, currency)} per week · ${
                    progress.onTrack ? 'on track' : 'behind'
                  }`}
            </span>
          </div>
        ))}
      </div>

      <div className="list">
        <h2>Your history</h2>
        {myEntries.length === 0 ? (
          <Empty>You have not recorded any savings yet.</Empty>
        ) : (
          myEntries.map((entry) => (
            <article className="card tight" key={entry.id}>
              <div className="row between">
                <span className="strong num">{formatMoney(entry.amount, currency)}</span>
                <span className="small muted">{formatDate(entry.entry_date)}</span>
              </div>
              {entry.note ? <p className="small">{entry.note}</p> : null}
              <div className="row">
                <span className="grow" />
                <button className="btn ghost small" onClick={() => setEditing(entry)}>Edit</button>
                <button className="btn ghost small danger" onClick={() => void remove(entry)}>Delete</button>
              </div>
            </article>
          ))
        )}
      </div>

      {data.savings.length > myEntries.length ? (
        <div className="card">
          <h2>Group history</h2>
          {data.savings
            .filter((entry) => entry.user_id !== userId)
            .map((entry) => (
              <div className="kv" key={entry.id}>
                <span className="truncate">
                  {data.nameFor(entry.user_id)}
                  <span className="muted small">{' · '}{formatDate(entry.entry_date)}</span>
                </span>
                <span className="num">{formatMoney(entry.amount, currency)}</span>
              </div>
            ))}
        </div>
      ) : null}

      {editing ? (
        <SavingsForm
          entry={editing === 'new' ? null : editing}
          currency={currency}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </>
  )
}

function SavingsForm(props: {
  entry: SavingsEntry | null
  currency: string
  onClose: () => void
  onSave: (draft: Draft, existing: SavingsEntry | null) => Promise<void>
}) {
  const [draft, setDraft] = useState<Draft>(
    props.entry
      ? {
          amount: String(props.entry.amount),
          entry_date: props.entry.entry_date,
          note: props.entry.note ?? '',
        }
      : { amount: '', entry_date: todayISO(), note: '' },
  )
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  return (
    <Sheet title={props.entry ? 'Edit contribution' : 'Record a contribution'} onClose={props.onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          await props.onSave(draft, props.entry)
          setBusy(false)
        }}
      >
        <label className="field">
          Amount ({props.currency})
          <input
            required
            autoFocus
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={draft.amount}
            onChange={(e) => set('amount', e.target.value)}
          />
        </label>
        <label className="field">
          Date
          <input
            required
            type="date"
            value={draft.entry_date}
            onChange={(e) => set('entry_date', e.target.value)}
          />
        </label>
        <label className="field full">
          Note (optional)
          <textarea
            maxLength={2000}
            placeholder="Moved from my current account"
            value={draft.note}
            onChange={(e) => set('note', e.target.value)}
          />
        </label>
        <button className="btn primary full" type="submit" disabled={busy || !draft.amount}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Sheet>
  )
}
