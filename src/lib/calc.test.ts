import { describe, expect, it } from 'vitest'
import {
  computeBudgetTotals,
  computeMemberShares,
  computeSavingsProgress,
  daysUntil,
  round2,
  sumSavings,
} from './calc'
import type { Cost, SavingsEntry } from './types'

const cost = (over: Partial<Cost>): Cost => ({
  id: crypto.randomUUID(),
  trip_id: 'trip',
  description: 'x',
  category: 'other',
  estimated_amount: 0,
  actual_amount: null,
  note: null,
  split_type: 'equal',
  assigned_to: null,
  created_by: 'a',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
})

describe('round2', () => {
  it('rounds half up at cent precision', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.675)).toBe(2.68)
    expect(round2(0.1 + 0.2)).toBe(0.3)
  })
})

describe('computeBudgetTotals', () => {
  it('totals estimated, actual and per-category amounts', () => {
    const totals = computeBudgetTotals([
      cost({ category: 'flights', estimated_amount: 400, actual_amount: 430 }),
      cost({ category: 'flights', estimated_amount: 200 }),
      cost({ category: 'food', estimated_amount: 150, actual_amount: 90 }),
    ])

    expect(totals.estimated).toBe(750)
    expect(totals.actual).toBe(520)
    expect(totals.byCategory.flights).toEqual({ estimated: 600, actual: 430 })
    expect(totals.byCategory.food).toEqual({ estimated: 150, actual: 90 })
    expect(totals.byCategory.buffer).toEqual({ estimated: 0, actual: 0 })
  })

  it('treats a missing actual cost as zero, not as the estimate', () => {
    expect(computeBudgetTotals([cost({ estimated_amount: 100 })]).actual).toBe(0)
  })

  it('returns zeroes for an empty trip', () => {
    const totals = computeBudgetTotals([])
    expect(totals.estimated).toBe(0)
    expect(totals.actual).toBe(0)
  })
})

describe('computeMemberShares', () => {
  it('divides an equal cost by the current member count', () => {
    const costs = [cost({ estimated_amount: 900, actual_amount: 600 })]

    const two = computeMemberShares(costs, ['a', 'b'])
    expect(two.a).toEqual({ estimated: 450, actual: 300 })
    expect(two.b).toEqual({ estimated: 450, actual: 300 })

    // A third friend joins: the same cost re-divides with no data change.
    const three = computeMemberShares(costs, ['a', 'b', 'c'])
    expect(round2(three.a.estimated)).toBe(300)
    expect(round2(three.c.estimated)).toBe(300)
  })

  it('assigns a personal cost entirely to one member', () => {
    const shares = computeMemberShares(
      [cost({ split_type: 'personal', assigned_to: 'b', estimated_amount: 250, actual_amount: 260 })],
      ['a', 'b', 'c'],
    )
    expect(shares.a).toEqual({ estimated: 0, actual: 0 })
    expect(shares.b).toEqual({ estimated: 250, actual: 260 })
    expect(shares.c).toEqual({ estimated: 0, actual: 0 })
  })

  it('keeps the sum of all shares equal to the trip total', () => {
    const costs = [
      cost({ estimated_amount: 1000 }),
      cost({ estimated_amount: 100, split_type: 'personal', assigned_to: 'a' }),
      cost({ estimated_amount: 55.55 }),
    ]
    const members = ['a', 'b', 'c']
    const shares = computeMemberShares(costs, members)
    const summed = members.reduce((acc, id) => acc + shares[id].estimated, 0)

    expect(round2(summed)).toBe(round2(computeBudgetTotals(costs).estimated))
  })

  it('divides amounts that do not split evenly without losing cents', () => {
    const shares = computeMemberShares([cost({ estimated_amount: 100 })], ['a', 'b', 'c'])
    const summed = shares.a.estimated + shares.b.estimated + shares.c.estimated
    expect(round2(summed)).toBe(100)
    expect(round2(shares.a.estimated)).toBe(33.33)
  })

  it('leaves a cost assigned to a non-member uncharged', () => {
    const shares = computeMemberShares(
      [cost({ split_type: 'personal', assigned_to: 'ghost', estimated_amount: 80 })],
      ['a', 'b'],
    )
    expect(shares.a.estimated).toBe(0)
    expect(shares.b.estimated).toBe(0)
  })

  it('returns no shares when the trip has no members yet', () => {
    expect(computeMemberShares([cost({ estimated_amount: 100 })], [])).toEqual({})
  })

  it('scales to an arbitrary group size', () => {
    const members = Array.from({ length: 17 }, (_, i) => `m${i}`)
    const shares = computeMemberShares([cost({ estimated_amount: 1700 })], members)
    expect(Object.keys(shares)).toHaveLength(17)
    for (const id of members) expect(round2(shares[id].estimated)).toBe(100)
  })
})

