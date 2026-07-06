-- =========================================================
-- EventoPass — Schema v8: Org lifecycle + audit log
-- Run after schema_v7.sql, in Supabase SQL Editor.
-- =========================================================

-- 1. Organization status + primary owner ------------------------------------
alter table organizations add column if not exists status text not null default 'active' check (status in ('active','suspended'));
alter table organizations add column if not exists primary_owner_id uuid references auth.users(id);

update organizations set primary_owner_id = created_by where primary_owner_id is null;

-- Only a platform admin may change an org's status — enforced with a trigger
-- rather than relying on RLS alone, since RLS can't restrict individual
-- columns: an org admin is still allowed to UPDATE the row (to rename it),
-- so without this guard they could also flip their own suspension off.
create or replace function guard_org_status_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if OLD.status is distinct from NEW.status and not is_platform_admin() then
    raise exception 'Only platform admins can change an organization''s status';
  end if;
  return NEW;
end;
$$;
drop trigger if exists trg_guard_org_status on organizations;
create trigger trg_guard_org_status before update on organizations
  for each row execute function guard_org_status_change();

drop policy if exists "Admins can rename their org" on organizations;
create policy "Org admins or platform admins can update org" on organizations for update
  using (is_org_admin(id) or is_platform_admin());

create policy "Primary owner can delete their org" on organizations for delete
  using (primary_owner_id = auth.uid());

-- 2. Protect against orphaning an organization ------------------------------
-- Blocks: removing the primary owner from the admin list, and removing (or
-- demoting) the very last remaining admin of an org.
create or replace function guard_last_admin_removal()
returns trigger
language plpgsql
as $$
declare
  is_primary boolean;
  remaining_admins integer;
  target_org uuid := old.org_id;
begin
  -- Bypassed only by delete_organization() below, which sets this flag
  -- deliberately when tearing down an entire org (where the guard's
  -- "don't orphan the org" purpose no longer applies).
  if coalesce(current_setting('eventopass.deleting_org', true), '') = 'true' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'UPDATE' and not (old.role = 'admin' and new.role <> 'admin') then
    return new; -- role didn't change away from admin, nothing to guard
  end if;

  select (old.user_id = o.primary_owner_id) into is_primary from organizations o where o.id = target_org;
  if is_primary then
    raise exception 'Cannot remove the primary owner — transfer ownership to another admin first';
  end if;

  select count(*) into remaining_admins from organization_members
    where org_id = target_org and role = 'admin' and id <> old.id;
  if remaining_admins = 0 then
    raise exception 'Cannot remove the last remaining admin of this organization';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_guard_admin_delete on organization_members;
create trigger trg_guard_admin_delete before delete on organization_members
  for each row execute function guard_last_admin_removal();

drop trigger if exists trg_guard_admin_demote on organization_members;
create trigger trg_guard_admin_demote before update on organization_members
  for each row execute function guard_last_admin_removal();

-- 3. Tamper-proof audit log (defined early since several triggers below call it) --
-- No INSERT policy is defined for regular users at all — the only way a row
-- gets created is through SECURITY DEFINER trigger functions, so a client
-- can never fabricate or edit its own audit history.
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete set null,
  actor_email text,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table audit_log enable row level security;
create policy "Org admins and platform admins can view audit log" on audit_log for select
  using ((org_id is not null and is_org_admin(org_id)) or is_platform_admin());

