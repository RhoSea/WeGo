import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Trip } from '../lib/types'
import { todayISO } from '../lib/format'
import { Banner, errorMessage } from '../components/ui'
import { Wordmark } from '../components/art'

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'CAD', 'AUD', 'NZD', 'JPY']

export function CreateTripScreen({ onCreated, onSignOut }: {
  onCreated: (trip: Trip) => void
  onSignOut: () => void
}) {
  const [name, setName] = useState('')
  const [destination, setDestination] = useState('')
  const [departureDate, setDepartureDate] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { data, error: err } = await supabase.rpc('create_trip', {
      p_name: name.trim(),
      p_destination: destination.trim(),
      p_departure_date: departureDate,
      p_currency: currency,
    })
    setBusy(false)
    if (err || !data) { setError(errorMessage(err, 'Could not create the trip.')); return }
    onCreated(data as Trip)
  }

  return (
    <div className="centered auth-page">
      <form className="card cut taped new-journal" onSubmit={submit}>
        <Wordmark />
        <span className="kicker">A blank journal</span>
        <h1>Start a trip</h1>
        <p className="small muted">
          Fill in the cover page. You can invite as many friends as you like once the trip exists,
          and the shared costs re-divide as each one joins.
        </p>
        {error ? <Banner kind="error">{error}</Banner> : null}
        <div className="form-grid">
          <label className="field full">
            Trip name
            <input required autoFocus maxLength={120} value={name}
                   onChange={(e) => setName(e.target.value)} placeholder="Summer escape" />
          </label>
          <label className="field full">
            Destination
            <input required maxLength={160} value={destination}
                   onChange={(e) => setDestination(e.target.value)} placeholder="Lisbon, Portugal" />
          </label>
          <label className="field">
            Departure date
            <input required type="date" min={todayISO()} value={departureDate}
                   onChange={(e) => setDepartureDate(e.target.value)} />
          </label>
          <label className="field">
            Currency
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <button className="btn primary block" type="submit"
                disabled={busy || !name.trim() || !destination.trim() || !departureDate}>
          {busy ? 'Opening the journal…' : 'Create trip'}
        </button>
        <button className="btn ghost block small" type="button" onClick={onSignOut}>Sign out</button>
      </form>
    </div>
  )
}
