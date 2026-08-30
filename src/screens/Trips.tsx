import { useMemo, useState } from 'react'
import type { TripStatus } from '../lib/types'
import { countByStatus, filterTrips, rememberedTrip, type TripSummary } from '../lib/trips'
import { formatDate, formatMoney } from '../lib/format'
import { Avatar, Banner, Empty, ProgressBar, SkeletonCard } from '../components/ui'
import { ArtPostcards, IconCalendar, IconPin, IconPlus, Postmark } from '../components/art'

type Filter = TripStatus | 'all'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'archived', label: 'Archived' },
]

const STATUS_STAMP: Record<TripStatus, string> = {
  upcoming: 'teal',
  past: 'neutral',
  archived: 'maybe',
}

/** The handwritten line under each trip's name. */
function departureNote(summary: TripSummary): string {
  const days = summary.daysUntilDeparture
  if (summary.status === 'archived') return 'Filed away for later'
  if (days > 1) return `${days} days to go!`
  if (days === 1) return 'Tomorrow!'
  if (days === 0) return 'Today is the day!'
  if (days === -1) return 'Left yesterday'
  return `${-days} days ago`
}

/**
 * My Trips — every journey this person owns or has joined, laid out as a rack
 * of postcards. The only place in the app that shows more than one trip.
 */
export function TripsScreen({
  summaries,
  loading,
  error,
  lastOpenedId,
  onOpen,
  onManage,
  onCreate,
  onRetry,
}: {
  summaries: TripSummary[] | null
  loading: boolean
  error: string | null
  lastOpenedId: string | null
  onOpen: (tripId: string) => void
  onManage: (tripId: string) => void
  onCreate: () => void
  onRetry: () => void
}) {
  const [filter, setFilter] = useState<Filter>('all')

  const counts = useMemo(() => countByStatus(summaries ?? []), [summaries])
  const visible = useMemo(() => filterTrips(summaries ?? [], filter), [summaries, filter])
  const bookmark = useMemo(
    () => rememberedTrip(summaries ?? [], lastOpenedId),
    [summaries, lastOpenedId],
  )

  return (
    <>
      {error ? (
        <>
          <Banner kind="error">{error}</Banner>
          <p className="small muted">
            Your trips live in the cloud, so this usually means the connection dropped. Nothing has
            been lost.
          </p>
          <button className="btn block" onClick={onRetry}>Try again</button>
        </>
      ) : null}

      <div className="page-title">
        <h2>My trips</h2>
        <span className="hand">every journey, planned and past</span>
      </div>

      {summaries === null && loading ? (
        <>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
          <p className="center muted small" role="status">Looking through the rack…</p>
        </>
      ) : summaries && summaries.length === 0 ? (
        <>
          <Empty art={<ArtPostcards />} title="The rack is empty">
            Start a trip and it will live here alongside every other one, or open an invitation
            link a friend sent you to join theirs.
          </Empty>
          <button className="btn primary block" onClick={onCreate}>
            <IconPlus /> Start a trip
          </button>
        </>
      ) : (
        <>
          {/* Picking up where you left off, when there is more than one trip to
              be in the middle of. */}
          {bookmark && (summaries?.length ?? 0) > 1 ? (
            <button className="bookmark" onClick={() => onOpen(bookmark.trip.id)}>
              <span className="bookmark-tab" aria-hidden="true" />
              <span className="col grow">
                <span className="kicker">Where you left off</span>
                <span className="bookmark-name truncate">{bookmark.trip.name}</span>
              </span>
              <span className="small strong nowrap">Open →</span>
            </button>
          ) : null}

          <div className="card tight toolbar">
            <div className="chips" role="group" aria-label="Filter trips by status">
              {FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  className="chip"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label}{' '}
                  <span className="count">
                    {key === 'all' ? (summaries?.length ?? 0) : counts[key]}
                  </span>
                </button>
              ))}
            </div>
            <div className="toolbar-end">
              <button className="btn primary" onClick={onCreate}>
                <IconPlus /> Start a trip
              </button>
            </div>
          </div>

          {visible.length === 0 ? (
            <Empty art={<ArtPostcards />} title="Nothing on that shelf">
              {filter === 'upcoming'
                ? 'No trips ahead of you yet. Start one, or restore an archived trip.'
                : filter === 'past'
                  ? 'No trips have departed yet — everything you have is still to come.'
                  : 'Nothing has been archived. Trips you finish with end up here.'}
            </Empty>
          ) : (
            <div className="trip-cards">
              {visible.map((summary) => (
                <TripCard
                  key={summary.trip.id}
                  summary={summary}
                  isLastOpened={summary.trip.id === lastOpenedId}
                  onOpen={() => onOpen(summary.trip.id)}
                  onManage={() => onManage(summary.trip.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

function TripCard({
  summary,
  isLastOpened,
  onOpen,
  onManage,
}: {
  summary: TripSummary
  isLastOpened: boolean
  onOpen: () => void
  onManage: () => void
}) {
  const { trip, funding, members, memberCount, status, role } = summary
  const pct = Math.round(funding.progress * 100)
  const shown = members.slice(0, 4)
  const extra = memberCount - shown.length

  return (
    <article className={`trip-card card cut liftable status-${status}`}>
      <span className={`stamp ${STATUS_STAMP[status]} tilt trip-card-stamp`}>{status}</span>
      {status === 'past' ? <Postmark text="VISITED" /> : null}

      <div className="trip-card-head">
        <div className="row wrap trip-card-role">
          <span className={`stamp ${role === 'owner' ? 'teal' : 'neutral'}`}>{role}</span>
          {isLastOpened ? <span className="tiny faint">last opened</span> : null}
        </div>
        <h3 className="trip-card-name">{trip.name}</h3>
        <p className="journal-meta small">
          <span className="row" style={{ gap: 5 }}><IconPin /> <span className="truncate">{trip.destination}</span></span>
          <span className="dot" aria-hidden="true" />
          <span className="row" style={{ gap: 5 }}><IconCalendar /> {formatDate(trip.departure_date)}</span>
        </p>
        <p className="hand trip-card-note">{departureNote(summary)}</p>
      </div>

      <div className="trip-card-people">
        <span className="avatar-row">
          {shown.map((m) => <Avatar key={m.userId} name={m.name} id={m.userId} />)}
        </span>
        <span className="small muted">
          {memberCount} {memberCount === 1 ? 'traveller' : 'travellers'}
          {extra > 0 ? ` · +${extra} more` : ''}
        </span>
      </div>

      <div className="trip-card-fund">
        <div className="row between">
          <span className="kicker">Trip fund</span>
          <span className="tiny num strong">{funding.target > 0 ? `${pct}%` : 'no budget yet'}</span>
        </div>
        <ProgressBar
          value={funding.progress}
          thin
          label={`${trip.name}: ${pct}% of the estimated budget saved`}
        />
        <div className="row between tiny muted trip-card-figures">
          <span className="num">{formatMoney(funding.saved, trip.currency)} saved</span>
          <span className="num">{formatMoney(summary.estimated, trip.currency)} budgeted</span>
        </div>
      </div>

      <div className="row trip-card-foot">
        <button className="btn primary small grow" onClick={onOpen}>Open trip</button>
        <button className="btn small" onClick={onManage}>
          {role === 'owner' ? 'Manage' : 'Details'}
        </button>
      </div>
    </article>
  )
}
