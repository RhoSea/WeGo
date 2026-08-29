import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/format'
import { Banner, errorMessage } from '../components/ui'
import { SignInScreen } from './SignIn'

interface Preview {
  trip_id: string | null
  trip_name: string | null
  destination: string | null
  departure_date: string | null
  currency: string | null
  status: 'valid' | 'used' | 'expired' | 'invalid'
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
    // Survive the round trip through the emailed sign-in link.
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
    return <div className="centered"><div className="card"><p className="muted">Checking invitation…</p></div></div>
  }

  const status = preview?.status ?? 'invalid'

  if (status !== 'valid') {
    const message =
      status === 'used' ? 'This invitation link has already been used. Ask for a fresh one.'
      : status === 'expired' ? 'This invitation link has expired. Ask for a fresh one.'
      : 'This invitation link is not valid.'
    return (
      <div className="centered">
        <div className="card">
          <div className="brand"><b>WeGo</b></div>
          <Banner kind="error">{message}</Banner>
          <button className="btn block" onClick={props.onCancel}>Continue to WeGo</button>
        </div>
      </div>
    )
  }

  if (!props.signedIn) return <SignInScreen invitedTo={preview?.trip_name ?? undefined} />

  return (
    <div className="centered">
      <div className="card">
        <div className="brand"><b>WeGo</b></div>
        <h2>Join {preview?.trip_name}</h2>
        <p className="small muted">
          {preview?.destination} · leaving {formatDate(preview?.departure_date ?? null)} · budgeted in {preview?.currency}
        </p>
        {error ? <Banner kind="error">{error}</Banner> : null}
        <button className="btn primary block" onClick={() => void join()} disabled={busy}>
          {busy ? 'Joining…' : 'Join this trip'}
        </button>
        <button className="btn ghost block small" onClick={props.onCancel}>Not now</button>
      </div>
    </div>
  )
}
