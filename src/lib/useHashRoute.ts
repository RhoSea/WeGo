import { useCallback, useEffect, useState } from 'react'

function currentHash(): string {
  return window.location.hash.replace(/^#/, '') || '/'
}

export function useHashRoute(): [string, (path: string) => void] {
  const [route, setRoute] = useState(currentHash)

  useEffect(() => {
    const onChange = () => setRoute(currentHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((path: string) => {
    window.location.hash = path
    setRoute(path)
  }, [])

  return [route, navigate]
}

/** The sections inside one trip. The dashboard and the join flow sit outside. */
export const TRIP_TABS = ['/plan', '/budget', '/savings', '/members', '/settings'] as const
export type TripTab = (typeof TRIP_TABS)[number]

export type Route =
  /** The My Trips dashboard. */
  | { kind: 'trips' }
  /** The blank-journal form. */
  | { kind: 'new' }
  /** One section of one trip. */
  | { kind: 'trip'; tripId: string; tab: TripTab }
  /** Someone opening an invitation link. */
  | { kind: 'join'; token: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Every trip screen carries its trip in the address, so which trip you are
 * looking at is never inferred from state left over from the last one, and a
 * link to a page inside a trip survives a reload.
 *
 * Anything unrecognised — including a trip id that is not a UUID at all — falls
 * back to the dashboard rather than guessing. An id that *is* a well-formed
 * UUID still proves nothing: the database decides whether it can be opened.
 */
export function parseRoute(hash: string): Route {
  const path = hash.startsWith('/') ? hash : `/${hash}`

  const join = /^\/join\/(.+)$/.exec(path)
  if (join) return { kind: 'join', token: decodeURIComponent(join[1]) }

  if (path === '/new') return { kind: 'new' }

  const trip = /^\/t\/([^/]+)(\/[^/]*)?$/.exec(path)
  if (trip && UUID.test(trip[1])) {
    const tab = TRIP_TABS.find((t) => t === trip[2]) ?? '/plan'
    return { kind: 'trip', tripId: trip[1].toLowerCase(), tab }
  }

  return { kind: 'trips' }
}

export function tripPath(tripId: string, tab: TripTab = '/plan'): string {
  return `/t/${tripId}${tab}`
}
