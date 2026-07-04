-- =========================================================
-- EventoPass — Schema v5
-- Run after schema_v4.sql, in Supabase SQL Editor.
-- =========================================================

alter table events add column if not exists registration_deadline timestamptz; -- null = no deadline
alter table events add column if not exists event_end_date timestamptz; -- null = no end time shown
alter table events add column if not exists requires_approval boolean not null default false;

alter table registrations add column if not exists status text not null default 'approved'
  check (status in ('pending','approved','rejected'));

-- Existing rows are unaffected (default 'approved' preserves current behavior for
-- events that already have registrations, since requires_approval defaults to false).
