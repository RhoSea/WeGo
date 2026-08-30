import type { Cost, CostCategory, SavingsEntry } from './types'
import { COST_CATEGORIES } from './types'

const MS_PER_DAY = 86_400_000
const DAYS_PER_MONTH = 30.4375

/** Round to cents. Shares stay unrounded internally so per-member sums add up. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Calendar-day number for a 'YYYY-MM-DD' string, timezone-independent. */
export function dayNumberFromISODate(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1) / MS_PER_DAY
}

/** Calendar-day number for "today" in the viewer's own timezone. */
export function dayNumberFromDate(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / MS_PER_DAY
}

export function daysUntil(targetISODate: string, now: Date): number {
  return dayNumberFromISODate(targetISODate) - dayNumberFromDate(now)
}

export interface CategoryTotal {
  estimated: number
  actual: number
}

export interface BudgetTotals {
  estimated: number
  actual: number
  byCategory: Record<CostCategory, CategoryTotal>
}

export function computeBudgetTotals(costs: readonly Cost[]): BudgetTotals {
  const byCategory = Object.fromEntries(
    COST_CATEGORIES.map((c) => [c, { estimated: 0, actual: 0 }]),
  ) as Record<CostCategory, CategoryTotal>

  let estimated = 0
  let actual = 0

  for (const cost of costs) {
    const est = cost.estimated_amount ?? 0
    const act = cost.actual_amount ?? 0
    estimated += est
    actual += act
    byCategory[cost.category].estimated += est
    byCategory[cost.category].actual += act
  }

  return { estimated, actual, byCategory }
}

export interface MemberShare {
  estimated: number
  actual: number
}

/**
 * Splits every cost across the members who are in the trip *right now*, so
 * shares re-divide automatically as friends join. Equal costs are divided by
 * the member count; personal costs land entirely on the assignee. A personal
 * cost pointing at someone who is no longer a member stays in the trip totals
 * but is not charged to anyone.
 */
export function computeMemberShares(
  costs: readonly Cost[],
  memberIds: readonly string[],
): Record<string, MemberShare> {
  const shares: Record<string, MemberShare> = {}
  for (const id of memberIds) shares[id] = { estimated: 0, actual: 0 }

  const memberCount = memberIds.length
  if (memberCount === 0) return shares

  for (const cost of costs) {
    const est = cost.estimated_amount ?? 0
    const act = cost.actual_amount ?? 0

    if (cost.split_type === 'personal') {
      const target = cost.assigned_to && shares[cost.assigned_to]
      if (!target) continue
      target.estimated += est
      target.actual += act
    } else {
      for (const id of memberIds) {
        shares[id].estimated += est / memberCount
        shares[id].actual += act / memberCount
      }
    }
  }

  return shares
}

/** One member's slice of a cost that everybody splits. */
export function equalShare(amount: number, memberCount: number): number {
  return memberCount > 0 ? amount / memberCount : 0
}

export function sumSavings(entries: readonly SavingsEntry[], userId: string): number {
  let total = 0
  for (const entry of entries) if (entry.user_id === userId) total += entry.amount ?? 0
  return total
}

export interface SavingsProgress {
  target: number
  saved: number
  remaining: number
  /** 0..1, clamped. 1 when there is nothing to save. */
  progress: number
  onTrack: boolean
  departed: boolean
  daysUntilDeparture: number
  /** null once the departure date has passed — show a warning instead. */
  weeklyNeeded: number | null
  monthlyNeeded: number | null
}

export function computeSavingsProgress(input: {
  target: number
  saved: number
  departureDate: string
  savingStartDate: string
  now?: Date
}): SavingsProgress {
  const now = input.now ?? new Date()
  const target = Math.max(0, input.target)
  const saved = Math.max(0, input.saved)
  const remaining = Math.max(0, target - saved)
  const progress = target <= 0 ? 1 : Math.min(1, saved / target)

  const today = dayNumberFromDate(now)
  const departureDay = dayNumberFromISODate(input.departureDate)
  const startDay = dayNumberFromISODate(input.savingStartDate.slice(0, 10))
  const daysUntilDeparture = departureDay - today
  const departed = daysUntilDeparture < 0

  // Expect savings to accumulate evenly between trip creation and departure.
  const windowDays = departureDay - startDay
  const elapsedFraction =
    windowDays <= 0 ? 1 : Math.min(1, Math.max(0, (today - startDay) / windowDays))
  const expectedBySoFar = target * elapsedFraction
  const onTrack = target <= 0 || saved + 0.005 >= expectedBySoFar

  if (departed) {
    return {
      target, saved, remaining, progress, onTrack, departed,
      daysUntilDeparture, weeklyNeeded: null, monthlyNeeded: null,
    }
  }

  // Always at least one period left, so "3 days to go" asks for the full
  // remainder this week rather than an inflated weekly rate.
  const weeksLeft = Math.max(1, Math.ceil(daysUntilDeparture / 7))
  const monthsLeft = Math.max(1, Math.ceil(daysUntilDeparture / DAYS_PER_MONTH))

  return {
    target, saved, remaining, progress, onTrack, departed, daysUntilDeparture,
    weeklyNeeded: remaining / weeksLeft,
    monthlyNeeded: remaining / monthsLeft,
  }
}

export interface TripFunding {
  /** Everything the trip is estimated to cost. */
  target: number
  /** Everything the whole group has put aside so far. */
  saved: number
  remaining: number
  /**
   * 0..1, clamped. Zero while nothing is budgeted yet, so a brand-new trip
   * reads as "not started" rather than fully funded.
   */
  progress: number
}

/** How far the group as a whole has travelled towards paying for the trip. */
export function computeTripFunding(
  costs: readonly Cost[],
  savings: readonly SavingsEntry[],
): TripFunding {
  const target = computeBudgetTotals(costs).estimated
  let saved = 0
  for (const entry of savings) saved += entry.amount ?? 0
  return {
    target,
    saved,
    remaining: Math.max(0, target - saved),
    progress: target <= 0 ? 0 : Math.min(1, Math.max(0, saved / target)),
  }
}
