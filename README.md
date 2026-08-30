# WeGo

A small web app for groups of friends to plan trips together and track what
everyone still needs to save. Built with React, TypeScript, Vite and Supabase,
hosted on GitHub Pages. Sign-in is through Google, so there is no password to
remember and no email delivery to go wrong.

It is dressed as a shared travel sketchbook: paper and ink rather than a finance
dashboard, with postcards, ticket stubs, status stamps and a hand-drawn route
that fills in as the group saves.

Signing in opens **My Trips** — a rack of postcards, one per trip you own or
have joined, showing its destination, departure date, your role, how many
travellers are going, the estimated budget and how far the fund has come. Filter
by upcoming, past or archived; open any trip, or start another.

Inside a trip there are four screens:

- **Plan** — shared trip ideas with a status (Idea / Maybe / Confirmed / Booked),
  optional date, link and note. Filter by status, sort by date.
- **Budget** — shared and personal costs by category, with running totals and
  each member's estimated and actual share.
- **Savings** — a private record of what each person has put aside, with a
  target, progress bar, weekly and monthly rate, and on-track status.
- **Members** — who is coming, and the invitation links that got them there.

Every trip is separate: its own plan, budget, savings, travellers and
invitations. Nothing crosses between them, and the group size is never
hardcoded — shared costs divide by however many members that trip has at the
moment you look at it.

A fifth page, **This trip**, is where the owner edits the cover page and
archives, restores or deletes the trip, and where everyone else can leave it.

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
2. Open **SQL Editor** and run every file in
   [`supabase/migrations/`](supabase/migrations/) in order, once each. Together
   they create every table, Row Level Security policy and RPC. If you set this
   project up before trips became a collection, you have already run `0001`
   (it was `supabase/schema.sql`) — run only the migrations after it.
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
  checked by the `is_trip_member()` helper. Knowing or guessing a trip's id
  grants nothing, and archiving changes none of that — an archived trip is
  exactly as private as a live one.
- Membership itself can only be written by two `SECURITY DEFINER` functions —
  `create_trip()` and `accept_invitation()` — so a client cannot add itself to
  someone else's trip, and removed only by `leave_trip()`, which removes only
  your own and refuses outright for the owner.
- Managing a trip — editing it, inviting people, archiving, restoring,
  deleting — is the owner's alone, checked by `is_trip_owner()`. Members can
  read everything and leave.
- A trip must be archived before it can be deleted: the delete policy requires
  `archived_at is not null`. Deleting then cascades to the trip's members,
  invitations, plan items, costs and savings, and touches no other trip.
- A trip's `id`, creator and creation date cannot be edited at all — a trigger
  refuses, so nobody can move a trip to a new owner or forge its age.
- Savings entries are readable by the whole group but writable only by their
  owner (`user_id = auth.uid()` on insert, update and delete).
- Invitation tokens are 32 bytes of database-generated randomness (two v4
  UUIDs, base64url), and belong to exactly one trip. Accepting one is a single
  transaction that locks the row (`FOR UPDATE`), marks it accepted, and refuses
  any later use.

## 3. Testing

```bash
npm test        # calculation suite (budget splits, savings targets and rates)
npm run build   # type check + production build
npm run preview # serve the production build locally
```

There is also a live check that runs against a real Supabase project. It creates
throwaway accounts and asserts that Row Level Security actually holds — that a
non-member sees nothing, that one trip's costs never reach another, that an
invitation cannot be redeemed twice, that only owners can manage a trip, and
that nobody can edit someone else's savings:

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
under-one-week case, and the departed-trip warning — plus, for a collection of
trips, that each card counts only its own trip's costs, savings and members,
that the same person can be owner of one trip and member of another, that a
remembered trip is never reopened once it is out of reach, and that a mangled
trip id in the address falls back to the dashboard.

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

**Database changes.** Adding a file to
[`supabase/migrations/`](supabase/migrations/) does nothing to your database —
they are version control for the schema, not automation. Paste each new
migration into the Supabase SQL Editor yourself, once, in order. Forgetting this
is the most likely way to break the live app: the new code deploys expecting a
column that does not exist yet.

**Environment variables.** Production reads `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` from GitHub Actions secrets, not from your local
`.env`. If you move to a different Supabase project, update both:

```bash
gh secret set VITE_SUPABASE_URL --repo <owner>/<repo>
gh secret set VITE_SUPABASE_ANON_KEY --repo <owner>/<repo>
```

Google OAuth settings live in Google Cloud Console and the Supabase dashboard,
so they are not in this repo either.

## 5. Trips, invitations and the collection

**Starting a trip.** Sign in, then **Start a trip** from My Trips: name,
destination, departure date, currency. Whoever creates a trip owns it.

**Inviting friends.** Open the trip, then **Members → Invite a friend**.
Optionally label the link with who it is for, then create it and send it to that
one person. Each link belongs to that trip alone, is single-use, and expires
after 30 days; the owner can revoke an unused one at any time. They open the
link, continue with Google, and land back on the join screen to confirm.

Everyone sees the same data from any device or country. Budget shares re-divide
automatically as each new person joins — nothing needs to be re-entered.

**Switching trips.** The luggage tag in the masthead names the trip you are in;
tap it for the full list, or for My Trips, from anywhere in the app. The trip
you had open last is marked on the dashboard so you can pick it straight back
up — unless you have since left it or it has been deleted, in which case it is
quietly forgotten rather than reopened.

**Archiving.** Owners can file a finished trip away. Nothing is deleted: the
plan, the ledger and everyone's savings stay exactly as they were, the trip
moves to the archived shelf, and it stops accepting new travellers until it is
restored.

**Leaving.** Anyone who joined a trip can leave it, after a confirmation that
spells out what happens: they come off the traveller list, the shared costs
re-divide between the people who are left, and their own savings record for that
trip goes with them. The plan and the budget the group wrote stay put. Owners
cannot leave their own trip — there is no ownership transfer in this version, so
they archive or delete it instead.

**Deleting.** Permanent, and only ever available on an archived trip. It asks
the owner to type the trip's name, then removes that trip and everything in it
for everybody. Every other trip is untouched.

## Project layout

```
src/lib/calc.ts        all budget and savings maths (pure, unit tested)
src/lib/trips.ts       trip status, permissions and dashboard summaries
src/lib/useHashRoute.ts  the routes, including which trip is open
src/state/             auth session, the trip collection, and one open trip
src/screens/           My Trips, Plan, Budget, Savings, Members, trip settings,
                       sign-in, join, create
src/components/        shared interface pieces and the SVG artwork
src/styles/            the design system, in four sheets
public/fonts/          the three self-hosted typefaces
supabase/migrations/   tables, RLS policies, RPCs — run in order, once each
```

Routing is hash-based and always names the open trip, so a link to a page inside
a trip survives a reload and no screen can infer which trip it is showing:

```
#/trips                 My Trips
#/new                   the blank-journal form
#/t/<tripId>/plan       and /budget, /savings, /members, /settings
#/join/<token>          an invitation link
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
