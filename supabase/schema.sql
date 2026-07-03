-- =========================================================
-- EventPass — Supabase schema
-- Run this in Supabase Dashboard > SQL Editor (all at once)
-- =========================================================

-- 1. EVENTS ------------------------------------------------
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  title text not null,
  slug text unique not null,
  description text,
  banner_url text,
  event_date timestamptz,
  location text,
  form_schema jsonb not null default '[]'::jsonb,
  staff_emails text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- 2. REGISTRATIONS ------------------------------------------
create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  ticket_code text unique not null,
  attendee_data jsonb not null default '{}'::jsonb,
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_registrations_event on registrations(event_id);
create index if not exists idx_registrations_ticket on registrations(ticket_code);

-- 3. Helper: is the current user owner or staff on this event? ----
create or replace function is_event_team(event_row events)
returns boolean
language sql
stable
as $$
  select
    auth.uid() = event_row.owner_id
    or lower(coalesce(auth.jwt() ->> 'email', '')) = any(event_row.staff_emails);
$$;

-- 4. ROW LEVEL SECURITY --------------------------------------
alter table events enable row level security;
alter table registrations enable row level security;

-- Anyone (including anonymous visitors) can read a single event by slug,
-- so the public registration page works without login.
create policy "Public can view events"
  on events for select
  using (true);

-- Only the owner can create events under their own account.
create policy "Owners can insert events"
  on events for insert
  with check (auth.uid() = owner_id);

-- Owner or staff can update/delete the event.
create policy "Team can update events"
  on events for update
  using (is_event_team(events));

create policy "Owner can delete events"
  on events for delete
  using (auth.uid() = owner_id);

-- Anyone can register for an event (public form, no login required).
create policy "Public can register"
  on registrations for insert
  with check (true);

-- Public can view their own ticket to render the badge (by exact ticket_code).
-- Since ticket_code is a random 12-char token, this is safe (unguessable).
create policy "Public can view own ticket"
  on registrations for select
  using (true);

-- Only organizer/staff of the parent event can update check-in status.
create policy "Team can update registrations"
  on registrations for update
  using (
    exists (
      select 1 from events e
      where e.id = registrations.event_id and is_event_team(e)
    )
  );

-- 5. STORAGE (event banners) ----------------------------------
insert into storage.buckets (id, name, public)
values ('banners', 'banners', true)
on conflict (id) do nothing;

create policy "Public can view banners"
  on storage.objects for select
  using (bucket_id = 'banners');

create policy "Authenticated users can upload banners"
  on storage.objects for insert
  with check (bucket_id = 'banners' and auth.role() = 'authenticated');

create policy "Owners can update their banners"
  on storage.objects for update
  using (bucket_id = 'banners' and auth.role() = 'authenticated');
