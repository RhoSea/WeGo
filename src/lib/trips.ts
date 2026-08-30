/**
 * Trip-level derivations: which shelf a trip sits on, what the person looking
 * at it is allowed to do, and the one-line summary each dashboard card shows.
 *
 * Every figure here is grouped by `trip_id` first, so one trip's costs, savings
 * and members can never reach another trip's card. The money itself is still
 * counted by `calc.ts`; this module only decides which rows go into it.
 */
import { computeTripFunding, dayNumberFromDate, dayNumberFromISODate, type TripFunding } from './calc'
import type {
  Cost, MemberView, Profile, SavingsEntry, Trip, TripMember, TripRole, TripStatus,
} from './types'

/** Archived wins over the calendar: a filed-away trip is not "upcoming". */
export function tripStatus(trip: Pick<Trip, 'departure_date' | 'archived_at'>, now: Date): TripStatus {
  if (trip.archived_at) return 'archived'
  return dayNumberFromISODate(trip.departure_date) < dayNumberFromDate(now) ? 'past' : 'upcoming'
}

/**
 * What this person may do with this trip. Ownership is the only distinction —
 * there is no ownership transfer in this version, so the owner is whoever
 * created the trip and they can never leave it.
 */
export interface TripPermissions {
  canEdit: boolean
  canInvite: boolean
  canArchive: boolean
  canDelete: boolean
  canLeave: boolean
}

export function tripPermissions(
  role: TripRole,
  trip: Pick<Trip, 'archived_at'>,
): TripPermissions {
  const owner = role === 'owner'
  // Truthiness, not `!== null`: a database that has not run migration 0002 yet
  // returns no archived_at at all, and undefined must not read as archived.
  const archived = Boolean(trip.archived_at)
  return {
    canEdit: owner,
    // An archived trip is closed to new arrivals until it is restored.
    canInvite: owner && !archived,
    canArchive: owner,
    // Deleting is permanent, so it only unlocks once the trip is archived.
    canDelete: owner && archived,
    canLeave: !owner,
  }
}

/** One card on the My Trips dashboard. */
export interface TripSummary {
  trip: Trip
  status: TripStatus
  role: TripRole
  members: MemberView[]
  memberCount: number
  /** Everything budgeted for this trip, whoever pays for it. */
  estimated: number
  /** The whole group's progress towards paying for this trip. */
  funding: TripFunding
  daysUntilDeparture: number
  permissions: TripPermissions
}

/** How a member is labelled everywhere: their name, else their email handle. */
export function memberLabel(profile: Profile | undefined, userId: string): string {
  if (profile?.display_name?.trim()) return profile.display_name.trim()
  if (profile?.email) return profile.email.split('@')[0]
  return `Member ${userId.slice(0, 6)}`
}

function groupBy<T extends { trip_id: string }>(rows: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const list = map.get(row.trip_id)
    if (list) list.push(row)
    else map.set(row.trip_id, [row])
  }
  return map
}

/**
 * Turns everything the dashboard loaded into one card per trip.
 *
 * Row Level Security has already narrowed the input to trips this person
 * belongs to, but the grouping is what guarantees separation: a trip the
 * viewer is not a member of produces no card at all, even if a stray cost or
 * savings row for it were somehow returned.
 */
export function summariseTrips(input: {
  trips: readonly Trip[]
  members: readonly TripMember[]
  profiles: readonly Profile[]
  costs: readonly Cost[]
  savings: readonly SavingsEntry[]
  userId: string
  now: Date
}): TripSummary[] {
  const profiles = new Map(input.profiles.map((p) => [p.id, p]))
  const membersByTrip = groupBy(input.members)
  const costsByTrip = groupBy(input.costs)
  const savingsByTrip = groupBy(input.savings)
  const today = dayNumberFromDate(input.now)

  const summaries: TripSummary[] = []

  for (const trip of input.trips) {
    const rows = membersByTrip.get(trip.id) ?? []
    const mine = rows.find((m) => m.user_id === input.userId)
    // Not a member: not this person's trip to see, whatever else came back.
    if (!mine) continue

    const costs = costsByTrip.get(trip.id) ?? []
    const savings = savingsByTrip.get(trip.id) ?? []
    const funding = computeTripFunding(costs, savings)

    summaries.push({
      trip,
      status: tripStatus(trip, input.now),
      role: mine.role,
      members: rows.map((m) => ({
        userId: m.user_id,
        role: m.role,
        name: memberLabel(profiles.get(m.user_id), m.user_id),
        email: profiles.get(m.user_id)?.email ?? null,
      })),
      memberCount: rows.length,
      estimated: funding.target,
      funding,
      daysUntilDeparture: dayNumberFromISODate(trip.departure_date) - today,
      permissions: tripPermissions(mine.role, trip),
    })
  }

  return sortTrips(summaries)
}

/**
 * The order the collection reads in: what is coming up, soonest first; then
 * where you have been, most recent first; then the drawer of archived trips.
 */
export function sortTrips(summaries: readonly TripSummary[]): TripSummary[] {
  const shelf: Record<TripStatus, number> = { upcoming: 0, past: 1, archived: 2 }
  return [...summaries].sort((a, b) => {
    if (a.status !== b.status) return shelf[a.status] - shelf[b.status]
    const direction = a.status === 'upcoming' ? 1 : -1
    const byDate = a.trip.departure_date.localeCompare(b.trip.departure_date) * direction
    return byDate !== 0 ? byDate : a.trip.name.localeCompare(b.trip.name)
  })
}

export function filterTrips(
  summaries: readonly TripSummary[],
  filter: TripStatus | 'all',
): TripSummary[] {
  return filter === 'all' ? [...summaries] : summaries.filter((s) => s.status === filter)
}

export function countByStatus(summaries: readonly TripSummary[]): Record<TripStatus, number> {
  const counts: Record<TripStatus, number> = { upcoming: 0, past: 0, archived: 0 }
  for (const summary of summaries) counts[summary.status]++
  return counts
}

/**
 * The trip to reopen when someone comes back. Null unless the remembered id is
 * still one they can actually reach, so a trip they left, or one the owner
 * deleted, never reopens.
 */
export function rememberedTrip(
  summaries: readonly TripSummary[],
  rememberedId: string | null,
): TripSummary | null {
  if (!rememberedId) return null
  return summaries.find((s) => s.trip.id === rememberedId) ?? null
}