describe('sumSavings', () => {
  const entry = (user_id: string, amount: number): SavingsEntry => ({
    id: crypto.randomUUID(),
    trip_id: 'trip',
    user_id,
    amount,
    entry_date: '2026-02-01',
    note: null,
    created_at: '2026-02-01T00:00:00Z',
  })

  it('adds up only the requested member entries', () => {
    const entries = [entry('a', 100), entry('b', 50), entry('a', 25.5)]
    expect(sumSavings(entries, 'a')).toBe(125.5)
    expect(sumSavings(entries, 'b')).toBe(50)
    expect(sumSavings(entries, 'c')).toBe(0)
  })
})

describe('daysUntil', () => {
  it('counts whole calendar days regardless of time of day', () => {
    expect(daysUntil('2026-09-08', new Date('2026-09-01T23:30:00'))).toBe(7)
    expect(daysUntil('2026-09-01', new Date('2026-09-01T06:00:00'))).toBe(0)
    expect(daysUntil('2026-08-30', new Date('2026-09-01T06:00:00'))).toBe(-2)
  })
})

describe('computeSavingsProgress', () => {
  const base = {
    target: 1200,
    saved: 300,
    departureDate: '2026-12-01',
    savingStartDate: '2026-06-01T00:00:00Z',
  }

  it('reports target, saved and remaining', () => {
    const p = computeSavingsProgress({ ...base, now: new Date('2026-07-01T12:00:00') })
    expect(p.target).toBe(1200)
    expect(p.saved).toBe(300)
    expect(p.remaining).toBe(900)
    expect(round2(p.progress)).toBe(0.25)
  })

  it('never reports a negative remainder or over-full progress bar', () => {
    const p = computeSavingsProgress({
      ...base, saved: 1500, now: new Date('2026-07-01T12:00:00'),
    })
    expect(p.remaining).toBe(0)
    expect(p.progress).toBe(1)
    expect(p.weeklyNeeded).toBe(0)
    expect(p.monthlyNeeded).toBe(0)
  })

  it('derives weekly and monthly rates from the time left', () => {
    // 2026-11-01 -> 2026-12-01 is 30 days: 5 weeks, 1 month.
    const p = computeSavingsProgress({ ...base, now: new Date('2026-11-01T09:00:00') })
    expect(p.daysUntilDeparture).toBe(30)
    expect(round2(p.weeklyNeeded!)).toBe(180)
    expect(round2(p.monthlyNeeded!)).toBe(900)
  })

  it('asks for the whole remainder when under a week is left', () => {
    const p = computeSavingsProgress({ ...base, now: new Date('2026-11-29T09:00:00') })
    expect(p.daysUntilDeparture).toBe(2)
    expect(p.weeklyNeeded).toBe(900)
    expect(p.monthlyNeeded).toBe(900)
  })

  it('withholds a savings rate once departure has passed', () => {
    const p = computeSavingsProgress({ ...base, now: new Date('2026-12-02T09:00:00') })
    expect(p.departed).toBe(true)
    expect(p.weeklyNeeded).toBeNull()
    expect(p.monthlyNeeded).toBeNull()
  })

  it('is not departed on the departure day itself', () => {
    const p = computeSavingsProgress({ ...base, now: new Date('2026-12-01T09:00:00') })
    expect(p.departed).toBe(false)
    expect(p.daysUntilDeparture).toBe(0)
    expect(p.weeklyNeeded).toBe(900)
  })

  it('marks a member on track when savings keep pace with the window', () => {
    // Halfway through a 183-day window, half of the target is on pace.
    const halfway = new Date('2026-08-31T12:00:00')
    expect(computeSavingsProgress({ ...base, saved: 600, now: halfway }).onTrack).toBe(true)
    expect(computeSavingsProgress({ ...base, saved: 200, now: halfway }).onTrack).toBe(false)
  })

  it('treats a member with nothing to save as on track', () => {
    const p = computeSavingsProgress({
      ...base, target: 0, saved: 0, now: new Date('2026-11-01T09:00:00'),
    })
    expect(p.progress).toBe(1)
    expect(p.onTrack).toBe(true)
    expect(p.remaining).toBe(0)
  })

  it('requires the full target when the trip was created after departure', () => {
    const p = computeSavingsProgress({
      ...base,
      savingStartDate: '2026-12-05T00:00:00Z',
      now: new Date('2026-11-01T09:00:00'),
    })
    expect(p.onTrack).toBe(false)
  })
})
