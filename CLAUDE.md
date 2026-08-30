# WeGo — notes for Claude

A trip-planning app for one group of friends: shared plan, shared budget, and
per-person savings tracking. React + TypeScript + Vite on Supabase, deployed to
GitHub Pages. See [README.md](README.md) for setup and deployment detail.

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
src/lib/calc.ts       ALL budget and savings maths, pure and unit tested
src/lib/calc.test.ts  the suite that guards it
src/state/            auth session + trip data loading, realtime, refetch
src/screens/          Plan, Budget, Savings, Members, SignIn, Join, CreateTrip
supabase/schema.sql   tables, RLS policies, RPCs — the security model
```

## Things that will bite you

**`supabase/schema.sql` is not a migration system.** Editing it does nothing to
the database. Any change must be pasted into the Supabase SQL Editor by the user
by hand. Deploying code that expects a new column without that step breaks the
live app.

**Group size is never fixed.** Equal costs divide by the member count at read
time (`computeMemberShares`), so shares re-divide automatically as people join.
Never persist a computed share.

**Money maths belongs in `calc.ts`.** Shares stay unrounded internally and are
rounded only for display, so per-member amounts still sum to the trip total.
Put new calculations there with a test, not inline in a component.

**RLS helpers are `SECURITY DEFINER` on purpose.** `is_trip_member()` and
friends exist so policies on `trip_members` do not recurse into themselves.
Membership is written only by the `create_trip()` and `accept_invitation()`
RPCs — there is deliberately no insert policy on `trip_members`.

**Auth is Google OAuth, not magic links.** Switched away from emailed links
because Supabase's built-in mailer caps at ~2/hour, which made the app unusable
for a group. Do not reintroduce email sign-in without asking.

**Production config is not in the repo.** Supabase keys are GitHub Actions
secrets; Google OAuth lives in Google Cloud Console and the Supabase dashboard.

## Testing state

`npm test` covers the maths thoroughly (splits re-dividing as members join,
personal costs, rounding, savings targets and rates, departed trips).

`npm run verify:live` exercises the RLS policies and invitation lifecycle
against a real project. It signs test accounts up with passwords, so it needs
the Email provider on with **Confirm email off** while it runs. **It has never
been run.** The authenticated flows — create trip, invite, join, plan/cost CRUD,
savings entry — are therefore unverified against a live database.

## Scope

This is a deliberately small MVP. Out of scope unless asked: maps, chat, AI,
booking, currency conversion, file uploads, real payments. It records numbers
people type; it never moves money and must never ask for bank, card, or
identity details.
