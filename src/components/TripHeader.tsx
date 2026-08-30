import type { Trip, MemberView, TripRole } from '../lib/types'
import type { TripFunding } from '../lib/calc'
import { formatDate, formatMoney } from '../lib/format'
import { Avatar, ProgressBar } from './ui'
import { IconCalendar, IconPin, IconTag, RouteToDestination } from './art'

function countdownNote(days: number): string {
  if (days > 1) return `${days} days to go!`
  if (days === 1) return 'Tomorrow!'
  if (days === 0) return 'Today is the day!'
  return 'Hope it was wonderful.'
}

/** The opening page of the journal: where, when, who, and how far the fund has come. */
export function TripHeader({
  trip,
  members,
  funding,
  countdown,
  role,
  onManage,
}: {
  trip: Trip
  members: MemberView[]
  funding: TripFunding
  countdown: number
  role: TripRole | null
  onManage: () => void
}) {
  const pct = Math.round(funding.progress * 100)
  const shown = members.slice(0, 5)
  // The SVG label cannot wrap, so show just the place, shortened if need be.
  const place = trip.destination.split(',')[0].trim()
  const shortPlace = place.length > 18 ? `${place.slice(0, 17)}…` : place
  const extra = members.length - shown.length

  return (
    <header className="journal card taped">
      <div className="journal-text">
        <div className="row between wrap journal-kicker">
          <span className="kicker">Trip journal</span>
          <span className="row journal-tags">
            {trip.archived_at ? <span className="stamp maybe">archived</span> : null}
            <button className="btn ghost small" onClick={onManage}>
              <IconTag size={15} /> {role === 'owner' ? 'Manage trip' : 'Trip details'}
            </button>
          </span>
        </div>
        <h1>{trip.name}</h1>
        <p className="journal-meta">
          <span className="row" style={{ gap: 5 }}><IconPin /> {trip.destination}</span>
          <span className="dot" aria-hidden="true" />
          <span className="row" style={{ gap: 5 }}><IconCalendar /> {formatDate(trip.departure_date)}</span>
        </p>
        <p className="hand countdown">{countdownNote(countdown)}</p>

        <div className="journal-people">
          <span className="avatar-row">
            {shown.map((m) => <Avatar key={m.userId} name={m.name} id={m.userId} />)}
          </span>
          <span className="small muted">
            {members.length} {members.length === 1 ? 'traveller' : 'travellers'}
            {extra > 0 ? ` · +${extra} more` : ''}
          </span>
        </div>
      </div>

      <div className="journal-art">
        <RouteToDestination
          progress={funding.progress}
          destination={shortPlace}
          label={`Route to ${trip.destination}. The trip fund is ${pct} percent of the way there.`}
        />
      </div>

      <div className="journal-funding">
        <div className="row between">
          <span className="kicker">Trip fund</span>
          <span className="small num strong">
            {formatMoney(funding.saved, trip.currency)}
            <span className="faint"> of {formatMoney(funding.target, trip.currency)}</span>
          </span>
        </div>
        <ProgressBar
          value={funding.progress}
          thin
          label={`Trip fund: ${pct}% of the estimated budget saved`}
        />
        <p className="tiny muted">
          {funding.target <= 0
            ? 'Add costs on the Budget page to set the target.'
            : funding.remaining > 0
              ? `${formatMoney(funding.remaining, trip.currency)} still to find between everyone.`
              : 'Fully funded — the whole trip is covered.'}
        </p>
      </div>
    </header>
  )
}
