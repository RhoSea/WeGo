import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { SavingsEntry } from '../lib/types'
import { computeMemberShares, computeSavingsProgress, sumSavings, type SavingsProgress } from '../lib/calc'
import { formatDate, formatMoney, todayISO } from '../lib/format'
import type { TripData } from '../state/useTripData'
import {
  Avatar, Banner, Celebration, Empty, LedgerRow, ProgressBar, Sheet, Stat, errorMessage,
} from '../components/ui'
import { ArtJar } from '../components/art'

type Draft = { amount: string; entry_date: string; note: string }

const MILESTONES = [
  { at: 0.25, label: 'First leg' },
  { at: 0.5, label: 'Halfway' },
  { at: 0.75, label: 'Home stretch' },
  { at: 1, label: 'All saved' },
] as const

export function SavingsScreen({ data, userId }: { data: TripData; userId: string }) {
  const [editing, setEditing] = useState<SavingsEntry | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState<string | null>(null)
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
  const othersEntries = data.savings.filter((entry) => entry.user_id !== userId)

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
    if (!existing) setCelebrate(formatMoney(payload.amount, currency))
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

      <div className="page-title">
        <h2>The fund</h2>
        <span className="hand">how close everyone is</span>
      </div>

      <Banner kind="info">
        WeGo only keeps a record of what everyone says they have saved. It never moves or holds money.
      </Banner>

      {mine ? (
        <div className="card journey-card">
          <div className="row between wrap">
            <h3>Your journey</h3>
            <span
              className={`stamp ${mine.progress.target <= 0 ? 'neutral' : mine.progress.onTrack ? 'good' : 'bad'} tilt`}
            >
              {mine.progress.target <= 0 ? 'No share yet' : mine.progress.onTrack ? 'On track' : 'Behind'}
            </span>
          </div>

          <ProgressBar
            value={mine.progress.progress}
            tone={mine.progress.onTrack ? 'good' : 'warn'}
            label={`Your savings: ${Math.round(mine.progress.progress * 100)}% of your share`}
          />

          {mine.progress.target > 0 ? (
            <div className="milestones">
              {MILESTONES.map((m) => {
                const reached = mine.progress.progress >= m.at - 0.0001
                return (
                  <div className={`milestone${reached ? ' reached' : ''}`} key={m.at}>
                    <span className="mark">{Math.round(m.at * 100)}%</span>
                    {m.label}
                    <span className="sr-only">{reached ? ' — reached' : ' — not yet'}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="small muted">
              Nothing is budgeted yet, so you have no share to save for. Add costs on the Budget
              page and your target will appear here.
            </p>
          )}

          <div className="split three">
            <Stat label="Your share" value={formatMoney(mine.progress.target, currency)} />
            <Stat label="Saved" value={formatMoney(mine.progress.saved, currency)} accent="sage" />
            <Stat label="Still to go" value={formatMoney(mine.progress.remaining, currency)} accent="coral" />
            <Stat
              label="Days to go"
              value={mine.progress.departed ? '—' : String(mine.progress.daysUntilDeparture)}
              accent="gold"
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
            <div className="pace">
              <span className="kicker">To arrive on time</span>
              <div className="pace-rates">
                <span><b className="num">{formatMoney(mine.progress.weeklyNeeded ?? 0, currency)}</b> a week</span>
                <span className="pace-or">or</span>
                <span><b className="num">{formatMoney(mine.progress.monthlyNeeded ?? 0, currency)}</b> a month</span>
              </div>
            </div>
          )}

          <button className="btn primary block" onClick={() => setEditing('new')}>
            Record a contribution
          </button>
        </div>
      ) : null}

      <div className="page-title">
        <h3>Everyone&rsquo;s progress</h3>
      </div>
      <div className="member-cards">
        {progressByMember.map(({ member, progress }) => (
          <MemberSavingsCard
            key={member.userId}
            name={member.name}
            id={member.userId}
            you={member.userId === userId}
            progress={progress}
            currency={currency}
          />
        ))}
      </div>

      <div className="page-title">
        <h3>Your history</h3>
      </div>
      {myEntries.length === 0 ? (
        <Empty art={<ArtJar />} title="The jar is empty">
          Record what you put aside and it will show up here, and on everyone&rsquo;s progress.
        </Empty>
      ) : (
        <div className="slips">
          {myEntries.map((entry) => (
            <article className="slip card tight" key={entry.id}>
              <div className="row between">
                <span className="slip-amount num">{formatMoney(entry.amount, currency)}</span>
                <span className="tiny faint">{formatDate(entry.entry_date)}</span>
              </div>
              {entry.note ? <p className="small muted">{entry.note}</p> : null}
              <div className="row">
                <span className="grow" />
                <button className="btn ghost small" onClick={() => setEditing(entry)}>Edit</button>
                <button className="btn ghost small danger" onClick={() => void remove(entry)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {othersEntries.length > 0 ? (
        <div className="card">
          <h3>What everyone else has put in</h3>
          <div className="ledger">
            {othersEntries.map((entry) => (
              <LedgerRow
                key={entry.id}
                name={
                  <>
                    {data.nameFor(entry.user_id)}
                    <span className="faint tiny">{' · '}{formatDate(entry.entry_date)}</span>
                  </>
                }
                amount={formatMoney(entry.amount, currency)}
              />
            ))}
          </div>
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

      {celebrate ? (
        <Celebration
          title="Stamped in the fund!"
          detail={`${celebrate} recorded`}
          onDone={() => setCelebrate(null)}
        />
      ) : null}
    </>
  )
}

function MemberSavingsCard({
  name,
  id,
  you,
  progress,
  currency,
}: {
  name: string
  id: string
  you: boolean
  progress: SavingsProgress
  currency: string
}) {
  const pct = Math.round(progress.progress * 100)
  return (
    <article className={`card tight member-card${you ? ' is-you' : ''}`}>
      <div className="row">
        <Avatar name={name} id={id} large />
        <span className="col grow">
          <span className="member-name truncate">{name}{you ? ' (you)' : ''}</span>
          <span className="tiny faint num">
            {formatMoney(progress.saved, currency)} of {formatMoney(progress.target, currency)} · {pct}%
          </span>
        </span>
        <span className={`stamp ${progress.target <= 0 ? 'neutral' : progress.onTrack ? 'good' : 'bad'}`}>
          {progress.target <= 0 ? 'No share yet' : progress.onTrack ? 'On track' : 'Behind'}
        </span>
      </div>
      <ProgressBar
        value={progress.progress}
        tone={progress.onTrack ? 'good' : 'warn'}
        thin
        label={`${name}: ${pct}% of their share saved`}
      />
      <div className="member-rates tiny">
        <span>
          <b className="num">{formatMoney(progress.remaining, currency)}</b> left
        </span>
        {progress.target <= 0 ? (
          <span className="faint">nothing budgeted yet</span>
        ) : progress.departed ? (
          <span className="faint">departure passed</span>
        ) : (
          <>
            <span className="faint">
              <b className="num">{formatMoney(progress.weeklyNeeded ?? 0, currency)}</b>/week
            </span>
            <span className="faint">
              <b className="num">{formatMoney(progress.monthlyNeeded ?? 0, currency)}</b>/month
            </span>
          </>
        )}
      </div>
    </article>
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
