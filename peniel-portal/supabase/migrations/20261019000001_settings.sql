-- ============================================================================
-- Settings that admins change in the portal (Ops → Settings)
--
-- portal_settings: one row per group, value = jsonb, merged over the app's
-- defaults (lib/settings.ts), so a missing row or key means "the default":
--   emails_off         groups of notification emails turned off
--   report_recipients  staff who get the end-of-day and monthly reports
--   coa                what the Certificate of Analysis prints (company,
--                      document no., revision, phone numbers, liner type ID)
--   plant              camera reject limit, minutes per oven pass, sheets a
--                      stillage starts at
-- Staff read (their pages use them); only admin changes them. Audited.
-- Reason presets (hold_reason_presets) were already admin-editable in the
-- database; the Settings page now edits them. Safe to run more than once.
-- ============================================================================

create table if not exists public.portal_settings (
  id         uuid not null default gen_random_uuid(),
  key        text primary key check (key in ('emails_off', 'report_recipients', 'coa', 'plant')),
  value      jsonb not null default '{}'::jsonb check (jsonb_typeof(value) in ('object', 'array')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (user_id) default auth.uid()
);

comment on table public.portal_settings is 'Portal settings admins change on Ops → Settings (merged over the defaults in lib/settings.ts). Staff read; admin writes.';

alter table public.portal_settings enable row level security;
revoke all on public.portal_settings from anon;
revoke all on public.portal_settings from authenticated;
grant select, insert, update, delete on public.portal_settings to authenticated;

drop policy if exists staff_read on public.portal_settings;
create policy staff_read on public.portal_settings for select to authenticated using (app.is_staff());
drop policy if exists admin_write on public.portal_settings;
create policy admin_write on public.portal_settings for all to authenticated
  using (app.has_role('admin')) with check (app.has_role('admin'));

drop trigger if exists audit on public.portal_settings;
create trigger audit after insert or update or delete on public.portal_settings
  for each row execute function app.audit_row();
drop trigger if exists touch_updated_at on public.portal_settings;
create trigger touch_updated_at before update on public.portal_settings
  for each row execute function app.touch_updated_at();

-- Presets are audited too, now that admins edit them in the portal.
drop trigger if exists audit on public.hold_reason_presets;
create trigger audit after insert or update or delete on public.hold_reason_presets
  for each row execute function app.audit_row();
