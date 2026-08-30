import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CURRENCIES, type Trip } from '../lib/types'
import { formatDate } from '../lib/format'
import { tripPermissions, tripStatus } from '../lib/trips'
import type { TripData } from '../state/useTripData'
import { Banner, Sheet, errorMessage } from '../components/ui'
import { IconArchive, IconLeave, IconRestore, IconTag, IconTrash } from '../components/art'

/**
 * The trip's own page: its cover details, and the few irreversible things that
 * can happen to it. Owners edit, archive, restore and eventually delete;
 * everyone else can read it and leave.
 */
export function TripSettingsScreen({
  data,
  onChanged,
  onLeft,
  onDeleted,
  onGoToMembers,
}: {
  data: TripData
  /** Editing or archiving changes how the trip reads on My Trips too. */
  onChanged: () => void
  onLeft: () => void
  onDeleted: () => void
  onGoToMembers: () => void
}) {
  const trip = data.trip!
  const role = data.role ?? 'member'
  const can = tripPermissions(role, trip)
  const status = tripStatus(trip, new Date())
  const archived = Boolean(trip.archived_at)

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<'delete' | 'leave' | null>(null)
  const [busy, setBusy] = useState(false)

  async function setArchived(next: boolean) {
    setBusy(true)
    const { error: err } = await supabase
      .from('trips')
      .update({ archived_at: next ? new Date().toISOString() : null })
      .eq('id', trip.id)
    setBusy(false)
    if (err) {
      setError(errorMessage(err, next ? 'Could not archive this trip.' : 'Could not restore this trip.'))
      return
    }
    setError(null)
    setNotice(next ? 'Filed away. Nothing was deleted.' : 'Back on the desk.')
    await data.refresh()
    onChanged()
  }

  async function remove() {
    setBusy(true)
    const { error: err, data: rows } = await supabase
      .from('trips').delete().eq('id', trip.id).select()
    setBusy(false)
    if (err || (rows ?? []).length === 0) {
      setError(errorMessage(err, 'Could not delete this trip. Only the owner can, and only once it is archived.'))
      return
    }
    onDeleted()
  }

  async function leave() {
    setBusy(true)
    const { error: err } = await supabase.rpc('leave_trip', { p_trip_id: trip.id })
    setBusy(false)
    if (err) { setError(errorMessage(err, 'Could not leave this trip.')); return }
    onLeft()
  }

  return (
    <>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {notice ? <Banner kind="success">{notice}</Banner> : null}

      <div className="page-title">
        <h2>This trip</h2>
        <span className="hand">the cover page</span>
      </div>

      {archived ? (
        <Banner kind="warn">
          This trip is archived. It is still here and nothing has been deleted, but it is closed to
          new travellers until you restore it.
        </Banner>
      ) : null}

      {can.canEdit ? (
        <CoverForm
          trip={trip}
          onSaved={async () => { await data.refresh(); onChanged() }}
          onError={setError}
        />
      ) : (
        <div className="card">
          <div className="row between wrap">
            <h3>{trip.name}</h3>
            <span className="stamp neutral">{status}</span>
          </div>
          <div className="ledger">
            <ReadRow label="Destination" value={trip.destination} />
            <ReadRow label="Departure" value={formatDate(trip.departure_date)} />
            <ReadRow label="Budgeted in" value={trip.currency} />
            <ReadRow label="Your role" value="Member" />
          </div>
          <p className="small muted">
            Only the trip owner can change these, invite people, or archive the trip.
          </p>
        </div>
      )}

      {can.canInvite ? (
        <div className="card">
          <h3>Invitations</h3>
          <p className="small muted">
            Every invitation link belongs to this trip alone and adds whoever opens it to this
            trip only. They live with the traveller list.
          </p>
          <button className="btn block" onClick={onGoToMembers}>Invite someone to this trip</button>
        </div>
      ) : null}

      {can.canArchive ? (
        <div className="card">
          <h3>{archived ? 'Restore this trip' : 'Archive this trip'}</h3>
          <p className="small muted">
            {archived
              ? 'Put it back on the desk. It returns to the upcoming or past shelf on its own, depending on its departure date.'
              : 'File it away when you are finished with it. Everything is kept — the plan, the ledger and everyone’s savings — and the trip moves to the archived shelf, out of the way.'}
          </p>
          <button className="btn block" disabled={busy} onClick={() => void setArchived(!archived)}>
            {archived ? <IconRestore /> : <IconArchive />}
            {archived ? 'Restore trip' : 'Archive trip'}
          </button>
        </div>
      ) : null}

      {can.canLeave ? (
        <div className="card">
          <h3>Leave this trip</h3>
          <p className="small muted">
            You will be removed from the traveller list and the shared costs will re-divide between
            the people who are left. You can only come back with a fresh invitation.
          </p>
          <button className="btn block danger" onClick={() => setConfirming('leave')}>
            <IconLeave /> Leave trip
          </button>
        </div>
      ) : role === 'owner' ? (
        <div className="card">
          <h3>Leaving</h3>
          <p className="small muted">
            You created this trip, so you cannot leave it — there would be nobody left to manage it.
            Archive it instead, or delete it once it is archived.
          </p>
        </div>
      ) : null}

      {role === 'owner' ? (
        <div className="card danger-card">
          <h3>Delete permanently</h3>
          <p className="small muted">
            Deleting removes this trip and everything in it — every plan idea, every cost, every
            savings record for every traveller — for everybody, not just for you. It cannot be
            undone.
          </p>
          {can.canDelete ? (
            <button className="btn block danger" onClick={() => setConfirming('delete')}>
              <IconTrash /> Delete this trip
            </button>
          ) : (
            <p className="small muted">
              <b>Archive the trip first.</b> Deleting only becomes possible once a trip has been
              filed away, so it can never be a single mis-tap.
            </p>
          )}
        </div>
      ) : null}

      {confirming === 'delete' ? (
        <DeleteSheet
          trip={trip}
          busy={busy}
          onClose={() => setConfirming(null)}
          onConfirm={remove}
        />
      ) : null}

      {confirming === 'leave' ? (
        <LeaveSheet
          trip={trip}
          busy={busy}
          onClose={() => setConfirming(null)}
          onConfirm={leave}
        />
      ) : null}
    </>
  )
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="ledger-row">
      <span className="name">{label}</span>
      <span className="leader" aria-hidden="true" />
      <span className="amount">{value}</span>
    </div>
  )
}

