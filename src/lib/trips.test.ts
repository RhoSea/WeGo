import { describe, expect, it } from 'vitest'
import {
  countByStatus,
  filterTrips,
  memberLabel,
  rememberedTrip,
  sortTrips,
  summariseTrips,
  tripPermissions,
  tripStatus,
} from './trips'
import { computeMemberShares, round2 } from './calc'
import type { Cost, Profile, SavingsEntry, Trip, TripMember } from './types'

const NOW = new Date('2026-06-15T12:00:00Z')

const ANA = 'user-ana'
const BEN = 'user-ben'
const CAI = 'user-cai'

const trip = (over: Partial<Trip> & { id: string }): Trip => ({
  name: `Trip ${over.id}`,
  destination: 'Somewhere',
  departure_date: '2026-09-01',
  currency: 'EUR',
  created_by: ANA,
  created_at: '2026-01-01T00:00:00Z',
  archived_at: null,
  ...over,
})

const member = (trip_id: string, user_id: string, role: 'owner' | 'member' = 'member'): TripMember => ({
  id: `${trip_id}:${user_id}`,
  trip_id,
  user_id,
  role,
  joined_at: '2026-01-01T00:00:00Z',
})

const cost = (over: Partial<Cost> & { trip_id: string }): Cost => ({
  id: crypto.randomUUID(),
  description: 'x',
  category: 'other',
  estimated_amount: 0,
  actual_amount: null,
  note: null,
  split_type: 'equal',
  assigned_to: null,
  created_by: ANA,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
})

const saving = (over: Partial<SavingsEntry> & { trip_id: string }): SavingsEntry => ({
  id: crypto.randomUUID(),
  user_id: ANA,
  amount: 0,
  entry_date: '2026-02-01',
  note: null,
  created_at: '2026-02-01T00:00:00Z',
  ...over,
})

const profiles: Profile[] = [
  { id: ANA, email: 'ana@example.com', display_name: 'Ana Ruiz' },
  { id: BEN, email: 'ben@example.com', display_name: null },
  { id: CAI, email: null, display_name: null },
]

describe('tripStatus', () => {
  it('reads upcoming and past off the departure date', () => {
    expect(tripStatus({ departure_date: '2026-09-01', archived_at: null }, NOW)).toBe('upcoming')
    expect(tripStatus({ departure_date: '2026-01-04', archived_at: null }, NOW)).toBe('past')
  })

  it('counts the day of departure as still upcoming', () => {
    expect(tripStatus({ departure_date: '2026-06-15', archived_at: null }, NOW)).toBe('upcoming')
    expect(tripStatus({ departure_date: '2026-06-14', archived_at: null }, NOW)).toBe('past')
  })

  it('lets archiving override the calendar in both directions', () => {
    const at = '2026-05-01T00:00:00Z'
    expect(tripStatus({ departure_date: '2026-09-01', archived_at: at }, NOW)).toBe('archived')
    expect(tripStatus({ departure_date: '2020-01-01', archived_at: at }, NOW)).toBe('archived')
  })
})

describe('tripPermissions', () => {
  const live = { archived_at: null }
  const filed = { archived_at: '2026-05-01T00:00:00Z' }

  it('lets an owner manage their trip but never leave it', () => {
    const can = tripPermissions('owner', live)
    expect(can).toMatchObject({ canEdit: true, canInvite: true, canArchive: true, canLeave: false })
  })

  it('lets a member leave but manage nothing', () => {
    expect(tripPermissions('member', live)).toEqual({
      canEdit: false, canInvite: false, canArchive: false, canDelete: false, canLeave: true,
    })
  })

  it('only unlocks deletion once the owner has archived the trip', () => {
    expect(tripPermissions('owner', live).canDelete).toBe(false)
    expect(tripPermissions('owner', filed).canDelete).toBe(true)
  })

  it('never lets a member delete, archived or not', () => {
    expect(tripPermissions('member', filed).canDelete).toBe(false)
    expect(tripPermissions('member', filed).canArchive).toBe(false)
  })

  it('closes an archived trip to new invitations', () => {
    expect(tripPermissions('owner', filed).canInvite).toBe(false)
  })

  it('treats a missing archived_at as not archived', () => {
    // A database that has not run migration 0002 yet returns no such column;
    // reading that as "archived" would hide the invite form and offer deletion.
    const legacy = {} as { archived_at: string | null }
    expect(tripPermissions('owner', legacy)).toMatchObject({ canInvite: true, canDelete: false })
    expect(tripStatus({ departure_date: '2026-09-01', ...legacy }, NOW)).toBe('upcoming')
  })
})

