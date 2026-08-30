import { useState } from 'react'
import type { TripStatus } from '../lib/types'
import type { TripSummary } from '../lib/trips'
import { formatDate } from '../lib/format'
import { Sheet } from './ui'
import { IconChevronDown, IconPlus, IconTrips } from './art'

const STATUS_STAMP: Record<TripStatus, string> = {
  upcoming: 'teal',
  past: 'neutral',
  archived: 'maybe',
}

/**
 * The trip you are in, and the way out of it. Sits in the masthead on every
 * screen inside a trip, so My Trips and every other journey are one tap away
 * from anywhere in the app.
 */
export function TripSwitcher({
  current,
  summaries,
  onSelect,
  onSeeAll,
  onCreate,
}: {
  current: TripSummary | null
  summaries: TripSummary[]
  onSelect: (tripId: string) => void
  onSeeAll: () => void
  onCreate: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        className="trip-switch"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <IconTrips size={16} />
        <span className="col">
          <span className="kicker">Trip</span>
          <span className="trip-switch-name truncate">{current?.trip.name ?? 'Choose a trip'}</span>
        </span>
        <IconChevronDown />
      </button>

      {open ? (
        <Sheet title="Your trips" onClose={() => setOpen(false)}>
          <button
            className="btn block"
            onClick={() => { setOpen(false); onSeeAll() }}
          >
            <IconTrips size={16} /> All my trips
          </button>

          <div className="switch-list">
            {summaries.map((summary) => {
              const isCurrent = summary.trip.id === current?.trip.id
              return (
                <button
                  key={summary.trip.id}
                  className={`switch-row${isCurrent ? ' is-current' : ''}`}
                  aria-current={isCurrent ? 'true' : undefined}
                  onClick={() => { setOpen(false); onSelect(summary.trip.id) }}
                >
                  <span className="col grow">
                    <span className="switch-name truncate">{summary.trip.name}</span>
                    <span className="tiny faint truncate">
                      {summary.trip.destination} · {formatDate(summary.trip.departure_date)}
                    </span>
                  </span>
                  <span className={`stamp ${STATUS_STAMP[summary.status]}`}>{summary.status}</span>
                </button>
              )
            })}
          </div>

          <button className="btn primary block" onClick={() => { setOpen(false); onCreate() }}>
            <IconPlus /> Start a trip
          </button>
        </Sheet>
      ) : null}
    </>
  )
}