/** The editable cover page. Owner only — the database enforces the same. */
function CoverForm({
  trip,
  onSaved,
  onError,
}: {
  trip: Trip
  onSaved: () => Promise<void>
  onError: (message: string | null) => void
}) {
  const [name, setName] = useState(trip.name)
  const [destination, setDestination] = useState(trip.destination)
  const [departureDate, setDepartureDate] = useState(trip.departure_date.slice(0, 10))
  const [currency, setCurrency] = useState(trip.currency)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  // Someone else editing from another device should not fight the form.
  useEffect(() => {
    setName(trip.name)
    setDestination(trip.destination)
    setDepartureDate(trip.departure_date.slice(0, 10))
    setCurrency(trip.currency)
  }, [trip.name, trip.destination, trip.departure_date, trip.currency])

  const changed =
    name.trim() !== trip.name ||
    destination.trim() !== trip.destination ||
    departureDate !== trip.departure_date.slice(0, 10) ||
    currency !== trip.currency

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error: err } = await supabase
      .from('trips')
      .update({
        name: name.trim(),
        destination: destination.trim(),
        departure_date: departureDate,
        currency,
      })
      .eq('id', trip.id)
    setBusy(false)
    if (err) { onError(errorMessage(err, 'Could not save the trip.')); return }
    onError(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    await onSaved()
  }

  return (
    <form className="card taped" onSubmit={submit}>
      <div className="row between wrap">
        <h3><IconTag /> Cover page</h3>
        <span className="stamp teal">owner</span>
      </div>
      <div className="form-grid">
        <label className="field full">
          Trip name
          <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field full">
          Destination
          <input required maxLength={160} value={destination}
                 onChange={(e) => setDestination(e.target.value)} />
        </label>
        <label className="field">
          Departure date
          <input required type="date" value={departureDate}
                 onChange={(e) => setDepartureDate(e.target.value)} />
        </label>
        <label className="field">
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <p className="tiny muted">
        Changing the currency relabels every amount in this trip. Nothing is converted, so the
        numbers stay exactly as they were typed.
      </p>
      <button
        className="btn primary block"
        type="submit"
        disabled={busy || !changed || !name.trim() || !destination.trim() || !departureDate}
      >
        {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
      </button>
    </form>
  )
}

/** Typing the trip's name is the confirmation — a tap cannot do this by mistake. */
function DeleteSheet({
  trip,
  busy,
  onClose,
  onConfirm,
}: {
  trip: Trip
  busy: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [typed, setTyped] = useState('')
  const matches = typed.trim().toLowerCase() === trip.name.trim().toLowerCase()

  return (
    <Sheet title="Delete this trip permanently" onClose={onClose}>
      <Banner kind="error">
        This cannot be undone, and it deletes the trip for everyone in it.
      </Banner>
      <p className="small muted">Deleting <b>{trip.name}</b> also removes:</p>
      <ul className="plain-list small muted">
        <li>every plan idea in it</li>
        <li>every cost on its budget</li>
        <li>every traveller’s savings record for it</li>
        <li>every invitation link written for it</li>
      </ul>
      <label className="field full">
        Type the trip’s name to confirm
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={trip.name}
          aria-label={`Type ${trip.name} to confirm deletion`}
        />
      </label>
      <button
        className="btn primary block danger-solid"
        disabled={!matches || busy}
        onClick={() => void onConfirm()}
      >
        {busy ? 'Deleting…' : 'Delete this trip for everyone'}
      </button>
      <button className="btn ghost block small" onClick={onClose}>Keep the trip</button>
    </Sheet>
  )
}

function LeaveSheet({
  trip,
  busy,
  onClose,
  onConfirm,
}: {
  trip: Trip
  busy: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  return (
    <Sheet title="Leave this trip" onClose={onClose}>
      <Banner kind="warn">You will need a fresh invitation to come back.</Banner>
      <p className="small muted">Leaving <b>{trip.name}</b>:</p>
      <ul className="plain-list small muted">
        <li>takes you off the traveller list</li>
        <li>re-divides the shared costs between everyone still going</li>
        <li>removes your own savings record for this trip</li>
        <li>leaves the plan and the budget the group wrote exactly as they are</li>
      </ul>
      <button className="btn primary block danger-solid" disabled={busy} onClick={() => void onConfirm()}>
        {busy ? 'Leaving…' : 'Leave this trip'}
      </button>
      <button className="btn ghost block small" onClick={onClose}>Stay</button>
    </Sheet>
  )
}