describe('memberLabel', () => {
  it('prefers a display name, then the email handle, then a stable stand-in', () => {
    expect(memberLabel(profiles[0], ANA)).toBe('Ana Ruiz')
    expect(memberLabel(profiles[1], BEN)).toBe('ben')
    expect(memberLabel(profiles[2], CAI)).toBe('Member user-c')
    expect(memberLabel(undefined, CAI)).toBe('Member user-c')
  })
})

describe('summariseTrips — separation between trips', () => {
  // Ana owns Lisbon with Ben, and has joined Ben's Oslo trip. Cai is in neither.
  const trips = [
    trip({ id: 'lisbon', name: 'Lisbon', departure_date: '2026-09-01', currency: 'EUR' }),
    trip({ id: 'oslo', name: 'Oslo', departure_date: '2026-07-01', currency: 'NOK', created_by: BEN }),
  ]
  const members = [
    member('lisbon', ANA, 'owner'),
    member('lisbon', BEN),
    member('oslo', BEN, 'owner'),
    member('oslo', ANA),
    member('oslo', CAI),
  ]
  const costs = [
    cost({ trip_id: 'lisbon', estimated_amount: 900 }),
    cost({ trip_id: 'oslo', estimated_amount: 300 }),
  ]
  const savings = [
    saving({ trip_id: 'lisbon', user_id: ANA, amount: 200 }),
    saving({ trip_id: 'oslo', user_id: BEN, amount: 90 }),
  ]

  const summarise = (userId: string) =>
    summariseTrips({ trips, members, profiles, costs, savings, userId, now: NOW })

  it('counts each trip only from its own costs and savings', () => {
    const byId = new Map(summarise(ANA).map((s) => [s.trip.id, s]))

    expect(byId.get('lisbon')!.estimated).toBe(900)
    expect(byId.get('lisbon')!.funding.saved).toBe(200)
    expect(byId.get('oslo')!.estimated).toBe(300)
    expect(byId.get('oslo')!.funding.saved).toBe(90)
  })

  it('counts each trip only from its own members', () => {
    const byId = new Map(summarise(ANA).map((s) => [s.trip.id, s]))
    expect(byId.get('lisbon')!.memberCount).toBe(2)
    expect(byId.get('oslo')!.memberCount).toBe(3)
    expect(byId.get('lisbon')!.members.map((m) => m.userId).sort()).toEqual([ANA, BEN])
  })

  it('gives the same person a different role in each trip', () => {
    const byId = new Map(summarise(ANA).map((s) => [s.trip.id, s]))
    expect(byId.get('lisbon')!.role).toBe('owner')
    expect(byId.get('lisbon')!.permissions.canDelete).toBe(false)
    expect(byId.get('lisbon')!.permissions.canLeave).toBe(false)
    expect(byId.get('oslo')!.role).toBe('member')
    expect(byId.get('oslo')!.permissions.canEdit).toBe(false)
    expect(byId.get('oslo')!.permissions.canLeave).toBe(true)
  })

  it('shows nothing at all to someone who is in neither trip', () => {
    expect(summarise('user-stranger')).toEqual([])
  })

  it('drops a trip whose rows arrive without a membership for the viewer', () => {
    // Cai is only in Oslo, so Lisbon must not appear even though its costs,
    // savings and other members were all in the same response.
    const ids = summarise(CAI).map((s) => s.trip.id)
    expect(ids).toEqual(['oslo'])
  })

  it('keeps each trip in its own currency', () => {
    const byId = new Map(summarise(ANA).map((s) => [s.trip.id, s]))
    expect(byId.get('lisbon')!.trip.currency).toBe('EUR')
    expect(byId.get('oslo')!.trip.currency).toBe('NOK')
  })

  it('divides a shared cost by that trip’s member count, not the other’s', () => {
    // The same 900 would be 450 each in Lisbon and 300 each in Oslo.
    const lisbonIds = members.filter((m) => m.trip_id === 'lisbon').map((m) => m.user_id)
    const osloIds = members.filter((m) => m.trip_id === 'oslo').map((m) => m.user_id)
    const lisbonCosts = costs.filter((c) => c.trip_id === 'lisbon')

    expect(round2(computeMemberShares(lisbonCosts, lisbonIds)[ANA].estimated)).toBe(450)
    expect(round2(computeMemberShares(lisbonCosts, osloIds)[ANA].estimated)).toBe(300)
  })

  it('reports the days left per trip', () => {
    const byId = new Map(summarise(ANA).map((s) => [s.trip.id, s]))
    expect(byId.get('oslo')!.daysUntilDeparture).toBe(16)
    expect(byId.get('lisbon')!.daysUntilDeparture).toBe(78)
  })
})

