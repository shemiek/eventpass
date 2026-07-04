-- =========================================================
-- EventoPass — Schema v4: critical RLS/security fixes
-- Run this in Supabase SQL Editor after schema_v3.sql (and schema_v3_fix.sql
-- if you ran that separately — this migration is safe to run either way).
--
-- Fixes three real bugs:
-- 1. Events UPDATE policy allowed ANY team member (including scanners) to
--    edit the event, not just managers/owners.
-- 2. Events SELECT policy was `using (true)` — needed so the public
--    registration page can load a single event by slug, but as a side
--    effect any authenticated user's dashboard query (which fetches all
--    events with no filter) could see every organizer's events, not just
--    their own. Dashboard.jsx is also being fixed to explicitly scope its
--    query, but this policy is tightened too, defense-in-depth.
-- 3. Registrations SELECT policy was `using (true)` so that an attendee's
--    own badge page could load their ticket without logging in — but this
--    also meant the ENTIRE registrations table (names, emails, phone
--    numbers, custom field answers, for every event) was readable by
--    anyone holding the public anon key, since RLS `true` doesn't
--    distinguish "I know this one ticket code" from "give me everything."
--    Fixed by moving public ticket lookups behind SECURITY DEFINER
--    functions that only ever return the one matching row, and locking
--    the table itself down to event team members only.
-- =========================================================

-- 1. Events: only managers/owner can update; only owner can delete --------
drop policy if exists "Team can update events" on events;
create policy "Managers can update events" on events for update using (is_event_manager(events));

drop policy if exists "Owner can delete events" on events;
create policy "Owner can delete events" on events for delete using (auth.uid() = owner_id);

-- 2. Events: public sees only published events; team sees their own (any status) --
drop policy if exists "Public can view events" on events;
create policy "Published events are public; team can view their own" on events for select
  using (status = 'published' or is_event_team_v2(events));

-- 3. Registrations: lock the table to event team members only -------------
drop policy if exists "Public can view own ticket" on registrations;
create policy "Team can view registrations" on registrations for select
  using (exists (select 1 from events e where e.id = registrations.event_id and is_event_team_v2(e)));

-- Public ticket/badge lookups now go through these SECURITY DEFINER
-- functions instead of querying the table directly — each only ever
-- returns the one row matching the exact code/id given, never a bulk list.

create or replace function get_registration_by_ticket(p_ticket_code text)
returns setof registrations
language sql security definer stable
set search_path = public
as $$
  select * from registrations where ticket_code = upper(p_ticket_code) limit 1;
$$;
grant execute on function get_registration_by_ticket(text) to anon, authenticated;

create or replace function get_event_registration_count(p_event_id uuid)
returns integer
language sql security definer stable
set search_path = public
as $$
  select count(*)::integer from registrations where event_id = p_event_id;
$$;
grant execute on function get_event_registration_count(uuid) to anon, authenticated;

create or replace function get_tier_registration_count(p_ticket_type_id uuid)
returns integer
language sql security definer stable
set search_path = public
as $$
  select count(*)::integer from registrations where ticket_type_id = p_ticket_type_id;
$$;
grant execute on function get_tier_registration_count(uuid) to anon, authenticated;
