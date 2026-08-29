# WeGo

A small web app for a group of friends to plan one trip together and track what
everyone still needs to save. Built with React, TypeScript, Vite and Supabase,
hosted on GitHub Pages.

Three screens:

- **Plan** — shared trip ideas with a status (Idea / Maybe / Confirmed / Booked),
  optional date, link and note. Filter by status, sort by date.
- **Budget** — shared and personal costs by category, with running totals and
  each member's estimated and actual share.
- **Savings** — a private record of what each person has put aside, with a
  target, progress bar, weekly and monthly rate, and on-track status.

The group size is never hardcoded. Shared costs divide by however many members
the trip has at the moment you look at it.

> WeGo only stores numbers people type in. It never moves, holds, or requests
> real money, and it never asks for bank, card or document details.

## 1. Local setup

Requires Node 20 or newer.

```bash
npm install
cp .env.example .env    # then fill in the two values from step 2
npm run dev             # http://localhost:5173
```

## 2. Supabase configuration

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql)
   and run it. This creates every table, Row Level Security policy and RPC.
3. Go to **Project Settings → API** and copy:
   - *Project URL* → `VITE_SUPABASE_URL`
   - *anon / public key* → `VITE_SUPABASE_ANON_KEY`

   Both are safe in a browser bundle; they only ever grant what Row Level
   Security allows. **Never** copy the `service_role` key into this project.
4. Go to **Authentication → Providers → Email** and make sure *Email* is enabled.
   Passwords can stay off — WeGo only uses magic links.
5. Go to **Authentication → URL Configuration** and add both of these to
   *Redirect URLs*:
   - `http://localhost:5173/`
   - `https://<your-github-username>.github.io/wego/`

### How the security model works

All seven tables have Row Level Security enabled and no policy is open to the
public.

- Reading or writing anything in a trip requires a row in `trip_members`,
  checked by the `is_trip_member()` helper.
- Membership itself can only be written by two `SECURITY DEFINER` functions —
  `create_trip()` and `accept_invitation()` — so a client cannot add itself to
  someone else's trip.
- Savings entries are readable by the whole group but writable only by their
  owner (`user_id = auth.uid()` on insert, update and delete).
- Invitation tokens are 24 random bytes generated in the database. Accepting one
  is a single transaction that locks the row (`FOR UPDATE`), marks it accepted,
  and refuses any later use.

## 3. Testing

```bash
npm test        # calculation suite (budget splits, savings targets and rates)
npm run build   # type check + production build
npm run preview # serve the production build locally
```

The tests cover the parts that are easy to get quietly wrong: equal splits that
re-divide as members join, personal costs landing on one person, shares summing
back to the trip total, savings targets, weekly and monthly rates, the
under-one-week case, and the departed-trip warning.

## 4. Deployment

Deployment is automatic on every push to `main`
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

One-time setup in the GitHub repository:

1. **Settings → Pages → Build and deployment → Source**: select **GitHub Actions**.
2. **Settings → Secrets and variables → Actions → New repository secret**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Push to `main`. The workflow runs the tests, builds, and publishes to
   `https://<your-github-username>.github.io/<repo>/`.

The Vite `base` path comes from the repository name automatically, so a rename
needs no code change. Routing is hash-based, which means deep links such as
`.../#/join/<token>` work on Pages without a custom 404 rule.

## 5. Inviting friends

1. Sign in and create the trip (name, destination, departure date, currency).
2. Open **Members → Invite a friend**. Optionally label the link with who it is
   for, then create it.
3. Copy the link and send it to that one person. Each link is single-use and
   expires after 30 days; you can revoke an unused one at any time.
4. They open the link, enter their email, click the emailed sign-in link, and
   land back on the join screen to confirm.

Everyone sees the same data from any device or country. Budget shares re-divide
automatically as each new person joins — nothing needs to be re-entered.

## Project layout

```
src/lib/calc.ts        all budget and savings maths (pure, unit tested)
src/lib/calc.test.ts   the test suite
src/state/             auth session and trip data loading with realtime updates
src/screens/           Plan, Budget, Savings, Members, sign-in, join, create
supabase/schema.sql    tables, RLS policies, RPCs
```
