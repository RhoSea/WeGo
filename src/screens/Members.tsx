import { useCallback, useEffect, useState } from 'react'
import { supabase, inviteUrl } from '../lib/supabase'
import type { Invitation } from '../lib/types'
import { formatDate } from '../lib/format'
import type { TripData } from '../state/useTripData'
import { tripPermissions } from '../lib/trips'
import { Avatar, Banner, Empty, errorMessage } from '../components/ui'
import { ArtEnvelope, IconPlus, PaperPlane, Postmark } from '../components/art'

export function MembersScreen({ data, userId }: { data: TripData; userId: string }) {
  const [invites, setInvites] = useState<Invitation[]>([])
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [nameSaved, setNameSaved] = useState(false)
  const trip = data.trip!
  const tripId = trip.id
  // Inviting people is managing the trip, so it belongs to the owner. The
  // database enforces the same rule in create_invitation().
  const can = tripPermissions(data.role ?? 'member', trip)

  const loadInvites = useCallback(async () => {
    const { data: rows, error: err } = await supabase
      .from('invitations')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
    if (err) { setError(errorMessage(err, 'Could not load invitations.')); return }
    setInvites((rows as Invitation[]) ?? [])
  }, [tripId])

  useEffect(() => { void loadInvites() }, [loadInvites])
  useEffect(() => {
    setDisplayName(data.members.find((m) => m.userId === userId)?.name ?? '')
  }, [data.members, userId])

  async function createInvite(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error: err } = await supabase.rpc('create_invitation', {
      p_trip_id: tripId,
      p_label: label.trim() || null,
    })
    setBusy(false)
    if (err) { setError(errorMessage(err, 'Could not create an invitation.')); return }
    setError(null)
    setLabel('')
    await loadInvites()
  }

  async function revoke(invite: Invitation) {
    if (!confirm('Revoke this invitation link?')) return
    const { error: err } = await supabase.from('invitations').delete().eq('id', invite.id)
    if (err) { setError(errorMessage(err, 'Could not revoke this invitation.')); return }
    await loadInvites()
  }

  async function copy(token: string) {
    const url = inviteUrl(token)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setError('Copying failed — select the link text below and copy it manually.')
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    const { error: err } = await supabase
      .from('profiles')
      .upsert({ id: userId, display_name: displayName.trim() || null })
    if (err) { setError(errorMessage(err, 'Could not save your name.')); return }
    setNameSaved(true)
    setTimeout(() => setNameSaved(false), 2000)
    await data.refresh()
  }

  const pending = invites.filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date())

  return (
    <>
      {error ? <Banner kind="error">{error}</Banner> : null}

      <div className="page-title">
        <h2>Who&rsquo;s coming</h2>
        <span className="hand">the whole party</span>
      </div>

      <div className="card passport">
        <div className="row between">
          <h3>Travellers</h3>
          <span className="stamp neutral">{data.members.length} aboard</span>
        </div>
        <div className="passport-list">
          {data.members.map((member) => (
            <div className="passport-row" key={member.userId}>
              <Avatar name={member.name} id={member.userId} large />
              <span className="col grow">
                <span className="truncate strong">
                  {member.name}{member.userId === userId ? ' (you)' : ''}
                </span>
                {member.email ? <span className="tiny faint truncate">{member.email}</span> : null}
              </span>
              <span className={`stamp ${member.role === 'owner' ? 'teal' : 'neutral'}`}>{member.role}</span>
            </div>
          ))}
        </div>
      </div>

      <form className="card" onSubmit={saveName}>
        <h3>Your display name</h3>
        <p className="small muted">This is how the rest of the group sees you.</p>
        <input
          maxLength={60}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          aria-label="Your display name"
        />
        <button className="btn block" type="submit">{nameSaved ? 'Saved ✓' : 'Save name'}</button>
      </form>

      {can.canInvite ? (
        <form className="card invite-card taped tape-teal" onSubmit={createInvite}>
          <h3>Invite a friend</h3>
          <p className="small muted">
            Each link works once, for one person, and expires after 30 days. It adds them to
            <b> {trip.name}</b> and to no other trip. Send it to them directly — anyone holding the
            link can join.
          </p>
          <input
            maxLength={60}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Who is this link for? (optional)"
            aria-label="Who is this invitation for"
          />
          <button className="btn primary block" type="submit" disabled={busy}>
            <IconPlus /> {busy ? 'Writing the ticket…' : 'Create an invitation link'}
          </button>
        </form>
      ) : (
        <div className="card">
          <h3>Inviting people</h3>
          <p className="small muted">
            {data.role === 'owner'
              ? 'This trip is archived, so it is closed to new travellers. Restore it from the trip page to invite anyone else.'
              : 'Only the trip owner can invite people to this trip. Ask them for a link.'}
          </p>
        </div>
      )}

      <div className="page-title">
        <h3>Invitations</h3>
        <span className="small muted">{pending.length} still open</span>
      </div>

      {invites.length === 0 ? (
        <Empty art={<ArtEnvelope />} title="No tickets written yet">
          {can.canInvite
            ? 'Create an invitation link above and send it to whoever is coming.'
            : 'Nobody has been invited to this trip yet.'}
        </Empty>
      ) : (
        <div className="stack">
          {invites.map((invite) => {
            const expired = new Date(invite.expires_at) <= new Date()
            const state = invite.accepted_at ? 'Accepted' : expired ? 'Expired' : 'Waiting'
            const spent = Boolean(invite.accepted_at) || expired
            return (
              <article className={`ticket${spent ? ' spent' : ''}`} key={invite.id}>
                <div className="ticket-main">
                  <div className="row between wrap">
                    <span className="kicker">Boarding pass</span>
                    <span className={`stamp ${invite.accepted_at ? 'confirmed' : expired ? 'bad' : 'maybe'}`}>
                      {state}
                    </span>
                  </div>
                  <h3 className="truncate">{invite.label ?? 'Open invitation'}</h3>
                  {invite.accepted_at ? (
                    <p className="small muted">
                      Used by {data.nameFor(invite.accepted_by)} on {formatDate(invite.accepted_at)}
                    </p>
                  ) : expired ? (
                    <p className="small muted">Expired {formatDate(invite.expires_at)}</p>
                  ) : (
                    <>
                      <p className="code">{inviteUrl(invite.token)}</p>
                      <div className="row">
                        <button className="btn small grow" onClick={() => void copy(invite.token)}>
                          {copied === invite.token ? 'Copied ✓' : 'Copy link'}
                        </button>
                        {can.canEdit ? (
                          <button className="btn small danger" onClick={() => void revoke(invite)}>
                            Revoke
                          </button>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
                <div className="ticket-stub">
                  {invite.accepted_at ? <Postmark text="BOARDED" /> : null}
                  <span className="kicker">WeGo</span>
                  <p className="stub-line">Admit one traveller</p>
                  <p className="tiny faint">
                    {invite.accepted_at
                      ? 'This ticket has been used'
                      : expired
                        ? `Expired ${formatDate(invite.expires_at)}`
                        : `Valid until ${formatDate(invite.expires_at)}`}
                  </p>
                  <PaperPlane size={20} className="stub-plane" />
                </div>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
