/**
 * End-to-end check against a real Supabase project.
 *
 * Exercises the Row Level Security policies and the invitation lifecycle with
 * several real accounts, then re-checks the budget split maths against data
 * that actually round-tripped through the database.
 *
 * Requires password sign-up with email confirmation switched off, so run it
 * against a scratch project only:
 *
 *   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run verify:live
 */
import { createClient } from '@supabase/supabase-js'
import { computeMemberShares, computeBudgetTotals, computeSavingsProgress, sumSavings, round2 } from '../src/lib/calc'

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first.')
  process.exit(1)
}

let passed = 0
const failures = []

function check(label, condition, detail) {
  if (condition) {
    passed++
    console.log(`  ok   ${label}`)
  } else {
    failures.push(label)
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function newClient() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

const stamp = Date.now()
async function makeUser(tag) {
  const client = newClient()
  const email = `wego-${tag}-${stamp}@example.com`
  const password = `Test-${crypto.randomUUID()}`
  const { data, error } = await client.auth.signUp({ email, password })
  if (error) throw new Error(`sign-up failed for ${tag}: ${error.message}`)
  if (!data.session) {
    throw new Error(
      `${tag} signed up but got no session. Turn OFF "Confirm email" in ` +
      'Authentication → Sign In / Providers → Email while running this script.',
    )
  }
  return { client, email, id: data.user.id, tag }
}

console.log('\nWeGo — live verification\n')

const owner = await makeUser('owner')
const friend1 = await makeUser('friend1')
const friend2 = await makeUser('friend2')
const outsider = await makeUser('outsider')
const anon = newClient()
console.log(`Created 4 test accounts (${owner.email} and friends)\n`)

// --- Trip creation -----------------------------------------------------------
console.log('Trip creation and membership')
const departure = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10)
const { data: trip, error: tripErr } = await owner.client.rpc('create_trip', {
  p_name: 'Verification trip',
  p_destination: 'Lisbon, Portugal',
  p_departure_date: departure,
  p_currency: 'EUR',
})
check('owner can create a trip', !tripErr && trip?.id, tripErr?.message)
if (!trip?.id) { console.error('\nCannot continue without a trip.'); process.exit(1) }

const tripId = trip.id
const { data: ownerMembership } = await owner.client.from('trip_members').select('*').eq('trip_id', tripId)
check('creator is enrolled as owner', ownerMembership?.length === 1 && ownerMembership[0].role === 'owner')

// --- Unauthorized access -----------------------------------------------------
console.log('\nUnauthorized access')
const outsiderTrips = await outsider.client.from('trips').select('*').eq('id', tripId)
check('a signed-in non-member sees no trip', (outsiderTrips.data ?? []).length === 0)

const anonTrips = await anon.from('trips').select('*').eq('id', tripId)
check('a signed-out visitor sees no trip', (anonTrips.data ?? []).length === 0)

const outsiderInsert = await outsider.client.from('costs').insert({
  trip_id: tripId, description: 'intrusion', category: 'other',
  estimated_amount: 1, split_type: 'equal', created_by: outsider.id,
})
check('a non-member cannot add a cost', Boolean(outsiderInsert.error))

const selfJoin = await outsider.client.from('trip_members').insert({
  trip_id: tripId, user_id: outsider.id, role: 'member',
})
check('a non-member cannot add themselves to the trip', Boolean(selfJoin.error))

const anonInvites = await anon.from('invitations').select('*')
check('a signed-out visitor cannot list invitation tokens', (anonInvites.data ?? []).length === 0)

// --- Invitations -------------------------------------------------------------
console.log('\nInvitations')
const { data: inviteA, error: inviteAErr } = await owner.client.rpc('create_invitation', {
  p_trip_id: tripId, p_label: 'Friend one',
})
const { data: inviteB } = await owner.client.rpc('create_invitation', {
  p_trip_id: tripId, p_label: 'Friend two',
})
check('owner can generate a separate link per friend',
  !inviteAErr && inviteA?.token && inviteB?.token && inviteA.token !== inviteB.token, inviteAErr?.message)

const outsiderInvite = await outsider.client.rpc('create_invitation', { p_trip_id: tripId, p_label: 'nope' })
check('a non-member cannot mint invitations', Boolean(outsiderInvite.error))

const preview = await friend1.client.rpc('preview_invitation', { p_token: inviteA.token })
const previewRow = Array.isArray(preview.data) ? preview.data[0] : preview.data
check('an invited friend can preview the trip', previewRow?.status === 'valid' && previewRow?.trip_name === 'Verification trip')

const bogus = await friend1.client.rpc('preview_invitation', { p_token: 'not-a-real-token' })
const bogusRow = Array.isArray(bogus.data) ? bogus.data[0] : bogus.data
check('an unknown token previews as invalid', bogusRow?.status === 'invalid')

const accept1 = await friend1.client.rpc('accept_invitation', { p_token: inviteA.token })
check('friend one joins through their link', !accept1.error && accept1.data === tripId, accept1.error?.message)

const reAccept = await friend1.client.rpc('accept_invitation', { p_token: inviteA.token })
check('re-opening your own used link is not an error', !reAccept.error && reAccept.data === tripId)

const stolen = await friend2.client.rpc('accept_invitation', { p_token: inviteA.token })
check('a used link cannot be redeemed by anyone else', Boolean(stolen.error), stolen.error?.message)

const accept2 = await friend2.client.rpc('accept_invitation', { p_token: inviteB.token })
check('friend two joins through their own link', !accept2.error && accept2.data === tripId, accept2.error?.message)

const { data: members } = await owner.client.from('trip_members').select('*').eq('trip_id', tripId)
check('all three members are visible to the group', members?.length === 3)

const friendSeesMembers = await friend1.client.from('trip_members').select('*').eq('trip_id', tripId)
check('a joined member sees the same member list', (friendSeesMembers.data ?? []).length === 3)

// --- Shared plan data --------------------------------------------------------
console.log('\nShared trip data')
const planInsert = await friend1.client.from('plan_items').insert({
  trip_id: tripId, title: 'Sunset boat trip', status: 'maybe',
  item_date: departure, link: 'https://example.com/boats', created_by: friend1.id,
})
check('a member can add a plan item', !planInsert.error, planInsert.error?.message)

const ownerSeesPlan = await owner.client.from('plan_items').select('*').eq('trip_id', tripId)
check('another member sees it immediately', (ownerSeesPlan.data ?? []).length === 1)

const outsiderSeesPlan = await outsider.client.from('plan_items').select('*').eq('trip_id', tripId)
check('a non-member sees no plan items', (outsiderSeesPlan.data ?? []).length === 0)

const badLink = await friend1.client.from('plan_items').insert({
  trip_id: tripId, title: 'xss', status: 'idea',
  link: 'javascript:alert(1)', created_by: friend1.id,
})
check('non-http links are rejected by the database', Boolean(badLink.error))

// --- Budget ------------------------------------------------------------------
console.log('\nBudget splits')
await owner.client.from('costs').insert([
  { trip_id: tripId, description: 'Villa', category: 'accommodation', estimated_amount: 900, actual_amount: 960, split_type: 'equal', created_by: owner.id },
  { trip_id: tripId, description: 'Extra legroom', category: 'flights', estimated_amount: 150, split_type: 'personal', assigned_to: friend1.id, created_by: owner.id },
])

const { data: costs } = await owner.client.from('costs').select('*').eq('trip_id', tripId).order('created_at')
const memberIds = (members ?? []).map((m) => m.user_id)
const totals = computeBudgetTotals(costs)
check('estimated total is right', totals.estimated === 1050, String(totals.estimated))
check('actual total counts only recorded actuals', totals.actual === 960, String(totals.actual))
check('category totals are right',
  totals.byCategory.accommodation.estimated === 900 && totals.byCategory.flights.estimated === 150)

const shares3 = computeMemberShares(costs, memberIds)
check('900 splits three ways at 300 each', memberIds.every((id) => round2(shares3[id].estimated - (id === friend1.id ? 150 : 0)) === 300))
check('the personal cost lands only on friend one', round2(shares3[friend1.id].estimated) === 450)
check('shares add back up to the trip total',
  round2(memberIds.reduce((a, id) => a + shares3[id].estimated, 0)) === totals.estimated)

const badAssignment = await owner.client.from('costs').insert({
  trip_id: tripId, description: 'broken', category: 'other',
  estimated_amount: 10, split_type: 'personal', assigned_to: null, created_by: owner.id,
})
check('a personal cost with nobody assigned is rejected', Boolean(badAssignment.error))

// A fourth friend joins; the same stored costs must re-divide with no edits.
const { data: inviteC } = await owner.client.rpc('create_invitation', { p_trip_id: tripId, p_label: 'Friend three' })
const friend3 = await makeUser('friend3')
await friend3.client.rpc('accept_invitation', { p_token: inviteC.token })
const { data: members4 } = await owner.client.from('trip_members').select('*').eq('trip_id', tripId)
const memberIds4 = members4.map((m) => m.user_id)
const shares4 = computeMemberShares(costs, memberIds4)
check('a fourth member joining re-divides the shared cost to 225 each',
  memberIds4.length === 4 && round2(shares4[owner.id].estimated) === 225)
check('the personal cost is unaffected by the new member',
  round2(shares4[friend1.id].estimated) === 375)

// --- Savings -----------------------------------------------------------------
console.log('\nSavings')
const mySaving = await friend1.client.from('savings_entries').insert({
  trip_id: tripId, user_id: friend1.id, amount: 120.5, entry_date: new Date().toISOString().slice(0, 10),
}).select().single()
check('a member can record their own contribution', !mySaving.error, mySaving.error?.message)

const spoofed = await friend2.client.from('savings_entries').insert({
  trip_id: tripId, user_id: friend1.id, amount: 999, entry_date: new Date().toISOString().slice(0, 10),
})
check('you cannot log savings in someone else’s name', Boolean(spoofed.error))

const foreignEdit = await friend2.client.from('savings_entries').update({ amount: 5 }).eq('id', mySaving.data.id).select()
check('you cannot edit another member’s entry', (foreignEdit.data ?? []).length === 0)

const foreignDelete = await friend2.client.from('savings_entries').delete().eq('id', mySaving.data.id).select()
check('you cannot delete another member’s entry', (foreignDelete.data ?? []).length === 0)

const ownEdit = await friend1.client.from('savings_entries').update({ amount: 130 }).eq('id', mySaving.data.id).select()
check('you can edit your own entry', (ownEdit.data ?? []).length === 1)

const groupView = await owner.client.from('savings_entries').select('*').eq('trip_id', tripId)
check('the group can see the savings history', (groupView.data ?? []).length === 1)

const outsiderSavings = await outsider.client.from('savings_entries').select('*').eq('trip_id', tripId)
check('a non-member sees no savings', (outsiderSavings.data ?? []).length === 0)

const progress = computeSavingsProgress({
  target: shares4[friend1.id].estimated,
  saved: sumSavings(groupView.data, friend1.id),
  departureDate: departure,
  savingStartDate: trip.created_at,
})
check('savings target equals the member’s budget share', round2(progress.target) === 375)
check('remaining is target minus saved', round2(progress.remaining) === 245)
check('a weekly rate is offered while departure is ahead', progress.weeklyNeeded !== null && progress.weeklyNeeded > 0)

const departed = computeSavingsProgress({
  target: 375, saved: 130, departureDate: '2020-01-01', savingStartDate: trip.created_at,
})
check('a past departure date suppresses the savings rate', departed.departed && departed.weeklyNeeded === null)

for (const id of memberIds4) {
  const p = computeSavingsProgress({
    target: shares4[id].estimated,
    saved: sumSavings(groupView.data, id),
    departureDate: departure,
    savingStartDate: trip.created_at,
  })
  check(`savings figures resolve for every member (${id.slice(0, 8)})`,
    Number.isFinite(p.target) && Number.isFinite(p.remaining) && p.progress >= 0 && p.progress <= 1)
}

// --- Cleanup -----------------------------------------------------------------
console.log('\nCleanup')
const del = await owner.client.from('trips').delete().eq('id', tripId).select()
check('the owner can delete the trip', (del.data ?? []).length === 1)
const gone = await owner.client.from('costs').select('*').eq('trip_id', tripId)
check('deleting the trip removes its data', (gone.data ?? []).length === 0)

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log(failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
