# EventoPass

Mobile-friendly event registration, custom forms, digital badges, and QR check-in — built to run entirely on free tiers (Supabase + Vercel/Netlify).

## What it does

- **Ticket tiers** with per-tier capacity and optional pricing (e.g. VIP: 50 seats, General: 200)
- **Multi-session agendas** — attendees pick which sessions they'll attend, with a dedicated scan point per session
- **Draft/Published events**, **registration deadlines**, and **overall capacity caps** with automatic closing
- **Separate start/end date and time**, plus a **Google Maps preview** from the event address (no API key required)
- **Optional approval workflow** — registrations stay pending until an organizer approves them; badges are withheld until then
- **Role-based team access** — invite teammates by email as **Manager** (edit event, manage team, export data) or **Scanner** (check-in/out only, cannot edit); enforced both in the UI and at the database level
- **Badge customization** — accent color and footer text per event
- **Camera-based check-in AND check-out** with an explicit mode toggle, gate tracking, and full audit trail
- **Live multi-gate occupancy dashboard** with an occupancy-over-time chart
- **Per-attendee history** — full check-in/out timeline per person, plus dwell-time and re-entry tracking
- **Per-session attendance tracking**, independent of overall event check-in
- **Manual walk-in check-in**, **bulk CSV import**, and **name/mobile search** in the scanner (for when a QR code isn't available)
- **Dashboard as its own tab** with toggleable widgets and **PDF/CSV export** of the summary metrics
- **CSV and Excel export** of full attendee data (Excel includes a Registrations sheet + Summary sheet)
- **Public marketing landing page** at the root URL for signed-out visitors, with a dashboard redirect for logged-in users
- **WhatsApp sharing** — share the registration link with invitees, or share an attendee's badge image directly via the native share sheet (falls back to a text link on desktop, where file-sharing isn't available)
- **Delete event**, with an explicit warning showing exactly how much data will be lost, gated to the event owner
- **VIP flagging and notes**, visible in the attendee table and to staff during scanning

Everything is a single responsive web app (installable as a PWA — "Add to Home Screen") so there's no App Store step.

---

## 1. Set up Supabase (free tier)

1. Go to https://supabase.com → create a free account → **New project**.
2. Open **SQL Editor** → paste the entire contents of `supabase/schema.sql` → **Run**.
3. Then run `supabase/schema_v2.sql` the same way — this adds ticket tiers, sessions, roles, check-in gates, and badge customization on top of the base schema.
4. Then run `supabase/schema_v3.sql` — this adds per-session attendance tracking.
5. Then run `supabase/schema_v4.sql` — **fixes three real security bugs**: scanners being able to edit events, organizers' dashboards not being properly scoped to their own events, and the registrations table (attendee PII) being publicly readable beyond just "someone who knows one ticket code." Not optional — run this even on an existing setup.
6. Then run `supabase/schema_v5.sql` — adds registration deadlines, event end date, and the approval workflow.
7. Then run `supabase/schema_v6.sql` — adds the platform admin portal, richer signup profiles, a hard guarantee against duplicate consecutive check-in/out events, and (importantly) enables Realtime replication on `registrations` and `check_events`, which is very likely why check-in status wasn't updating without a manual reload — creating a table via SQL doesn't automatically add it to Supabase's realtime publication.
8. **Make yourself the first platform admin** by running this in the SQL Editor, with your own email:
   ```sql
   insert into platform_admins (email) values ('you@example.com');
   ```
   There's no other way to bootstrap the very first admin — after that, admins can manage the list themselves from the database (there's no UI for adding/removing admins yet, intentionally, since it's a small, sensitive list).
9. Go to **Project Settings → API**. Copy:
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