create or replace function log_audit(p_org_id uuid, p_action text, p_details jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into audit_log (org_id, actor_email, action, details)
  values (p_org_id, coalesce(auth.jwt() ->> 'email', 'system'), p_action, p_details);
end;
$$;

-- 4. Transfer primary ownership --------------------------------------------
create or replace function transfer_org_ownership(p_org_id uuid, p_new_owner_email text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  current_owner uuid;
  new_owner_member record;
begin
  select primary_owner_id into current_owner from organizations where id = p_org_id;
  if current_owner is distinct from auth.uid() then
    raise exception 'Only the current primary owner can transfer ownership';
  end if;

  select * into new_owner_member from organization_members
    where org_id = p_org_id and lower(email) = lower(p_new_owner_email) and role = 'admin';
  if new_owner_member is null then
    raise exception 'That person must already be an admin of this organization before you can transfer ownership to them';
  end if;

  update organizations set primary_owner_id = new_owner_member.user_id where id = p_org_id;
  perform log_audit(p_org_id, 'ownership_transferred', jsonb_build_object('to_email', p_new_owner_email));
end;
$$;
grant execute on function transfer_org_ownership(uuid, text) to authenticated;

-- Deleting an org is destructive and irreversible, so it's a single atomic
-- SECURITY DEFINER function rather than several client-side calls: this lets
-- it deliberately bypass the last-admin guard above (which would otherwise
-- fire during the org's own membership teardown and block the delete) while
-- still logging exactly one clear audit entry instead of teardown noise.
create or replace function delete_organization(p_org_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  org_name text;
begin
  select name into org_name from organizations where id = p_org_id;
  if (select primary_owner_id from organizations where id = p_org_id) is distinct from auth.uid() then
    raise exception 'Only the primary owner can delete this organization';
  end if;

  perform log_audit(p_org_id, 'organization_deleted', jsonb_build_object('name', org_name));
  perform set_config('eventopass.deleting_org', 'true', true);

  delete from events where org_id = p_org_id;
  delete from organization_members where org_id = p_org_id;
  delete from organizations where id = p_org_id;
end;
$$;
grant execute on function delete_organization(uuid) to authenticated;

-- 5. Suspension helper + updated access functions (must exist before the
-- event policies below, since SQL policy expressions are checked at
-- creation time — unlike plpgsql function bodies, which aren't). ----------
create or replace function is_org_suspended(p_org_id uuid)
returns boolean
language sql stable
as $$
  select coalesce((select status = 'suspended' from organizations where id = p_org_id), false);
$$;

-- Suspension blocks event creation/editing/deleting, but NOT check-in/scanning
-- (registrations/check_events access is governed by is_event_team_v2, left
-- unchanged — a live event in progress shouldn't stop working mid-event over
-- a billing dispute).
create or replace function is_event_manager(event_row events)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    not is_org_suspended(event_row.org_id)
    and (
      auth.uid() = event_row.owner_id
      or (event_row.org_id is not null and is_org_admin(event_row.org_id))
      or exists (
        select 1 from team_members tm
        where tm.event_id = event_row.id
          and lower(tm.email) = lower(coalesce(auth.jwt() ->> 'email',''))
          and tm.role = 'manager'
      )
    );
$$;

-- 6. Fix: event deletion should follow org admin access, not just literal
-- owner_id (EventDetail's UI already treats org admins as full
-- "owner"-equivalent — this policy was never updated to match, so an org
-- admin who wasn't the original creator would see a Delete button that
-- silently failed). Also respects suspension, consistent with edits.
drop policy if exists "Owner can delete events" on events;
create policy "Owner or org admin can delete events" on events for delete
  using ((auth.uid() = owner_id or (org_id is not null and is_org_admin(org_id))) and not is_org_suspended(org_id));

drop policy if exists "Owners can insert events" on events;
create policy "Owners can insert events" on events for insert
  with check (auth.uid() = owner_id and not is_org_suspended(org_id));

-- 7. Audit triggers on org membership, org status, and event deletion -------
create or replace function audit_org_member_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('eventopass.deleting_org', true), '') = 'true' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'INSERT' then
    perform log_audit(new.org_id, 'member_invited', jsonb_build_object('email', new.email, 'role', new.role));
    return new;
  elsif tg_op = 'DELETE' then
    perform log_audit(old.org_id, 'member_removed', jsonb_build_object('email', old.email, 'role', old.role));
    return old;
  elsif tg_op = 'UPDATE' and old.role is distinct from new.role then
    perform log_audit(new.org_id, 'role_changed', jsonb_build_object('email', new.email, 'old_role', old.role, 'new_role', new.role));
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_member_insert on organization_members;
create trigger trg_audit_member_insert after insert on organization_members
  for each row execute function audit_org_member_change();
drop trigger if exists trg_audit_member_delete on organization_members;
create trigger trg_audit_member_delete after delete on organization_members
  for each row execute function audit_org_member_change();
drop trigger if exists trg_audit_member_update on organization_members;
create trigger trg_audit_member_update after update on organization_members
  for each row execute function audit_org_member_change();

create or replace function audit_org_status_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    perform log_audit(new.id, 'org_status_changed', jsonb_build_object('old_status', old.status, 'new_status', new.status));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_audit_org_status on organizations;
create trigger trg_audit_org_status after update on organizations
  for each row execute function audit_org_status_change();

create or replace function audit_event_deletion()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('eventopass.deleting_org', true), '') = 'true' then
    return old;
  end if;
  perform log_audit(old.org_id, 'event_deleted', jsonb_build_object('title', old.title, 'event_id', old.id));
  return old;
end;
$$;
drop trigger if exists trg_audit_event_delete on events;
create trigger trg_audit_event_delete after delete on events
  for each row execute function audit_event_deletion();
