-- =========================================================
-- EventoPass — Schema v10
-- Run after schema_v9.sql, in Supabase SQL Editor.
-- =========================================================

-- Mirrors the actual Supabase Auth ban status (set by the
-- admin-deactivate-user Edge Function using the service role) so the Admin
-- Portal can display and toggle it without an extra API round-trip.
-- Deliberately no client-facing UPDATE policy on this column — only the
-- Edge Function (service role, bypasses RLS) can ever change it.
alter table profiles add column if not exists is_deactivated boolean not null default false;

-- Security fix: event creation never actually verified the creator belongs
-- to the organization they were attaching the event to — only that
-- owner_id matched themselves. Any authenticated user could have inserted
-- an event under ANY org_id, polluting an organization they have no
-- membership in at all.
drop policy if exists "Owners can insert events" on events;
create policy "Owners can insert events" on events for insert
  with check (
    auth.uid() = owner_id
    and not is_org_suspended(org_id)
    and (org_id is null or is_org_admin(org_id))
  );
