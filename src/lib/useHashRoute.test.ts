import { describe, expect, it } from 'vitest'
import { parseRoute, tripPath } from './useHashRoute'

const TRIP = '6f1c2b7e-1111-4222-8333-444455556666'

describe('parseRoute', () => {
  it('lands on the dashboard by default', () => {
    expect(parseRoute('/')).toEqual({ kind: 'trips' })
    expect(parseRoute('/trips')).toEqual({ kind: 'trips' })
    expect(parseRoute('')).toEqual({ kind: 'trips' })
  })

  it('carries the trip and the section it is open at', () => {
    expect(parseRoute(`/t/${TRIP}/budget`)).toEqual({ kind: 'trip', tripId: TRIP, tab: '/budget' })
    expect(parseRoute(`/t/${TRIP}/settings`)).toEqual({ kind: 'trip', tripId: TRIP, tab: '/settings' })
  })

  it('opens a trip at the plan when no section is named', () => {
    expect(parseRoute(`/t/${TRIP}`)).toEqual({ kind: 'trip', tripId: TRIP, tab: '/plan' })
    expect(parseRoute(`/t/${TRIP}/`)).toEqual({ kind: 'trip', tripId: TRIP, tab: '/plan' })
    expect(parseRoute(`/t/${TRIP}/nonsense`)).toEqual({ kind: 'trip', tripId: TRIP, tab: '/plan' })
  })

  it('sends a mangled trip id back to the dashboard rather than guessing', () => {
    // Never an access decision — only a refusal to act on nonsense. Access is
    // settled by Row Level Security when the trip is asked for.
    expect(parseRoute('/t/not-a-trip/plan')).toEqual({ kind: 'trips' })
    expect(parseRoute('/t//plan')).toEqual({ kind: 'trips' })
    expect(parseRoute('/t/1/plan')).toEqual({ kind: 'trips' })
    expect(parseRoute(`/t/${TRIP}/plan/extra`)).toEqual({ kind: 'trips' })
  })

  it('reads an invitation token, so a link joins the trip it was written for', () => {
    expect(parseRoute('/join/abc-123_XYZ')).toEqual({ kind: 'join', token: 'abc-123_XYZ' })
    expect(parseRoute('/join/a%2Fb')).toEqual({ kind: 'join', token: 'a/b' })
  })

  it('recognises the blank-journal form', () => {
    expect(parseRoute('/new')).toEqual({ kind: 'new' })
  })

  it('round-trips through tripPath', () => {
    expect(parseRoute(tripPath(TRIP, '/savings'))).toEqual({
      kind: 'trip', tripId: TRIP, tab: '/savings',
    })
    expect(parseRoute(tripPath(TRIP))).toEqual({ kind: 'trip', tripId: TRIP, tab: '/plan' })
  })
})
