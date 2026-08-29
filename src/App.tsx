import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { parseJoinToken, useHashRoute } from './lib/useHashRoute'
import { formatDate } from './lib/format'
import { daysUntil } from './lib/calc'
import type { Trip } from './lib/types'
import { useSession } from './state/useSession'
import { useTripData } from './state/useTripData'
import { Banner } from './components/ui'
import { PlanScreen } from './screens/Plan'
import { BudgetScreen } from './screens/Budget'
import { SavingsScreen } from './screens/Savings'
import { MembersScreen } from './screens/Members'
import { SignInScreen } from './screens/SignIn'
import { CreateTripScreen } from './screens/CreateTrip'
import { JoinScreen, PENDING_INVITE_KEY } from './screens/Join'

const TABS = [
  { path: '/plan', label: 'Plan' },
  { path: '/budget', label: 'Budget' },
  { path: '/savings', label: 'Savings' },
  { path: '/members', label: 'Members' },
] as const

const SELECTED_TRIP_KEY = 'wego.tripId'

function readStored(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeStored(key: string, value: string | null) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value) } catch { /* private mode */ }
}

export default function App() {
  const { session, loading: authLoading, userId } = useSession()
  const [route, navigate] = useHashRoute()
  const [trips, setTrips] = useState<Trip[] | null>(null)
  const [tripId, setTripId] = useState<string | null>(null)

  const loadTrips = useCallback(async () => {
    if (!userId) { setTrips(null); setTripId(null); return }
    const { data } = await supabase.from('trips').select('*').order('created_at')
    const rows = (data as Trip[]) ?? []
    setTrips(rows)
    setTripId((current) => {
      if (current && rows.some((t) => t.id === current)) return current
      const stored = readStored(SELECTED_TRIP_KEY)
      if (stored && rows.some((t) => t.id === stored)) return stored
      return rows[0]?.id ?? null
    })
  }, [userId])

  useEffect(() => { void loadTrips() }, [loadTrips])
  useEffect(() => { writeStored(SELECTED_TRIP_KEY, tripId) }, [tripId])

  // Finish a join that was interrupted by the emailed sign-in link.
  useEffect(() => {
    if (!userId || parseJoinToken(route)) return
    const pending = readStored(PENDING_INVITE_KEY)
    if (pending) navigate(`/join/${encodeURIComponent(pending)}`)
  }, [userId, route, navigate])

  const data = useTripData(tripId)

  if (!isSupabaseConfigured) return <SetupNotice />

  const joinToken = parseJoinToken(route)
  if (joinToken) {
    return (
      <JoinScreen
        token={joinToken}
        signedIn={Boolean(session)}
        onJoined={async (joinedTripId) => {
          setTripId(joinedTripId)
          await loadTrips()
          navigate('/plan')
        }}
        onCancel={() => {
          writeStored(PENDING_INVITE_KEY, null)
          navigate('/plan')
        }}
      />
    )
  }

  if (authLoading || (session && trips === null)) {
    return <div className="centered"><div className="card"><p className="muted">Loading…</p></div></div>
  }

  if (!session || !userId) return <SignInScreen />

  const signOut = async () => {
    writeStored(SELECTED_TRIP_KEY, null)
    writeStored(PENDING_INVITE_KEY, null)
    await supabase.auth.signOut()
    navigate('/plan')
  }

  if (trips !== null && trips.length === 0) {
    return (
      <CreateTripScreen
        onCreated={async (trip) => { setTripId(trip.id); await loadTrips(); navigate('/plan') }}
        onSignOut={signOut}
      />
    )
  }

  const tab = TABS.find((t) => t.path === route)?.path ?? '/plan'
  const trip = data.trip
  const countdown = trip ? daysUntil(trip.departure_date, new Date()) : 0

  return (
    <div className="app">
      <header className="topbar">
        <div className="grow col">
          <h1 className="truncate">{trip?.name ?? 'WeGo'}</h1>
          {trip ? (
            <span className="sub truncate">
              {trip.destination} · {formatDate(trip.departure_date)}
              {countdown >= 0 ? ` · ${countdown} ${countdown === 1 ? 'day' : 'days'} to go` : ' · departed'}
            </span>
          ) : null}
        </div>
        <button className="btn ghost small" onClick={() => void signOut()}>Sign out</button>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.path}
            aria-current={tab === t.path ? 'page' : undefined}
            onClick={() => navigate(t.path)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {trips && trips.length > 1 ? (
          <label className="field">
            Trip
            <select value={tripId ?? ''} onChange={(e) => setTripId(e.target.value)}>
              {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        ) : null}

        {data.error ? <Banner kind="error">{data.error}</Banner> : null}

        {data.loading || !trip ? (
          <p className="empty">Loading trip…</p>
        ) : tab === '/plan' ? (
          <PlanScreen data={data} userId={userId} />
        ) : tab === '/budget' ? (
          <BudgetScreen data={data} userId={userId} />
        ) : tab === '/savings' ? (
          <SavingsScreen data={data} userId={userId} />
        ) : (
          <MembersScreen data={data} userId={userId} />
        )}
      </main>
    </div>
  )
}

function SetupNotice() {
  return (
    <div className="centered">
      <div className="card">
        <div className="brand"><b>WeGo</b></div>
        <Banner kind="warn">Supabase is not configured yet.</Banner>
        <p className="small muted">
          Copy <code>.env.example</code> to <code>.env</code> and fill in{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> from your Supabase
          project, then restart the dev server. The README has the full walkthrough.
        </p>
      </div>
    </div>
  )
}
