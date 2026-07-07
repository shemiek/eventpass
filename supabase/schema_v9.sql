-- =========================================================
-- EventoPass — Schema v9
-- Run after schema_v8.sql, in Supabase SQL Editor.
-- =========================================================

alter table events add column if not exists ticket_label text not null default 'Ticket type';
alter table events add column if not exists ticket_required boolean not null default true;
alter table events add column if not exists show_map boolean not null default true;

-- No new table needed for "email attendees" — it reuses the existing
-- log_audit() function from schema_v8 with a new action name
-- ('attendee_email_sent'), called from the send-attendee-email Edge
-- Function using the service-role client (see supabase/functions/).
