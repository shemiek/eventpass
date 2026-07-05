-- =========================================================
-- EventoPass — Schema v7: Organizations (multi-admin tenancy)
-- Run after schema_v6.sql, in Supabase SQL Editor.
--
-- What changes conceptually:
-- Before: a "tenant" was one user (events.owner_id). Multiple people could
-- only get involved per-event, via team_members (manager/scanner).
-- After: a tenant is an ORGANIZATION. Any org admin has full access to
-- EVERY event under that org — not just events they personally created.
-- Per-event team_members (manager/scanner) still exists on top of this,
-- for finer-grained access (e.g. a scanner who should only see one event).
--
-- Existing data: every current event has exactly one owner. This migration
-- auto-creates one organization per existing owner and backfills events.org_id,
-- so nothing breaks and no manual re-assignment is needed.
--
-- Going forward: every new signup automatically gets their own organization
-- (they can rename it and invite co-admins later) — so the "just sign up
-- and go" simplicity is unchanged for solo organizers.
-- =========================================================

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Organization',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade, -- null until the invited person signs up
  email text not null,
  role text not null default 'admin' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  unique (org_id, email)
);

alter table events add column if not exists org_id uuid references organizations(id);

-- 1. Backfill: one organization per existing event owner ------------------
with owners as (
  select distinct owner_id from events where owner_id is not null
),
new_orgs as (
  insert into organizations (name, created_by)
  select coalesce(p.organization, 'My Organization'), o.owner_id
  from owners o
  left join profiles p on p.id = o.owner_id
  returning id, created_by
)
insert into organization_members (org_id, user_id, email, role)
select no.id, no.created_by, u.email, 'admin'
from new_orgs no
join auth.users u on u.id = no.created_by
on conflict (org_id, email) do nothing;

update events e
set org_id = om.org_id
from organization_members om
where om.user_id = e.owner_id and e.org_id is null;

-- 2. Auto-create an organization for every NEW signup ---------------------
create or replace function handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  insert into profiles (id, email, full_name, organization, phone)
  values (
    new.id, new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'organization',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;

  insert into organizations (name, created_by)
  values (coalesce(new.raw_user_meta_data ->> 'organization', 'My Organization'), new.id)
  returning id into new_org_id;

  insert into organization_members (org_id, user_id, email, role)
  values (new_org_id, new.id, new.email, 'admin');

  -- Link any pending org invites sent to this email before they had an account
  update organization_members
  set user_id = new.id
  where lower(email) = lower(new.email) and user_id is null;

  return new;
end;
$$;
-- (trigger on_auth_user_created from schema_v6.sql already points at this function — no need to recreate it)

-- 3. Helper: is the current user an admin of this org? ---------------------
create or replace function is_org_admin(p_org_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_members om
    where om.org_id = p_org_id
      and om.role = 'admin'
      and (om.user_id = auth.uid() or lower(om.email) = lower(coalesce(auth.jwt() ->> 'email','')))
  );
$$;
grant execute on function is_org_admin(uuid) to authenticated;

-- Narrow lookup used only when inviting someone to an org: returns just the
-- user id if that email already has an account, nothing else about them.
-- Safe to expose broadly since it reveals no personal data beyond "this
-- email has signed up" (needed anyway to send the invite).
create or replace function find_user_id_by_email(p_email text)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from profiles where lower(email) = lower(p_email) limit 1;
$$;
grant execute on function find_user_id_by_email(text) to authenticated;

-- 4. Extend event access checks to include org admins ----------------------
create or replace function is_event_manager(event_row events)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    auth.uid() = event_row.owner_id
    or (event_row.org_id is not null and is_org_admin(event_row.org_id))
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
    or (event_row.org_id is not null and is_org_admin(event_row.org_id))
    or exists (
      select 1 from team_members tm
      where tm.event_id = event_row.id
        and lower(tm.email) = lower(coalesce(auth.jwt() ->> 'email',''))
    );
$$;

-- 5. RLS for the new tables --------------------------------------------------
alter table organizations enable row level security;
alter table organization_members enable row level security;

create policy "Members can view their org" on organizations for select
  using (exists (select 1 from organization_members om where om.org_id = organizations.id and om.user_id = auth.uid()));
create policy "Admins can rename their org" on organizations for update
  using (is_org_admin(id));
create policy "Any authenticated user can create an org" on organizations for insert
  with check (auth.uid() = created_by);

create policy "Members can view org membership" on organization_members for select
  using (user_id = auth.uid() or is_org_admin(org_id));
create policy "Admins can add org members" on organization_members for insert
  with check (is_org_admin(org_id));
create policy "Admins can change roles" on organization_members for update
  using (is_org_admin(org_id));
create policy "Admins can remove members" on organization_members for delete
  using (is_org_admin(org_id));

-- 6. New events must specify an org (enforced at the app layer too) --------
-- Not making org_id NOT NULL yet, to avoid breaking any edge-case rows the
-- backfill above might have missed (e.g. an event whose owner account was
-- since deleted). Safe to tighten later once you've confirmed org_id is
-- populated everywhere: alter table events alter column org_id set not null;
