import { useState } from 'react'
import { supabase, appBaseUrl } from '../lib/supabase'
import { Banner, errorMessage } from '../components/ui'
import { PaperPlane, Postmark, Wordmark } from '../components/art'

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  )
}

/** The sign-in screen, written as a postcard inviting you along. */
export function SignInScreen({ invitedTo }: { invitedTo?: string | null }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setBusy(true)
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: appBaseUrl(),
        // Let people pick an account rather than silently reusing the last one.
        queryParams: { prompt: 'select_account' },
      },
    })
    // On success the browser navigates to Google, so this only runs on failure.
    if (err) {
      setBusy(false)
      setError(errorMessage(err, 'Could not start sign-in.'))
    }
  }

  return (
    <div className="centered auth-page">
      <div className="postcard-hero">
        <section className="postcard-front card">
          <div className="postcard-scene" aria-hidden="true">
            <svg viewBox="0 0 240 150" className="scene-art" role="presentation">
              <rect x="0" y="0" width="240" height="150" fill="var(--sky-wash)" />
              <circle cx="192" cy="34" r="18" fill="var(--gold)" opacity=".85" />
              <path d="M0 96c26-16 46 6 72-4s40-22 66-14 60 8 102-10v82H0Z" fill="var(--sage)" opacity=".55" />
              <path d="M0 112c30-10 52 8 84 2s52-16 84-8 46 6 72-6v50H0Z" fill="var(--teal)" opacity=".5" />
              <path d="M0 132c34-8 58 6 92 0s54-10 78-4 42 4 70-4v26H0Z" fill="var(--teal-ink)" opacity=".45" />
              <g opacity=".92">
                <path d="M46 104V78l15 24Z" fill="var(--card)" />
                <path d="M43 104V86l-11 18Z" fill="var(--card)" opacity=".85" />
                <path d="M28 106h34l-6 7H34Z" fill="var(--coral)" />
              </g>
              <g fill="var(--card)" opacity=".85">
                <ellipse cx="54" cy="30" rx="16" ry="8" />
                <ellipse cx="70" cy="26" rx="11" ry="7" />
              </g>
            </svg>
          </div>
          <div className="postcard-caption">
            <Wordmark />
            <p className="hand hero-note">Wish you were coming?</p>
          </div>
        </section>

        <section className="postcard-back card">
          <div className="postcard-stamp-area" aria-hidden="true">
            <span className="stamp-frame">
              <PaperPlane size={26} />
              <span className="stamp-frame-value">WeGo</span>
            </span>
            <Postmark text="ADVENTURE" />
          </div>

          {invitedTo ? (
            <Banner kind="info">
              You have been invited to <strong>{invitedTo}</strong>. Sign in to join.
            </Banner>
          ) : null}

          <h1>Plan a trip together</h1>
          <p className="small muted">
            One shared plan, one shared budget, and everybody&rsquo;s savings in one place.
          </p>

          <ol className="how-to">
            <li>
              <span className="step-num">1</span>
              <span>
                <b>Continue with Google.</b> There is no password to make up and nothing gets
                emailed to you.
              </span>
            </li>
            <li>
              <span className="step-num">2</span>
              <span>
                <b>Pick the account</b> you want your friends to see you as. WeGo receives only
                your name and email address.
              </span>
            </li>
            <li>
              <span className="step-num">3</span>
              <span>
                <b>You land back here</b>, signed in{invitedTo ? ', ready to join the trip' : ''}.
                {invitedTo ? '' : ' Start a trip or open an invitation link a friend sent you.'}
              </span>
            </li>
          </ol>

          {error ? <Banner kind="error">{error}</Banner> : null}

          <button className="btn primary block google-btn" onClick={() => void signIn()} disabled={busy}>
            <GoogleMark />
            {busy ? 'Taking you to Google…' : 'Continue with Google'}
          </button>
          <p className="tiny faint center">
            WeGo records numbers you type in. It never moves money and never asks for bank or card details.
          </p>
        </section>
      </div>
    </div>
  )
}
