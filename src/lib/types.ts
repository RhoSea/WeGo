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

export interface Trip {
  id: string
  name: string
  destination: string
  departure_date: string
  currency: string
  created_by: string
  created_at: string
}

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
}

export interface TripMember {
  id: string
  trip_id: string
  user_id: string
  role: 'owner' | 'member'
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
  role: 'owner' | 'member'
}
