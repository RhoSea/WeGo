export const PLAN_STATUSES = ['idea', 'maybe', 'confirmed', 'booked'] as const
export type PlanStatus = (typeof PLAN_STATUSES)[number]

export const COST_CATEGORIES = [
  'flights',
  'accommodation',
  'transportation',
  'food',
  'activities',
  'buffer',
  'other',
] as const
export type CostCategory = (typeof COST_CATEGORIES)[number]

export type SplitType = 'equal' | 'personal'

/** The currencies a trip can be budgeted in. Amounts are never converted. */
export const CURRENCIES = [
  'EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'CAD', 'AUD', 'NZD', 'JPY',
] as const

export interface Trip {
  id: string
  name: string
  destination: string
  departure_date: string
  currency: string
  created_by: string
  created_at: string
  /** Set when the owner files the trip away; null while it is still on the desk. */
  archived_at: string | null
}

export type TripRole = 'owner' | 'member'

/**
 * Where a trip sits in the collection. Archived is stored on the trip;
 * upcoming and past are read off the departure date, so a trip moves between
 * them on its own as the date passes.
 */
export const TRIP_STATUSES = ['upcoming', 'past', 'archived'] as const
export type TripStatus = (typeof TRIP_STATUSES)[number]

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
}

export interface TripMember {
  id: string
  trip_id: string
  user_id: string
  role: TripRole
  joined_at: string
}

export interface Invitation {
  id: string
  trip_id: string
  token: string
  label: string | null
  created_by: string
  created_at: string
  expires_at: string
  accepted_at: string | null
  accepted_by: string | null
}

export interface PlanItem {
  id: string
  trip_id: string
  title: string
  item_date: string | null
  link: string | null
  note: string | null
  status: PlanStatus
  created_by: string
  created_at: string
  updated_at: string
}

export interface Cost {
  id: string
  trip_id: string
  description: string
  category: CostCategory
  estimated_amount: number
  actual_amount: number | null
  note: string | null
  split_type: SplitType
  assigned_to: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface SavingsEntry {
  id: string
  trip_id: string
  user_id: string
  amount: number
  entry_date: string
  note: string | null
  created_at: string
}

/** A trip member joined with the profile used to label them in the UI. */
export interface MemberView {
  userId: string
  name: string
  email: string | null
  role: TripRole
}
