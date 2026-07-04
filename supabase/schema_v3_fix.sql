-- =========================================================
-- EventoPass — Fix: infinite RLS recursion on team_members
-- Run this in Supabase SQL Editor. Safe to run any time after schema_v2.sql.
--
-- Root cause: is_event_manager() and is_event_team_v2() query team_members,
-- but were also used inside RLS policies ON team_members itself — so
-- checking access to team_members re-triggered the same policy check,
-- recursing until Postgres hit "stack depth limit exceeded".
--
-- Fix: mark both functions SECURITY DEFINER so their internal query against
-- team_members bypasses RLS instead of re-evaluating it.
-- =========================================================

create or replace function is_event_manager(event_row events)
returns boolean
language sql stable security definer
set search_path = public
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
language sql stable security definer
set search_path = public
as $$
  select
    auth.uid() = event_row.owner_id
    or exists (
      select 1 from team_members tm
      where tm.event_id = event_row.id
        and lower(tm.email) = lower(coalesce(auth.jwt() ->> 'email',''))
    );
$$;
