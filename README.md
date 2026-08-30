# WeGo

A small web app for a group of friends to plan one trip together and track what
everyone still needs to save. Built with React, TypeScript, Vite and Supabase,
hosted on GitHub Pages. Sign-in is through Google, so there is no password to
remember and no email delivery to go wrong.

It is dressed as a shared travel sketchbook: paper and ink rather than a finance
dashboard, with postcards, ticket stubs, status stamps and a hand-drawn route
that fills in as the group saves.

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
4. Set up Google sign-in — see [Google sign-in](#google-sign-in) below.
5. Go to **Authentication → URL Configuration** and add both of these to
   *Redirect URLs*:
   - `http://localhost:5173/`
   - `https://rhosea.github.io/WeGo/`

### Google sign-in

WeGo signs people in with their Google account. Nothing is emailed, so there are
no delivery failures, no spam folders and no send-rate limits to manage.

**In [Google Cloud Console](https://console.cloud.google.com):**

1. Create a project.
2. **APIs & Services → OAuth consent screen**: user type *External*, fill in the
   app name and your own email for the two contact fields.
3. Click **Publish app**. While the app sits in *Testing*, only manually listed
   addresses can sign in, which would block your friends. Publishing needs no
   Google review, because WeGo requests only name and email.
4. **Credentials → Create Credentials → OAuth client ID → Web application**. Add
   this to *Authorized redirect URIs*, taking the value from the Supabase page in
   the next step:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
5. Copy the **Client ID** and **Client Secret**.

**In Supabase → Authentication → Sign In / Providers → Google:** enable the
provider, paste the Client ID and Secret, and save. The callback URL shown there
must match what you registered in step 4.

The Email provider can be left on or switched off — the app does not use it.

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

There is also a live check that runs against a real Supabase project. It creates
throwaway accounts and asserts that Row Level Security actually holds — that a
non-member sees nothing, that an invitation cannot be redeemed twice, and that
nobody can edit someone else's savings:

```bash
npm run verify:live     # reads .env
```

It signs its test accounts up with passwords, so it needs the **Email** provider
enabled with **Confirm email** switched **off** while it runs, then set back
afterwards. That only affects password signup, which the app itself never uses.
Point this at a scratch project, never at a project holding a real trip.

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

### Making a change

Push to `main` and the site updates itself:

```
git push  →  npm ci  →  npm test  →  npm run build  →  published to Pages
```

It takes a minute or two end to end. Worth knowing:

- **The tests gate the deploy.** If `npm test` fails the workflow stops and the
  live site keeps serving the previous version, so a broken build cannot reach
  anyone.
- **Only `main` deploys.** Work on a branch and nothing ships until you merge.
- **Anyone with the app already open needs to refresh.** Asset filenames are
  content-hashed so there is no stale-cache problem, but an open tab will not
  reload on its own.

Check on a running deploy with `gh run watch`, or `gh run list --limit 3` for
recent history.

Save yourself a round trip by running the same checks locally first:

```bash
npm test && npm run build
```

### Two things that do not deploy themselves

**Database changes.** Editing [`supabase/schema.sql`](supabase/schema.sql) does
nothing to your database — the file is a script, not a migration system. Paste
the changed SQL into the Supabase SQL Editor yourself. Forgetting this is the
most likely way to break the live app: the new code deploys expecting a column
that does not exist yet.

**Environment variables.** Production reads `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` from GitHub Actions secrets, not from your local
`.env`. If you move to a different Supabase project, update both:

```bash
gh secret set VITE_SUPABASE_URL --repo <owner>/<repo>
gh secret set VITE_SUPABASE_ANON_KEY --repo <owner>/<repo>
```

Google OAuth settings live in Google Cloud Console and the Supabase dashboard,
so they are not in this repo either.

## 5. Inviting friends

1. Sign in and create the trip (name, destination, departure date, currency).
2. Open **Members → Invite a friend**. Optionally label the link with who it is
   for, then create it.
3. Copy the link and send it to that one person. Each link is single-use and
   expires after 30 days; you can revoke an unused one at any time.
4. They open the link, continue with Google, and land back on the join screen to
   confirm.

Everyone sees the same data from any device or country. Budget shares re-divide
automatically as each new person joins — nothing needs to be re-entered.

## Project layout

```
src/lib/calc.ts        all budget and savings maths (pure, unit tested)
src/lib/calc.test.ts   the test suite
src/state/             auth session and trip data loading with realtime updates
src/screens/           Plan, Budget, Savings, Members, sign-in, join, create
src/components/        shared interface pieces and the SVG artwork
src/styles/            the design system, in four sheets
public/fonts/          the three self-hosted typefaces
supabase/schema.sql    tables, RLS policies, RPCs
```

## 6. The design

The look is a travel sketchbook — layered paper, warm shadows, stamps and
tickets — kept deliberately calm underneath so the numbers stay easy to read.

```
src/styles/tokens.css      palette, typefaces, paper grain, motion easings
src/styles/base.css        reset, typography, app shell, both navigations
src/styles/components.css  cards, tape, stamps, tickets, buttons, fields, states
src/styles/screens.css     the journal header and each screen's own treatment
```

`src/styles.css` imports those four in order and is the only stylesheet the app
loads.

**Colour.** Every colour is a custom property in `tokens.css`. Each travel ink
comes in three strengths: the plain name (`--teal`) fills illustrations, `-ink`
(`--teal-ink`) is darkened until it passes 4.5:1 on paper and is the only one
safe for text, and `-wash` is the tint behind it. The seven `--cat-*` inks used
by the budget chart are stepped so that neighbouring categories stay apart under
simulated colour blindness; every bar is directly labelled as well, so colour is
never the only thing telling two categories apart.

**Type.** Fraunces for headings, DM Sans for interface text, Caveat for the few
handwritten notes. All three are variable fonts, subset to latin, self-hosted
from `public/fonts` (SIL Open Font License — see `public/fonts/OFL.txt`) so the
app never calls out to a font CDN.

**Artwork.** Everything illustrated — the wordmark, the route to the
destination, the icons, the chart's hand-drawn bars, the empty-state spots — is
SVG drawn in `src/components/art.tsx`. There is no icon library and no imagery
to license.

**Motion.** Gentle: paper lifting on hover, a stamp coming down when a
contribution is recorded, the route inking itself in. Everything is disabled
under `prefers-reduced-motion: reduce`, and nothing needs an animation to
finish in order to be visible.
