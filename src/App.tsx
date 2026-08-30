import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { parseJoinToken, useHashRoute } from './lib/useHashRoute'
import { computeTripFunding, daysUntil } from './lib/calc'
import type { Trip } from './lib/types'
import { useSession } from './state/useSession'
import { useTripData } from './state/useTripData'
import { Banner, SkeletonCard, errorMessage } from './components/ui'
import { Nav, TABS } from './components/Nav'
import { TripHeader } from './components/TripHeader'
import { PaperPlane, Wordmark } from './components/art'
import { PlanScreen } from './screens/Plan'
import { BudgetScreen } from './screens/Budget'
import { SavingsScreen } from './screens/Savings'
import { MembersScreen } from './screens/Members'
import { SignInScreen } from './screens/SignIn'
import { CreateTripScreen } from './screens/CreateTrip'
import { JoinScreen, PENDING_INVITE_KEY } from './screens/Join'

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
  const [tripsError, setTripsError] = useState<string | null>(null)
  const [tripId, setTripId] = useState<string | null>(null)

  const loadTrips = useCallback(async () => {
    if (!userId) { setTrips(null); setTripId(null); return }
    const { data, error } = await supabase.from('trips').select('*').order('created_at')
    // Without this an unreachable database looked exactly like having no trips,
    // and offered to start one that could not be saved.
    if (error) { setTripsError(errorMessage(error, 'Could not load your trips.')); return }
    setTripsError(null)
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

  // Finish a join that was interrupted by the trip through Google sign-in.
  useEffect(() => {
    if (!userId || parseJoinToken(route)) return
    const pending = readStored(PENDING_INVITE_KEY)
    if (pending) navigate(`/join/${encodeURIComponent(pending)}`)
  }, [userId, route, navigate])

  const data = useTripData(tripId)

  if (!isSupabaseConfigured) return <SetupNotice />

  if (authLoading) return <PaperLoader note="Unfolding the map…" />

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

  if (!session || !userId) return <SignInScreen />

  const signOut = async () => {
    writeStored(SELECTED_TRIP_KEY, null)
    writeStored(PENDING_INVITE_KEY, null)
    await supabase.auth.signOut()
    navigate('/plan')
  }

  if (tripsError) {
    return (
      <div className="centered">
        <div className="card cut taped">
          <Wordmark />
          <Banner kind="error">{tripsError}</Banner>
          <p className="small muted">
            The trip lives in the cloud, so this usually means the connection dropped. Your data is
            safe.
          </p>
          <button className="btn primary block" onClick={() => void loadTrips()}>Try again</button>
          <button className="btn ghost block small" onClick={() => void signOut()}>Sign out</button>
        </div>
      </div>
    )
  }

  if (trips === null) return <PaperLoader note="Finding your trips…" />

  if (trips.length === 0) {
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
  const funding = computeTripFunding(data.costs, data.savings)

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-inner">
          <Wordmark />
          <Nav current={tab} onNavigate={navigate} variant="desktop" />
          <div className="masthead-actions">
            <button className="btn ghost small" onClick={() => void signOut()}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="page">
        {trips.length > 1 ? (
          <label className="trip-picker">
            <span className="kicker">Journal</span>
            <select
              value={tripId ?? ''}
              onChange={(e) => setTripId(e.target.value)}
              aria-label="Choose which trip to view"
            >
              {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        ) : null}

        {data.error ? <Banner kind="error">{data.error}</Banner> : null}

        {data.loading || !trip ? (
          <>
            <div className="card" aria-hidden="true">
              <div className="skel skel-title" />
              <div className="skel skel-line mid" />
              <div className="skel skel-line" style={{ height: 74 }} />
            </div>
            <SkeletonCard />
            <p className="center muted small" role="status">Opening the journal…</p>
          </>
        ) : (
          <>
            <TripHeader trip={trip} members={data.members} funding={funding} countdown={countdown} />
            {tab === '/plan' ? (
              <PlanScreen data={data} userId={userId} />
            ) : tab === '/budget' ? (
              <BudgetScreen data={data} userId={userId} />
            ) : tab === '/savings' ? (
              <SavingsScreen data={data} userId={userId} />
            ) : (
              <MembersScreen data={data} userId={userId} />
            )}
          </>
        )}
      </main>

      <Nav current={tab} onNavigate={navigate} variant="mobile" />
    </div>
  )
}

/** The screen you see for a heartbeat before anything has loaded. */
function PaperLoader({ note }: { note: string }) {
  return (
    <div className="centered">
      <div className="card cut center loader-card" role="status">
        <span className="loader-plane"><PaperPlane size={30} /></span>
        <p className="hand">{note}</p>
      </div>
    </div>
  )
}

function SetupNotice() {
  return (
    <div className="centered">
      <div className="card cut taped">
        <Wordmark />
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
