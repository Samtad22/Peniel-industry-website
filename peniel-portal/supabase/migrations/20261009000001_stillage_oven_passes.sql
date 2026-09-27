-- ============================================================================
-- Printed sheets: each stillage through the oven, twice
--
-- The process per stillage (about 1,400 to 1,420 sheets):
--   1. Printing: the two-unit roller printer with the UV dryer at its end,
--      one pass. This creates the stillage (print_runs).
--   2. Varnish: the stillage goes through the oven, about 30 minutes.
--   3. Lacquer: the same stillage is lacquered and goes through the oven again.
--
-- stillage_passes records each oven pass against its stillage: when it went
-- in and came out (out empty = still in the oven), the oven temperature, the
-- varnish or lacquer used, and sheets spoiled in that pass. A stillage has at
-- most one varnish pass and one lacquer pass, and is lacquered only after its
-- varnish pass is out of the oven.
--
-- The varnish, lacquer and oven_temp_c columns on print_runs came from the
-- first version (one entry per finished stillage); those values are copied
-- into passes here and the columns are no longer used.
--
-- INTERNAL ONLY. Staff read; production and admin write. Audited.
-- Safe to run more than once.
-- ============================================================================

-- The stillage migration (20261008000001) adds print_runs.varnish; make sure it
-- exists even if this file is run first, so the copy below works either way.
alter table public.print_runs add column if not exists varnish text;

create table if not exists public.stillage_passes (
  id             uuid primary key default gen_random_uuid(),
  print_run_id   uuid not null references public.print_runs (id) on delete cascade,
  stage          text not null check (stage in ('varnish', 'lacquer')),
  material       text check (length(material) <= 100),
  oven_temp_c    numeric(5, 1) check (oven_temp_c between 0 and 400),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  sheets_spoiled int not null default 0 check (sheets_spoiled between 0 and 100000),
  notes          text check (length(notes) <= 1000),
  entered_by     uuid references public.profiles (user_id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint stillage_passes_one_per_stage unique (print_run_id, stage),
  constraint stillage_passes_out_after_in check (finished_at is null or finished_at >= started_at)
);
create index if not exists stillage_passes_open_idx on public.stillage_passes (finished_at) where finished_at is null;

comment on table public.stillage_passes is
  'INTERNAL. Oven passes of a printed-sheet stillage: varnish (about 30 minutes), then lacquer. finished_at empty = still in the oven. No customer view reads this table.';

-- Lacquer only after the stillage's varnish pass has come out of the oven.
create or replace function app.stillage_passes_order() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.stage = 'lacquer' and not exists (
    select 1 from public.stillage_passes v
    where v.print_run_id = new.print_run_id and v.stage = 'varnish' and v.finished_at is not null
  ) then
    raise exception 'Varnish this stillage (and take it out of the oven) before lacquer.' using errcode = '23514';
  end if;
  new.material := nullif(btrim(new.material), '');
  return new;
end
$$;

drop trigger if exists pass_order on public.stillage_passes;
create trigger pass_order before insert on public.stillage_passes
  for each row execute function app.stillage_passes_order();

alter table public.stillage_passes enable row level security;
revoke all on public.stillage_passes from anon;
revoke all on public.stillage_passes from authenticated;
grant select, insert, update, delete on public.stillage_passes to authenticated;

drop policy if exists staff_read on public.stillage_passes;
create policy staff_read on public.stillage_passes for select to authenticated
  using (app.is_staff());
drop policy if exists production_write on public.stillage_passes;
create policy production_write on public.stillage_passes for all to authenticated
  using (app.has_role('admin', 'production')) with check (app.has_role('admin', 'production'));

drop trigger if exists audit on public.stillage_passes;
create trigger audit after insert or update or delete on public.stillage_passes
  for each row execute function app.audit_row();

drop trigger if exists touch_updated_at on public.stillage_passes;
create trigger touch_updated_at before update on public.stillage_passes
  for each row execute function app.touch_updated_at();

-- Stillages logged with the first version: their varnish and lacquer become passes.
insert into public.stillage_passes (print_run_id, stage, material, oven_temp_c, started_at, finished_at, entered_by)
select r.id, 'varnish', r.varnish, r.oven_temp_c, r.created_at, r.created_at + interval '30 minutes', r.entered_by
from public.print_runs r
where r.varnish is not null or r.oven_temp_c is not null or r.lacquer is not null
on conflict (print_run_id, stage) do nothing;

insert into public.stillage_passes (print_run_id, stage, material, started_at, finished_at, entered_by)
select r.id, 'lacquer', r.lacquer, r.created_at + interval '30 minutes', r.created_at + interval '60 minutes', r.entered_by
from public.print_runs r
where r.lacquer is not null
on conflict (print_run_id, stage) do nothing;

comment on column public.print_runs.varnish is 'Not used any more: varnish is a pass in stillage_passes.';
comment on column public.print_runs.lacquer is 'Not used any more: lacquer is a pass in stillage_passes.';
comment on column public.print_runs.oven_temp_c is 'Not used any more: oven temperature is per pass in stillage_passes.';
comment on column public.print_runs.sheets_spoiled is 'Sheets spoiled on the printer / UV dryer. Oven spoilage is per pass.';
