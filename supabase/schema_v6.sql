-- =========================================================
-- EventoPass — Schema v6
-- Run after schema_v5.sql, in Supabase SQL Editor.
--
-- Adds:
-- 1. A `profiles` table capturing extra signup info (name, organization,
--    phone) via a trigger on auth.users — this is what powers "capture more
--    info at signup" and gives the admin portal something to list.
-- 2. A `platform_admins` allowlist + is_platform_admin() function — a
--    genuine platform-wide admin role, separate from the per-event
--    owner/manager/scanner roles that already exist.
-- 3. A trigger that hard-blocks two consecutive check_events with the same
--    direction for the same registration (defense-in-depth against
--    double-taps, double-scans, or concurrent requests).
-- 4. Enabling Realtime replication on `registrations` and `check_events` —
--    this is almost certainly why check-in/out status wasn't updating
--    without a page reload. Creating a table via SQL does NOT automatically
--    add it to Supabase's realtime publication; that's a separate step,
--    and it was simply missed in earlier migrations.
-- =========================================================

-- 1. Profiles (extra signup info) --------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  organization text,
  phone text,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into profiles (id, email, full_name, organization, phone)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'organization',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill profiles for anyone who already signed up before this migration.
insert into profiles (id, email, full_name, organization, phone)
select id, email, raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'organization', raw_user_meta_data ->> 'phone'
from auth.users
on conflict (id) do nothing;

-- 2. Platform admin role --------------------------------------------------
create table if not exists platform_admins (
  email text primary key,
  added_at timestamptz not null default now()
);

create or replace function is_platform_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from platform_admins pa
    where lower(pa.email) = lower(coalesce(auth.jwt() ->> 'email',''))
  );
$$;
grant execute on function is_platform_admin() to authenticated;

alter table profiles enable row level security;
alter table platform_admins enable row level security;

create policy "Users see own profile, admins see all" on profiles for select
  using (auth.uid() = id or is_platform_admin());

create policy "Admins manage the admin list" on platform_admins for all
  using (is_platform_admin()) with check (is_platform_admin());

-- Let platform admins see everything, on top of the existing team-based access.
drop policy if exists "Published events are public; team can view their own" on events;
create policy "Published, team, or platform admin" on events for select
  using (status = 'published' or is_event_team_v2(events) or is_platform_admin());

drop policy if exists "Team can view registrations" on registrations;
create policy "Team or platform admin can view registrations" on registrations for select
  using (exists (select 1 from events e where e.id = registrations.event_id and is_event_team_v2(e)) or is_platform_admin());

-- IMPORTANT: after running this file, make yourself the first admin by running
-- (with your own email):
--   insert into platform_admins (email) values ('you@example.com');

-- 3. Prevent consecutive duplicate check_events ---------------------------
create or replace function prevent_consecutive_duplicate_check_event()
returns trigger
language plpgsql
as $$
declare
  last_direction text;
begin
  select direction into last_direction
  from check_events
  where registration_id = new.registration_id
  order by at desc
  limit 1;

  if last_direction is not null and last_direction = new.direction then
    raise exception 'duplicate_consecutive_check_event: a % event was already the most recent for this registration', new.direction
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_consecutive_duplicate on check_events;
create trigger trg_prevent_consecutive_duplicate
  before insert on check_events
  for each row execute function prevent_consecutive_duplicate_check_event();

-- 4. Enable Realtime on the tables the live dashboard depends on ----------
do $$
begin
  alter publication supabase_realtime add table registrations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table check_events;
exception when duplicate_object then null;
end $$;
