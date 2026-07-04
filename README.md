# EventoPass

Mobile-friendly event registration, custom forms, digital badges, and QR check-in — built to run entirely on free tiers (Supabase + Vercel/Netlify).

## What it does

- **Ticket tiers** with per-tier capacity and optional pricing (e.g. VIP: 50 seats, General: 200)
- **Multi-session agendas** — attendees pick which sessions they'll attend
- **Draft/Published events** — hide an event from the public link until it's ready
- **Overall capacity caps** with automatic "sold out" / registration-closed handling
- **Role-based team access** — invite teammates by email as **Manager** (edit event, manage team, export data) or **Scanner** (check-in only); access activates the moment they sign up with that email
- **Badge customization** — accent color and footer text per event
- **Camera-based check-in AND check-out** with an explicit mode toggle on the scanner (switch between check-in and check-out flows), gate tracking, and a full audit trail
- **Live multi-gate occupancy dashboard** — real-time count of who's currently inside, broken down per gate
- **Per-attendee history** — expand any attendee to see their full check-in/out timeline, including which gate and which staff member scanned them
- **Per-session attendance tracking** — separate scan point for each session/agenda item, independent of overall event check-in
- **Re-entry and dwell-time tracking** — see how long each attendee spent on-site and how many times they re-entered, plus an occupancy-over-time chart
- **Manual walk-in check-in** for attendees who didn't pre-register
- **Bulk CSV import** of pre-registered attendees
- **Search/filter/sort** the attendee table (by name, email, ticket code, status, tier)
- **Analytics** — registrations-over-time chart and ticket tier breakdown
- **CSV and Excel export** (Excel includes a Registrations sheet + a Summary sheet)
- **VIP flagging and notes**, visible in the attendee table and to staff during scanning

Everything is a single responsive web app (installable as a PWA — "Add to Home Screen") so there's no App Store step.

---

## 1. Set up Supabase (free tier)

1. Go to https://supabase.com → create a free account → **New project**.
2. Open **SQL Editor** → paste the entire contents of `supabase/schema.sql` → **Run**.
3. Then run `supabase/schema_v2.sql` the same way — this adds ticket tiers, sessions, roles, check-in gates, and badge customization on top of the base schema.
4. Then run `supabase/schema_v3.sql` — this adds per-session attendance tracking. (The occupancy dashboard, check-in history, and dwell-time features reuse the `check_events` table from schema_v2, so no extra migration is needed for those.)
5. Go to **Project Settings → API**. Copy:
   - **Project URL**
   - **anon public** key

## 2. Configure the app

```bash
cp .env.example .env
```

Edit `.env`:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

## 3. Run locally

```bash
npm install
npm run dev
```

Open the printed local URL. Create an organizer account from the **Login** page, then **+ New event**.

## 4. Deploy for free (pick one)

### Option A — Vercel
1. Push this folder to a GitHub repo.
2. https://vercel.com → **New Project** → import the repo.
3. Framework preset: **Vite**. Add the two env vars from `.env` in the Vercel project settings.
4. Deploy. You'll get a URL like `https://your-app.vercel.app` reachable from any phone, anywhere.

### Option B — Netlify
1. Push to GitHub.
2. https://netlify.com → **Add new site → Import an existing project**.
3. Build command: `npm run build`, publish directory: `dist`.
4. Add the two env vars under **Site settings → Environment variables**.
5. Deploy.

Both give you free HTTPS, a shareable URL, and auto-redeploy whenever you push changes.

## 5. Using it day-to-day

- **Create an event** → set the banner, date, location, and any custom fields → optionally list staff emails who should be able to scan at the door (they need their own EventPass login with that exact email).
- **Share the registration link** shown on the event page (`/e/your-event-slug`) — post it, email it, or QR-code it yourself for a poster.
- **At the door**, staff open the app on their phone, sign in, go to the event → **Scan check-in**, and allow camera access. Each scan instantly checks the attendee in and flags duplicates or invalid tickets.
- **Export CSV** any time from the event page for post-event reporting.

## Notes on the free tiers

- Supabase free tier: 500MB database, 1GB file storage, 50k monthly active users — comfortably covers small-to-mid-size events.
- Vercel/Netlify free tier: generous bandwidth for a app this size, custom domain support if you want one later.
- No backend server to manage — Supabase handles auth, database, storage, and realtime updates directly from the browser via Row Level Security, so there's nothing else to host or pay for.

## Project structure

```
src/
  lib/            Supabase client + auth hook
  components/     FormFieldBuilder, DynamicFormRenderer, TicketBadge, Navbar
  pages/          Login, Dashboard, EventForm, EventDetail, PublicRegister,
                   RegistrationSuccess (badge), ScanCheckIn (camera QR scanner)
supabase/
  schema.sql      Tables, RLS policies, storage bucket — run once in Supabase
```
