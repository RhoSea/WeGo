import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/format'
import { Banner, errorMessage } from '../components/ui'
import { IconCalendar, IconPin, PaperPlane, Wordmark } from '../components/art'
import { SignInScreen } from './SignIn'

interface Preview {
  trip_id: string | null
  trip_name: string | null
  destination: string | null
  departure_date: string | null
  currency: string | null
  status: 'valid' | 'used' | 'expired' | 'invalid' | 'archived'
}

export const PENDING_INVITE_KEY = 'wego.pendingInvite'

export function JoinScreen(props: {
  token: string
  signedIn: boolean
  onJoined: (tripId: string) => void
  onCancel: () => void
}) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('preview_invitation', { p_token: props.token })
    setLoading(false)
    if (err) { setError(errorMessage(err, 'Could not check this invitation.')); return }
    const row = Array.isArray(data) ? data[0] : data
    setPreview((row as Preview) ?? { status: 'invalid' } as Preview)
  }, [props.token])

  useEffect(() => {
    // Survive the round trip through Google sign-in.
    try { localStorage.setItem(PENDING_INVITE_KEY, props.token) } catch { /* private mode */ }
    void load()
  }, [load, props.token])

  async function join() {
    setBusy(true)
    const { data, error: err } = await supabase.rpc('accept_invitation', { p_token: props.token })
    setBusy(false)
    if (err || !data) { setError(errorMessage(err, 'Could not join this trip.')); return }
    try { localStorage.removeItem(PENDING_INVITE_KEY) } catch { /* private mode */ }
    props.onJoined(String(data))
  }

  if (loading) {
    return (
      <div className="centered">
        <div className="card cut center loader-card" role="status">
          <span className="loader-plane"><PaperPlane size={30} /></span>
          <p className="hand">Checking the ticket…</p>
        </div>
      </div>
    )
  }

  const status = preview?.status ?? 'invalid'

  if (status !== 'valid') {
    const message =
      status === 'used' ? 'This invitation link has already been used. Ask for a fresh one.'
      : status === 'expired' ? 'This invitation link has expired. Ask for a fresh one.'
      : status === 'archived' ? 'This trip has been archived, so it is not taking new travellers.'
      : 'This invitation link is not valid.'
    return (
      <div className="centered auth-page">
        <div className="card cut">
          <Wordmark />
          <span className="stamp bad tilt">{status === 'archived' ? 'Archived' : 'Not valid'}</span>
          <Banner kind="error">{message}</Banner>
          <button className="btn block" onClick={props.onCancel}>Continue to WeGo</button>
        </div>
      </div>
    )
  }

  if (!props.signedIn) return <SignInScreen invitedTo={preview?.trip_name ?? undefined} />

  return (
    <div className="centered auth-page">
      <article className="ticket boarding">
        <div className="ticket-main">
          <div className="row between">
            <Wordmark />
            <span className="stamp teal">Invitation</span>
          </div>
          <hr className="divider" />
          <span className="kicker">You are invited to</span>
          <h1>{preview?.trip_name}</h1>
          <p className="journal-meta">
            <span className="row" style={{ gap: 5 }}><IconPin /> {preview?.destination}</span>
            <span className="dot" aria-hidden="true" />
            <span className="row" style={{ gap: 5 }}>
              <IconCalendar /> {formatDate(preview?.departure_date ?? null)}
            </span>
          </p>
          <p className="small muted">
            Budgeted in {preview?.currency}. Joining adds you to this trip only — its plan, its
            ledger and its travellers. It splits this trip’s shared costs one more way and gives
            you your own savings target for it.
          </p>
          {error ? <Banner kind="error">{error}</Banner> : null}
          <button className="btn primary block" onClick={() => void join()} disabled={busy}>
            {busy ? 'Joining…' : 'Join this trip'}
          </button>
          <button className="btn ghost block small" onClick={props.onCancel}>Not now</button>
        </div>
        <div className="ticket-stub">
          <span className="kicker">Boarding pass</span>
          <p className="stub-line">Admit one traveller</p>
          <p className="tiny faint">This ticket works once, for you.</p>
          <PaperPlane size={22} className="stub-plane" />
        </div>
      </article>
    </div>
  )
}
