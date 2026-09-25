-- ============================================================================
-- Phase 5 — Email notifications
--
-- notification_log records every notification email the portal tries to
-- send (sent, failed, or skipped because email isn't set up yet). The app
-- writes it with the service role; only admins can read it (Settings page).
--
-- Safe to run more than once.
-- ============================================================================

create table if not exists public.notification_log (
  id         bigint generated always as identity primary key,
  kind       text not null,
  recipient  text not null,
  subject    text not null,
  status     text not null check (status in ('sent', 'failed', 'skipped')),
  error      text,
  company_id uuid references public.companies (id),
  entity_id  text,
  created_at timestamptz not null default now()
);
create index if not exists notification_log_created_at_idx on public.notification_log (created_at desc);

alter table public.notification_log enable row level security;
revoke all on public.notification_log from anon, authenticated;
grant select on public.notification_log to authenticated;

drop policy if exists admin_read on public.notification_log;
create policy admin_read on public.notification_log for select to authenticated
  using (app.has_role('admin'));
