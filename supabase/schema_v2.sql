-- =========================================================
-- EventoPass — Schema v2 upgrade
-- Run this AFTER schema.sql, in Supabase SQL Editor.
-- Safe to run once; uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS throughout.
-- =========================================================

-- 1. EVENTS: status, capacity, badge customization ------------
alter table events add column if not exists status text not null default 'published' check (status in ('draft','published'));
alter table events add column if not exists capacity integer; -- null = unlimited
alter table events add column if not exists badge_accent text not null default '#1C2544';
alter table events add column if not exists badge_footer_text text;

-- 2. TICKET TYPES ----------------------------------------------
create table if not exists ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  name text not null,
  capacity integer, -- null = unlimited within this tier
  price numeric(10,2),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 3. SESSIONS (multi-session / agenda) --------------------------
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  capacity integer,
  sort_order integer not null default 0
);

-- 4. TEAM MEMBERS (replaces plain staff_emails array with roles) --
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  email text not null,
  role text not null default 'scanner' check (role in ('manager','scanner')),
  invited_at timestamptz not null default now(),
  unique (event_id, email)
);

-- Backfill team_members from the old staff_emails array so existing events keep their staff.
insert into team_members (event_id, email, role)
select id, unnest(staff_emails), 'scanner' from events
where staff_emails is not null and array_length(staff_emails,1) > 0
on conflict (event_id, email) do nothing;

-- 5. REGISTRATIONS: ticket type, sessions, VIP/notes -------------
alter table registrations add column if not exists ticket_type_id uuid references ticket_types(id);
alter table registrations add column if not exists session_ids uuid[] not null default '{}';
alter table registrations add column if not exists vip boolean not null default false;
alter table registrations add column if not exists notes text;

-- 6. CHECK EVENTS (supports multiple gates + check-out with timestamps) --
create table if not exists check_events (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid references registrations(id) on delete cascade not null,
  direction text not null check (direction in ('in','out')),
  gate_name text,
  staff_email text,
  at timestamptz not null default now()
);
create index if not exists idx_check_events_reg on check_events(registration_id);

-- 7. Helper: is current user manager/owner (can edit) vs scanner-only ----
create or replace function is_event_manager(event_row events)
returns boolean
language sql stable
as $$
  select
    auth.uid() = event_row.owner_id
    or exists (
      select 1 from team_members tm
      where tm.event_id = event_row.id
        and lower(tm.email) = lower(coalesce(auth.jwt() ->> 'email',''))
        and tm.role = 'manager'
    );
$$;

create or replace function is_event_team_v2(event_row events)
returns boolean
language sql stable
as $$
  select
    auth.uid() = event_row.owner_id
    or exists (
      select 1 from team_members tm
      where tm.event_id = event_row.id
        and lower(tm.email) = lower(coalesce(auth.jwt() ->> 'email',''))
    );
$$;

-- 8. RLS for new tables -------------------------------------------
alter table ticket_types enable row level security;
alter table sessions enable row level security;
alter table team_members enable row level security;
alter table check_events enable row level security;

create policy "Public can view ticket types" on ticket_types for select using (true);
create policy "Managers can manage ticket types" on ticket_types for all
  using (exists (select 1 from events e where e.id = ticket_types.event_id and is_event_manager(e)))
  with check (exists (select 1 from events e where e.id = ticket_types.event_id and is_event_manager(e)));

create policy "Public can view sessions" on sessions for select using (true);
create policy "Managers can manage sessions" on sessions for all
  using (exists (select 1 from events e where e.id = sessions.event_id and is_event_manager(e)))
  with check (exists (select 1 from events e where e.id = sessions.event_id and is_event_manager(e)));

create policy "Team can view team members" on team_members for select
  using (exists (select 1 from events e where e.id = team_members.event_id and is_event_team_v2(e)));
create policy "Managers can manage team members" on team_members for all
  using (exists (select 1 from events e where e.id = team_members.event_id and is_event_manager(e)))
  with check (exists (select 1 from events e where e.id = team_members.event_id and is_event_manager(e)));

create policy "Team can view check events" on check_events for select
  using (exists (
    select 1 from registrations r join events e on e.id = r.event_id
    where r.id = check_events.registration_id and is_event_team_v2(e)
  ));
create policy "Team can insert check events" on check_events for insert
  with check (exists (
    select 1 from registrations r join events e on e.id = r.event_id
    where r.id = check_events.registration_id and is_event_team_v2(e)
  ));

-- 9. Update events/registrations policies to use the new team check ----
drop policy if exists "Team can update events" on events;
create policy "Team can update events" on events for update using (is_event_team_v2(events));

drop policy if exists "Team can update registrations" on registrations;
create policy "Team can update registrations" on registrations for update
  using (exists (select 1 from events e where e.id = registrations.event_id and is_event_team_v2(e)));

create policy "Team can insert walk-in registrations" on registrations for insert
  with check (
    true -- public registration still allowed; team inserts pass through the same policy
  );
