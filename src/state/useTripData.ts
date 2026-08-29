import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  Cost, MemberView, PlanItem, Profile, SavingsEntry, Trip, TripMember,
} from '../lib/types'

export interface TripData {
  trip: Trip | null
  members: MemberView[]
  memberIds: string[]
  planItems: PlanItem[]
  costs: Cost[]
  savings: SavingsEntry[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  nameFor: (userId: string | null) => string
}

function labelFor(profile: Profile | undefined, userId: string): string {
  if (profile?.display_name?.trim()) return profile.display_name.trim()
  if (profile?.email) return profile.email.split('@')[0]
  return `Member ${userId.slice(0, 6)}`
}

export function useTripData(tripId: string | null): TripData {
  const [trip, setTrip] = useState<Trip | null>(null)
  const [members, setMembers] = useState<MemberView[]>([])
  const [planItems, setPlanItems] = useState<PlanItem[]>([])
  const [costs, setCosts] = useState<Cost[]>([])
  const [savings, setSavings] = useState<SavingsEntry[]>([])
  const [loading, setLoading] = useState(Boolean(tripId))
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (!tripId || inFlight.current) return
    inFlight.current = true
    try {
      const [tripRes, memberRes, profileRes, planRes, costRes, savingRes] = await Promise.all([
        supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
        supabase.from('trip_members').select('*').eq('trip_id', tripId).order('joined_at'),
        supabase.from('profiles').select('id, email, display_name'),
        supabase.from('plan_items').select('*').eq('trip_id', tripId),
        supabase.from('costs').select('*').eq('trip_id', tripId).order('created_at'),
        supabase.from('savings_entries').select('*').eq('trip_id', tripId).order('entry_date', { ascending: false }),
      ])

      const failure = [tripRes, memberRes, profileRes, planRes, costRes, savingRes].find((r) => r.error)
      if (failure?.error) throw failure.error

      const profiles = new Map((profileRes.data as Profile[] ?? []).map((p) => [p.id, p]))

      setTrip((tripRes.data as Trip) ?? null)
      setMembers(
        ((memberRes.data as TripMember[]) ?? []).map((m) => ({
          userId: m.user_id,
          role: m.role,
          name: labelFor(profiles.get(m.user_id), m.user_id),
          email: profiles.get(m.user_id)?.email ?? null,
        })),
      )
      setPlanItems((planRes.data as PlanItem[]) ?? [])
      setCosts((costRes.data as Cost[]) ?? [])
      setSavings((savingRes.data as SavingsEntry[]) ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the trip.')
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [tripId])

  useEffect(() => {
    if (!tripId) {
      setTrip(null); setMembers([]); setPlanItems([]); setCosts([]); setSavings([])
      setLoading(false)
      return
    }
    setLoading(true)
    void refresh()
  }, [tripId, refresh])

  // Live updates from other devices. Refetching on any change keeps the
  // reducer trivial and always consistent with what RLS actually allows.
  useEffect(() => {
    if (!tripId) return
    const channel = supabase.channel(`trip:${tripId}`)
    for (const table of ['trip_members', 'plan_items', 'costs', 'savings_entries', 'trips']) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: table === 'trips' ? `id=eq.${tripId}` : `trip_id=eq.${tripId}` },
        () => { void refresh() },
      )
    }
    channel.subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [tripId, refresh])

  // Fallback for when realtime is unavailable (offline, blocked, sleeping tab).
  useEffect(() => {
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const memberIds = useMemo(() => members.map((m) => m.userId), [members])
  const nameFor = useCallback(
    (userId: string | null) =>
      (userId && members.find((m) => m.userId === userId)?.name) || 'Unknown',
    [members],
  )

  return { trip, members, memberIds, planItems, costs, savings, loading, error, refresh, nameFor }
}
