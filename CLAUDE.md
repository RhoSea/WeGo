# WeGo — notes for Claude

A trip-planning app for groups of friends: each person keeps a collection of
trips, and every trip has its own plan, budget, savings and travellers. React +
TypeScript + Vite on Supabase, deployed to GitHub Pages. See
[README.md](README.md) for setup and deployment detail.

- Repo: https://github.com/RhoSea/WeGo (public)
- Live: https://rhosea.github.io/WeGo/

## Commands

```bash
npm run dev       # localhost:5173
npm test          # calculation suite — fast, run this constantly
npm run build     # tsc -b + vite build
npm run verify:live   # RLS/invitation checks against a real project (see below)
```

Run `npm test && npm run build` before pushing. Pushing to `main` deploys.

## Where things live

```
src/lib/calc.ts        ALL budget and savings maths, pure and unit tested
src/lib/trips.ts       trip status, per-trip permissions, dashboard summaries
src/lib/useHashRoute.ts  the routes, including which trip is open
src/state/useTrips.ts  the whole collection, for the dashboard and switcher
src/state/useTripData.ts  one open trip: members, plan, costs, savings, realtime
src/screens/           Trips (dashboard), Plan, Budget, Savings, Members,
                       TripSettings, SignIn, Join, CreateTrip
src/components/        ui.tsx (shared pieces), art.tsx (all SVG), Nav,
                       TripHeader, TripSwitcher
src/styles/            tokens → base → components → screens, imported by styles.css
supabase/migrations/   tables, RLS policies, RPCs — the security model
```

## Routes

Hash-based, and the open trip is always in the address so no screen can infer
it from leftover state:

```
/trips                 My Trips — every trip you own or joined
/new                   the blank-journal form
/t/<tripId>/plan       and /budget, /savings, /members, /settings
/join/<token>          an invitation link
```

## Things that will bite you

**Migrations are files, not automation.** `supabase/migrations/NNNN_*.sql` is
version control for the schema and nothing more: editing one does nothing to the
database. Every new migration must be pasted into the Supabase SQL Editor by the
user by hand, once, in order. Deploying code that expects a new column without
that step breaks the live app. Never edit an applied migration — add the next
one.

**Group size is never fixed, and neither is trip count.** Equal costs divide by
the member count at read time (`computeMemberShares`), so shares re-divide
automatically as people join or leave. Never persist a computed share, and never
assume a person has exactly one trip.

**Every figure is grouped by `trip_id` before it is counted.** `summariseTrips`
in `trips.ts` does the grouping for the dashboard; `useTripData` fetches one
trip at a time and drops any response whose trip is no longer the one on screen.
That guard is what stops the trip you just left from flashing up inside the one
you opened — do not remove it.

**Money maths belongs in `calc.ts`.** Shares stay unrounded internally and are
rounded only for display, so per-member amounts still sum to the trip total.
Put new calculations there with a test, not inline in a component.

**A pinned `search_path` cannot see Supabase's extensions.** Every
`SECURITY DEFINER` function here sets `search_path = public`, and Supabase keeps
pgcrypto and friends in the `extensions` schema — so `gen_random_bytes()` and
anything else from an extension is invisible inside them, however loudly
`create extension if not exists` appears to succeed (it is a no-op when the
extension already exists elsewhere). Prefer `pg_catalog` built-ins:
`gen_random_uuid()`, `encode`, `decode` and `translate` are always reachable.
This cost one production bug already — invitation links could not be minted.

**RLS helpers are `SECURITY DEFINER` on purpose.** `is_trip_member()` and
friends exist so policies on `trip_members` do not recurse into themselves.
Membership is written only by the `create_trip()` and `accept_invitation()`
RPCs and removed only by `leave_trip()` — there is deliberately no insert or
delete policy on `trip_members`.

**Owning and joining are different.** Only owners edit, invite, archive,
restore and delete; only non-owners can leave. `tripPermissions()` is the one
place that decides, and every rule it states is also enforced in SQL — the UI
never guards something the database does not. There is no ownership transfer.

**A trip must be archived before it can be deleted.** The `trips_delete` policy
requires `archived_at is not null`, so deleting is always two deliberate steps
even if a caller skips the confirmation dialog.

**Auth is Google OAuth, not magic links.** Switched away from emailed links
because Supabase's built-in mailer caps at ~2/hour, which made the app unusable
for a group. Do not reintroduce email sign-in without asking.

**The design is a paper sketchbook, and its rules live in `tokens.css`.**
Never hard-code a colour: use the custom properties. Each travel ink has three
strengths — `--teal` fills illustrations, `--teal-ink` is the only one dark
enough for text (4.5:1 on paper), `--teal-wash` is the tint behind it. Two class
names look alike and are not: `.hand` sets the handwriting face (Caveat, decorative
text only), `.card.cut` gives a card its unevenly cut corners.

**Illustration is code, not assets.** Everything drawn lives in
`src/components/art.tsx`. No icon library, no stock imagery, no new dependency
for a picture.

**Motion must degrade to nothing.** `prefers-reduced-motion` zeroes every
duration globally, so an element may never depend on an animation running to end
up visible — check the final keyframe, not the first.

**Production config is not in the repo.** Supabase keys are GitHub Actions
secrets; Google OAuth lives in Google Cloud Console and the Supabase dashboard.

## Testing state

`npm test` covers the maths thoroughly (splits re-dividing as members join,
personal costs, rounding, savings targets and rates, departed trips), plus trip
status, per-trip permissions, dashboard separation between trips, and routing.

`npm run verify:live` exercises the RLS policies, the invitation lifecycle and
the multi-trip rules against a real project. It signs test accounts up with
passwords, so it needs the Email provider on with **Confirm email off** while it
runs. **It has never been run.** The authenticated flows — create trip, invite,
join, plan/cost CRUD, savings entry, archive, leave, delete — are therefore
unverified against a live database.

## Scope

This is a deliberately small MVP. Out of scope unless asked: maps, chat, AI,
booking, currency conversion, file uploads, real payments, ownership transfer.
It records numbers people type; it never moves money and must never ask for
bank, card, or identity details.
