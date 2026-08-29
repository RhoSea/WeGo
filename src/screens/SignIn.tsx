import { useState } from 'react'
import { supabase, appBaseUrl } from '../lib/supabase'
import { Banner, errorMessage } from '../components/ui'

export function SignInScreen({ invitedTo }: { invitedTo?: string | null }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: appBaseUrl() },
    })
    setBusy(false)
    if (err) { setError(errorMessage(err, 'Could not send the sign-in link.')); return }
    setError(null)
    setSent(true)
  }

  if (sent) {
    return (
      <div className="centered">
        <div className="card">
          <div className="brand"><b>WeGo</b></div>
          <h2>Check your inbox</h2>
          <p className="small muted">
            We sent a sign-in link to <strong>{email}</strong>. Open it on this device to continue.
            The link expires shortly, so if it stops working just request a new one.
          </p>
          <button className="btn block" onClick={() => setSent(false)}>Use a different email</button>
        </div>
      </div>
    )
  }

  return (
    <div className="centered">
      <form className="card" onSubmit={submit}>
        <div className="brand"><b>WeGo</b><span className="muted small">plan a trip together</span></div>
        {invitedTo ? (
          <Banner kind="info">
            You have been invited to <strong>{invitedTo}</strong>. Sign in to join.
          </Banner>
        ) : null}
        <h2>Sign in</h2>
        <p className="small muted">
          No password needed. We email you a link that signs you in.
        </p>
        {error ? <Banner kind="error">{error}</Banner> : null}
        <label className="field">
          Email
          <input
            required
            autoFocus
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <button className="btn primary block" type="submit" disabled={busy || !email.trim()}>
          {busy ? 'Sending…' : 'Email me a sign-in link'}
        </button>
      </form>
    </div>
  )
}