describe('summariseTrips — a trip with nothing in it', () => {
  it('reads as not started rather than fully funded', () => {
    const [summary] = summariseTrips({
      trips: [trip({ id: 'blank' })],
      members: [member('blank', ANA, 'owner')],
      profiles,
      costs: [],
      savings: [],
      userId: ANA,
      now: NOW,
    })
    expect(summary.estimated).toBe(0)
    expect(summary.funding.progress).toBe(0)
    expect(summary.memberCount).toBe(1)
  })
})

describe('sortTrips, filterTrips and countByStatus', () => {
  const summaries = summariseTrips({
    trips: [
      trip({ id: 'far', departure_date: '2026-12-01' }),
      trip({ id: 'soon', departure_date: '2026-07-01' }),
      trip({ id: 'old', departure_date: '2025-03-01' }),
      trip({ id: 'recent', departure_date: '2026-05-01' }),
      trip({ id: 'filed', departure_date: '2026-08-01', archived_at: '2026-06-01T00:00:00Z' }),
    ],
    members: ['far', 'soon', 'old', 'recent', 'filed'].map((t) => member(t, ANA, 'owner')),
    profiles,
    costs: [],
    savings: [],
    userId: ANA,
    now: NOW,
  })

  it('shelves upcoming first, then past, then archived', () => {
    expect(summaries.map((s) => s.trip.id)).toEqual(['soon', 'far', 'recent', 'old', 'filed'])
  })

  it('is stable when re-sorted', () => {
    expect(sortTrips(summaries).map((s) => s.trip.id)).toEqual(summaries.map((s) => s.trip.id))
  })

  it('filters to one shelf at a time', () => {
    expect(filterTrips(summaries, 'upcoming').map((s) => s.trip.id)).toEqual(['soon', 'far'])
    expect(filterTrips(summaries, 'past').map((s) => s.trip.id)).toEqual(['recent', 'old'])
    expect(filterTrips(summaries, 'archived').map((s) => s.trip.id)).toEqual(['filed'])
    expect(filterTrips(summaries, 'all')).toHaveLength(5)
  })

  it('counts what is on each shelf', () => {
    expect(countByStatus(summaries)).toEqual({ upcoming: 2, past: 2, archived: 1 })
  })
})

describe('rememberedTrip', () => {
  const summaries = summariseTrips({
    trips: [trip({ id: 'lisbon' })],
    members: [member('lisbon', ANA, 'owner')],
    profiles,
    costs: [],
    savings: [],
    userId: ANA,
    now: NOW,
  })

  it('reopens a trip that is still yours', () => {
    expect(rememberedTrip(summaries, 'lisbon')?.trip.id).toBe('lisbon')
  })

  it('never reopens a trip that is no longer reachable', () => {
    // Left, deleted, or simply never theirs — all look the same from here.
    expect(rememberedTrip(summaries, 'oslo')).toBeNull()
    expect(rememberedTrip(summaries, null)).toBeNull()
    expect(rememberedTrip([], 'lisbon')).toBeNull()
  })
})
