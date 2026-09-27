-- ============================================================================
-- Printed sheets: the base coat, before printing (some brands)
--
-- Some brands need a white or transparent base coat on the tinplate before it
-- is printed. It goes on in the big LPG oven (its one-unit roller coater, the
-- same way as varnish and lacquer). The process per stillage is then:
--   00 base coat through the oven (only these brands)
--   01 print line (two-unit roller printer + UV dryer)
--   02 varnish through the oven
--   03 lacquer through the oven
--
-- 1. brands.base_coat: 'white' or 'transparent' when the brand needs one
--    (empty = none). Internal: no customer view reads it.
-- 2. print_runs.printed: false while a base-coated stillage waits to be
--    printed (it then has no printed sheets yet); base_sheets = sheets that
--    went into the base coat.
-- 3. stillage_passes.stage gains 'base_coat': only before printing; varnish
--    only after printing; printing only once the base coat is out of the oven.
--
-- Backward compatible: stillages entered as before are printed (default true).
-- Still internal only. Safe to run more than once.
-- ============================================================================

alter table public.brands add column if not exists base_coat text;
alter table public.print_runs add column if not exists printed boolean not null default true;
alter table public.print_runs add column if not exists base_sheets int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brands_base_coat_check') then
    alter table public.brands add constraint brands_base_coat_check check (base_coat in ('white', 'transparent'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'print_runs_base_sheets_check') then
    alter table public.print_runs add constraint print_runs_base_sheets_check check (base_sheets between 1 and 100000);
  end if;
  -- A stillage waiting to be printed has no printed sheets yet.
  if exists (select 1 from pg_constraint where conname = 'print_runs_something') then
    alter table public.print_runs drop constraint print_runs_something;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'print_runs_something_printed') then
    alter table public.print_runs add constraint print_runs_something_printed check (not printed or sheets_printed + sheets_spoiled > 0);
  end if;
  -- The oven now also takes the base coat.
  if exists (select 1 from pg_constraint where conname = 'stillage_passes_stage_check') then
    alter table public.stillage_passes drop constraint stillage_passes_stage_check;
  end if;
  alter table public.stillage_passes add constraint stillage_passes_stage_check check (stage in ('base_coat', 'varnish', 'lacquer'));
end $$;

comment on column public.brands.base_coat is 'INTERNAL. white / transparent: the brand''s sheets get a base coat in the big oven before printing. Empty = none.';
comment on column public.print_runs.printed is 'False while a base-coated stillage waits for the print line; then it has no printed sheets yet.';
comment on column public.print_runs.base_sheets is 'Sheets that went into the base coat (base-coated stillages only).';

-- Order through the oven: base coat before printing, varnish after printing,
-- lacquer after the varnish is out.
create or replace function app.stillage_passes_order() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_printed boolean;
begin
  select r.printed into v_printed from public.print_runs r where r.id = new.print_run_id;
  if new.stage = 'base_coat' and v_printed then
    raise exception 'The base coat goes on before printing: this stillage is already printed.' using errcode = '23514';
  end if;
  if new.stage = 'varnish' and not coalesce(v_printed, true) then
    raise exception 'Print this stillage before varnish.' using errcode = '23514';
  end if;
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

-- Printing a base-coated stillage: only once its base coat is out of the oven.
create or replace function app.print_runs_base_coat_out() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.printed and not old.printed and exists (
    select 1 from public.stillage_passes p
    where p.print_run_id = new.id and p.stage = 'base_coat' and p.finished_at is null
  ) then
    raise exception 'Take the base coat out of the oven before printing this stillage.' using errcode = '23514';
  end if;
  if old.printed and not new.printed and exists (
    select 1 from public.stillage_passes p where p.print_run_id = new.id and p.stage <> 'base_coat'
  ) then
    raise exception 'This stillage is already varnished.' using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists base_coat_out on public.print_runs;
create trigger base_coat_out before update on public.print_runs
  for each row execute function app.print_runs_base_coat_out();
