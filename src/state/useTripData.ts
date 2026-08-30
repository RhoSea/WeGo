import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { memberLabel } from '../lib/trips'
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
  /** The viewer's own role in this trip, once it has loaded. */
  role: 'owner' | 'member' | null
}

interface LoadedTrip {
  trip: Trip | null
  members: MemberView[]
  planItems: PlanItem[]
  costs: Cost[]
  savings: SavingsEntry[]
}

const EMPTY: LoadedTrip = { trip: null, members: [], planItems: [], costs: [], savings: [] }

export function useTripData(tripId: string | null, userId: string | null): TripData {
  const [state, setState] = useState(EMPTY)
  const [loading, setLoading] = useState(Boolean(tripId))
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const queued = useRef(false)

  // Read during render so an in-flight response can tell whether the trip it
  // was fetched for is still the one on screen.
  const openTripId = useRef(tripId)
  openTripId.current = tripId

  const refresh = useCallback(async () => {
    if (!tripId) return
    // A change arriving mid-fetch schedules one more pass rather than being lost.
    if (inFlight.current) { queued.current = true; return }
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

      // Someone switched trips while this was in the air. Dropping it is what
      // stops the trip you just left from flashing up inside the one you opened.
      if (openTripId.current !== tripId) return

      const failure = [tripRes, memberRes, profileRes, planRes, costRes, savingRes].find((r) => r.error)
      if (failure?.error) throw failure.error

      const profiles = new Map((profileRes.data as Profile[] ?? []).map((p) => [p.id, p]))

      setState({
        trip: (tripRes.data as Trip) ?? null,
        members: ((memberRes.data as TripMember[]) ?? []).map((m) => ({
          userId: m.user_id,
          role: m.role,
          name: memberLabel(profiles.get(m.user_id), m.user_id),
          email: profiles.get(m.user_id)?.email ?? null,
        })),
        planItems: (planRes.data as PlanItem[]) ?? [],
        costs: (costRes.data as Cost[]) ?? [],
        savings: (savingRes.data as SavingsEntry[]) ?? [],
      })
      setError(null)
    } catch (err) {
      if (openTripId.current === tripId) {
        setError(err instanceof Error ? err.message : 'Could not load the trip.')
      }
    } finally {
      inFlight.current = false
      if (queued.current) { queued.current = false; void refreshRef.current() }
      else if (openTripId.current === tripId) setLoading(false)
    }
  }, [tripId])

  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  // Switching trips empties the screen before the new one is asked for, so no
  // figure on the page has ever been computed from two different trips at once.
  useEffect(() => {
    setState(EMPTY)
    setError(null)
    if (!tripId) { setLoading(false); return }
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

  const { trip, members, planItems, costs, savings } = state
  const memberIds = useMemo(() => members.map((m) => m.userId), [members])
  const nameFor = useCallback(
    (id: string | null) => (id && members.find((m) => m.userId === id)?.name) || 'Unknown',
    [members],
  )
  const role = useMemo(
    () => members.find((m) => m.userId === userId)?.role ?? null,
    [members, userId],
  )

  return {
    trip, members, memberIds, planItems, costs, savings, loading, error, refresh, nameFor, role,
  }
}
