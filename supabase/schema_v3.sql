-- =========================================================
-- EventoPass — Schema v3 upgrade
-- Run this AFTER schema.sql and schema_v2.sql, in Supabase SQL Editor.
-- Adds per-session attendance tracking. (check_events from v2 already
-- supports the audit trail, occupancy dashboard, and dwell-time features —
-- no schema change needed for those, just new UI reading existing data.)
-- =========================================================

create table if not exists session_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade not null,
  registration_id uuid references registrations(id) on delete cascade not null,
  checked_in_at timestamptz not null default now(),
  staff_email text
);
create index if not exists idx_session_attendance_session on session_attendance(session_id);
create index if not exists idx_session_attendance_reg on session_attendance(registration_id);

alter table session_attendance enable row level security;

create policy "Team can view session attendance" on session_attendance for select
  using (exists (
    select 1 from sessions s join events e on e.id = s.event_id
    where s.id = session_attendance.session_id and is_event_team_v2(e)
  ));

create policy "Team can log session attendance" on session_attendance for insert
  with check (exists (
    select 1 from sessions s join events e on e.id = s.event_id
    where s.id = session_attendance.session_id and is_event_team_v2(e)
  ));
