import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { parseRoute, tripPath, useHashRoute, type TripTab } from './lib/useHashRoute'
import { computeTripFunding, daysUntil } from './lib/calc'
import { useSession } from './state/useSession'
import { useTripData } from './state/useTripData'
import { useTrips } from './state/useTrips'
import { Banner, SkeletonCard } from './components/ui'
import { Nav } from './components/Nav'
import { TripHeader } from './components/TripHeader'
import { TripSwitcher } from './components/TripSwitcher'
import { PaperPlane, Wordmark } from './components/art'
import { PlanScreen } from './screens/Plan'
import { BudgetScreen } from './screens/Budget'
import { SavingsScreen } from './screens/Savings'
import { MembersScreen } from './screens/Members'
import { SignInScreen } from './screens/SignIn'
import { CreateTripScreen } from './screens/CreateTrip'
import { TripsScreen } from './screens/Trips'
import { TripSettingsScreen } from './screens/TripSettings'
import { JoinScreen, PENDING_INVITE_KEY } from './screens/Join'

/** The trip to reopen next time. Only ever a hint — access is checked first. */
const LAST_TRIP_KEY = 'wego.tripId'

function readStored(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeStored(key: string, value: string | null) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value) } catch { /* private mode */ }
}

export default function App() {
  const { session, loading: authLoading, userId } = useSession()
  const [route, navigate] = useHashRoute()
  const trips = useTrips(userId)
  const [lastOpenedId, setLastOpenedId] = useState<string | null>(() => readStored(LAST_TRIP_KEY))
  const [lostTrip, setLostTrip] = useState<string | null>(null)

  const parsed = useMemo(() => parseRoute(route), [route])
  const routeTripId = parsed.kind === 'trip' ? parsed.tripId : null

  // The trip in the address is the only trip the screens below ever read from.
  const data = useTripData(routeTripId, userId)

  const openTrip = useCallback(
    (tripId: string, tab: TripTab = '/plan') => { navigate(tripPath(tripId, tab)) },
    [navigate],
  )

  // Remember where you were, but only ever as a name to look up later.
  useEffect(() => {
    if (!routeTripId) return
    writeStored(LAST_TRIP_KEY, routeTripId)
    setLastOpenedId(routeTripId)
  }, [routeTripId])

  // A trip you left, or one the owner deleted, must not reopen — from the
  // address bar or from the remembered id.
  useEffect(() => {
    if (!userId || trips.summaries === null) return
    if (lastOpenedId && !trips.has(lastOpenedId)) {
      writeStored(LAST_TRIP_KEY, null)
      setLastOpenedId(null)
    }
    if (routeTripId && !trips.has(routeTripId)) {
      setLostTrip(routeTripId)
      navigate('/trips')
    }
  }, [userId, trips.summaries, trips.has, lastOpenedId, routeTripId, navigate])

  useEffect(() => { if (routeTripId) setLostTrip(null) }, [routeTripId])

  // Finish a join that was interrupted by the trip through Google sign-in.
  useEffect(() => {
    if (!userId || parsed.kind === 'join') return
    const pending = readStored(PENDING_INVITE_KEY)
    if (pending) navigate(`/join/${encodeURIComponent(pending)}`)
  }, [userId, parsed.kind, navigate])

  if (!isSupabaseConfigured) return <SetupNotice />

  if (authLoading) return <PaperLoader note="Unfolding the map…" />

  if (parsed.kind === 'join') {
    return (
      <JoinScreen
        token={parsed.token}
        signedIn={Boolean(session)}
        onJoined={async (joinedTripId) => {
          await trips.refresh()
          openTrip(joinedTripId)
        }}
        onCancel={() => {
          writeStored(PENDING_INVITE_KEY, null)
          navigate('/trips')
        }}
      />
    )
  }

  if (!session || !userId) return <SignInScreen />

  const signOut = async () => {
    writeStored(LAST_TRIP_KEY, null)
    writeStored(PENDING_INVITE_KEY, null)
    await supabase.auth.signOut()
    navigate('/trips')
  }

  if (parsed.kind === 'new') {
    return (
      <CreateTripScreen
        onCreated={async (trip) => { await trips.refresh(); openTrip(trip.id) }}
        onCancel={() => navigate('/trips')}
        canCancel={(trips.summaries?.length ?? 0) > 0}
        onSignOut={signOut}
      />
    )
  }

  const summaries = trips.summaries ?? []
  const current = routeTripId ? summaries.find((s) => s.trip.id === routeTripId) ?? null : null

  const shell = (children: ReactNode, tab: TripTab | null) => (
    <div className="app">
      <header className="masthead">
        <div className="masthead-inner">
          <button className="wordmark-link" onClick={() => navigate('/trips')} aria-label="WeGo — my trips">
            <Wordmark />
          </button>
          {routeTripId ? (
            <TripSwitcher
              current={current}
              summaries={summaries}
              // Switching lands on the same section of the other trip, except
              // settings, which belongs to the trip you were managing.
              onSelect={(id) => openTrip(id, !tab || tab === '/settings' ? '/plan' : tab)}
              onSeeAll={() => navigate('/trips')}
              onCreate={() => navigate('/new')}
            />
          ) : null}
          {routeTripId ? (
            <Nav
              current={tab ?? ''}
              onNavigate={(next) => openTrip(routeTripId, next as TripTab)}
              variant="desktop"
            />
          ) : null}
          <div className="masthead-actions">
            <button className="btn ghost small" onClick={() => void signOut()}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="page">{children}</main>

      {routeTripId ? (
        <Nav
          current={tab ?? ''}
          onNavigate={(next) => openTrip(routeTripId, next as TripTab)}
          variant="mobile"
        />
      ) : null}
    </div>
  )

  if (parsed.kind === 'trips') {
    return shell(
      <>
        {lostTrip ? (
          <Banner kind="warn">
            That trip is no longer open to you. It may have been deleted, or you may have left it.
          </Banner>
        ) : null}
        <TripsScreen
          summaries={trips.summaries}
          loading={trips.loading}
          error={trips.error}
          lastOpenedId={lastOpenedId}
          onOpen={(id) => openTrip(id)}
          onManage={(id) => openTrip(id, '/settings')}
          onCreate={() => navigate('/new')}
          onRetry={() => void trips.refresh()}
        />
      </>,
      null,
    )
  }

  // From here on a trip is open. Everything below reads only from `data`,
  // which is keyed to the trip in the address.
  const tab = parsed.tab
  const trip = data.trip
  const countdown = trip ? daysUntil(trip.departure_date, new Date()) : 0
  const funding = computeTripFunding(data.costs, data.savings)

  return shell(
    <>
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
          <TripHeader
            trip={trip}
            members={data.members}
            funding={funding}
            countdown={countdown}
            role={data.role}
            onManage={() => openTrip(trip.id, '/settings')}
          />
          {tab === '/plan' ? (
            <PlanScreen data={data} userId={userId} />
          ) : tab === '/budget' ? (
            <BudgetScreen data={data} userId={userId} />
          ) : tab === '/savings' ? (
            <SavingsScreen data={data} userId={userId} />
          ) : tab === '/members' ? (
            <MembersScreen data={data} userId={userId} />
          ) : (
            <TripSettingsScreen
              data={data}
              onChanged={() => void trips.refresh()}
              onGoToMembers={() => openTrip(trip.id, '/members')}
              onLeft={async () => { navigate('/trips'); await trips.refresh() }}
              onDeleted={async () => { navigate('/trips'); await trips.refresh() }}
            />
          )}
        </>
      )}
    </>,
    tab,
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
