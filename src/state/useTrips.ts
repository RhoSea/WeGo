import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { summariseTrips, type TripSummary } from '../lib/trips'
import type { Cost, Profile, SavingsEntry, Trip, TripMember } from '../lib/types'
import { errorMessage } from '../components/ui'

export interface TripsState {
  /** Null until the first load finishes, so "no trips" and "not loaded" differ. */
  summaries: TripSummary[] | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  /** Whether this person can still open a given trip. */
  has: (tripId: string | null) => boolean
}

/**
 * Everything the My Trips dashboard needs, in one pass.
 *
 * Each query is unfiltered on purpose: Row Level Security already narrows every
 * table to the trips this person belongs to, so asking for "my costs" and "my
 * savings" is a single round trip each rather than one per trip. `summariseTrips`
 * then groups the rows by trip, which is what keeps one journey's figures out of
 * another's card.
 */
export function useTrips(userId: string | null): TripsState {
  const [summaries, setSummaries] = useState<TripSummary[] | null>(null)
  const [loading, setLoading] = useState(Boolean(userId))
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const queued = useRef(false)
  const refreshRef = useRef<() => Promise<void>>(async () => {})

  const refresh = useCallback(async () => {
    if (!userId) return
    if (inFlight.current) { queued.current = true; return }
    inFlight.current = true
    try {
      const [tripRes, memberRes, profileRes, costRes, savingRes] = await Promise.all([
        supabase.from('trips').select('*'),
        supabase.from('trip_members').select('*').order('joined_at'),
        supabase.from('profiles').select('id, email, display_name'),
        supabase.from('costs').select('*'),
        supabase.from('savings_entries').select('*'),
      ])

      const failure = [tripRes, memberRes, profileRes, costRes, savingRes].find((r) => r.error)
      // Without this an unreachable database looked exactly like having no trips,
      // and offered to start one that could not be saved.
      if (failure?.error) throw failure.error

      setSummaries(
        summariseTrips({
          trips: (tripRes.data as Trip[]) ?? [],
          members: (memberRes.data as TripMember[]) ?? [],
          profiles: (profileRes.data as Profile[]) ?? [],
          costs: (costRes.data as Cost[]) ?? [],
          savings: (savingRes.data as SavingsEntry[]) ?? [],
          userId,
          now: new Date(),
        }),
      )
      setError(null)
    } catch (err) {
      setError(errorMessage(err, 'Could not load your trips.'))
    } finally {
      inFlight.current = false
      setLoading(false)
      if (queued.current) { queued.current = false; void refreshRef.current() }
    }
  }, [userId])

  refreshRef.current = refresh

  useEffect(() => {
    if (!userId) {
      setSummaries(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    void refresh()
  }, [userId, refresh])

  // Someone accepting an invitation, or an owner archiving from another device,
  // changes which trips are on the shelf. Refetching keeps the list honest.
  useEffect(() => {
    if (!userId) return
    const channel = supabase.channel(`trips:${userId}`)
    for (const table of ['trips', 'trip_members']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => { void refresh() })
    }
    channel.subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [userId, refresh])

  // Fallback for when realtime is unavailable (offline, blocked, sleeping tab).
  useEffect(() => {
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const has = useCallback(
    (tripId: string | null) =>
      Boolean(tripId && summaries?.some((s) => s.trip.id === tripId)),
    [summaries],
  )

  return useMemo(
    () => ({ summaries, loading, error, refresh, has }),
    [summaries, loading, error, refresh, has],
  )
}
