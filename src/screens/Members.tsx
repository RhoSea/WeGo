import { useCallback, useEffect, useState } from 'react'
import { supabase, inviteUrl } from '../lib/supabase'
import type { Invitation } from '../lib/types'
import { formatDate } from '../lib/format'
import type { TripData } from '../state/useTripData'
import { Banner, Empty, errorMessage } from '../components/ui'

export function MembersScreen({ data, userId }: { data: TripData; userId: string }) {
  const [invites, setInvites] = useState<Invitation[]>([])
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [nameSaved, setNameSaved] = useState(false)
  const tripId = data.trip!.id

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
      .update({ display_name: displayName.trim() || null })
      .eq('id', userId)
    if (err) { setError(errorMessage(err, 'Could not save your name.')); return }
    setNameSaved(true)
    setTimeout(() => setNameSaved(false), 2000)
    await data.refresh()
  }

  const pending = invites.filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date())

  return (
    <>
      {error ? <Banner kind="error">{error}</Banner> : null}

      <div className="card">
        <h2>Members ({data.members.length})</h2>
        {data.members.map((member) => (
          <div className="kv" key={member.userId}>
            <span className="truncate">
              {member.name}{member.userId === userId ? ' (you)' : ''}
              {member.email ? <span className="muted small">{' · '}{member.email}</span> : null}
            </span>
            <span className="pill">{member.role}</span>
          </div>
        ))}
      </div>

      <form className="card" onSubmit={saveName}>
        <h2>Your display name</h2>
        <p className="small muted">This is how the rest of the group sees you.</p>
        <input
          maxLength={60}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
        />
        <button className="btn block" type="submit">{nameSaved ? 'Saved' : 'Save name'}</button>
      </form>

      <form className="card" onSubmit={createInvite}>
        <h2>Invite a friend</h2>
        <p className="small muted">
          Each link works once, for one person, and expires after 30 days.
        </p>
        <input
          maxLength={60}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Who is this link for? (optional)"
        />
        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create an invitation link'}
        </button>
      </form>

      <div className="list">
        <h2>Open invitations ({pending.length})</h2>
        {invites.length === 0 ? (
          <Empty>No invitations yet.</Empty>
        ) : (
          invites.map((invite) => {
            const expired = new Date(invite.expires_at) <= new Date()
            const state = invite.accepted_at ? 'Accepted' : expired ? 'Expired' : 'Waiting'
            return (
              <article className="card tight" key={invite.id}>
                <div className="row between">
                  <span className="strong truncate">{invite.label ?? 'Invitation'}</span>
                  <span className={`pill ${invite.accepted_at ? 'confirmed' : expired ? 'bad' : 'maybe'}`}>
                    {state}
                  </span>
                </div>
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
                        {copied === invite.token ? 'Copied' : 'Copy link'}
                      </button>
                      <button className="btn small danger" onClick={() => void revoke(invite)}>
                        Revoke
                      </button>
                    </div>
                  </>
                )}
              </article>
            )
          })
        )}
      </div>
    </>
  )
}
