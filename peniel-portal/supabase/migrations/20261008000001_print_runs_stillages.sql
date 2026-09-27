-- ============================================================================
-- Printed sheets are their own process, recorded per stillage
--
-- Tinplate sheets go through the two-unit roller printer, the UV dryer, the
-- big oven for varnish, then lacquer coating. The output is printed sheets,
-- counted per stillage (about 1,400 to 1,420 sheets each). A stillage is
-- printed with a brand's design but belongs to no order or batch number.
-- One sheet makes 702 crowns; sheets are the figure that counts.
--
-- print_runs: one row per finished stillage.
--   - order_id is no longer needed (kept, optional, for rows already entered)
--   - brand_id: the brand whose design was printed (required)
--   - stillage_no: the stillage's own number, if it has one
--   - varnish: the varnish used in the oven (lacquer and oven_temp_c already exist)
--   - crowns_per_sheet now defaults to 702
--
-- Still internal only. Safe to run more than once.
-- ============================================================================

alter table public.print_runs alter column order_id drop not null;
alter table public.print_runs add column if not exists brand_id uuid references public.brands (id);
alter table public.print_runs add column if not exists stillage_no text;
alter table public.print_runs add column if not exists varnish text;
alter table public.print_runs alter column crowns_per_sheet set default 702;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'print_runs_stillage_no_check') then
    alter table public.print_runs add constraint print_runs_stillage_no_check check (length(stillage_no) <= 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'print_runs_varnish_check') then
    alter table public.print_runs add constraint print_runs_varnish_check check (length(varnish) <= 100);
  end if;
end $$;

-- Runs entered against an order take that order's brand.
update public.print_runs r
set brand_id = o.brand_id
from public.orders o
where o.id = r.order_id and r.brand_id is null;

-- A run given only an order (the screen before this change) gets the brand from it.
create or replace function app.print_runs_fill() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.brand_id is null and new.order_id is not null then
    select o.brand_id into new.brand_id from public.orders o where o.id = new.order_id;
  end if;
  new.stillage_no := nullif(btrim(new.stillage_no), '');
  return new;
end
$$;

drop trigger if exists fill_brand on public.print_runs;
create trigger fill_brand before insert or update on public.print_runs
  for each row execute function app.print_runs_fill();

alter table public.print_runs alter column brand_id set not null;
create index if not exists print_runs_brand_idx on public.print_runs (brand_id, run_date);

comment on table public.print_runs is
  'INTERNAL. Printed sheets, one row per finished stillage: tinplate sheets through the two-unit roller printer, UV dryer, varnish oven and lacquer coating, printed with a brand''s design (no order or batch). sheets_printed is the figure that counts; crowns_per_sheet (702) is only for a rough crown count. No customer view reads this table.';
comment on column public.print_runs.sheets_printed is 'Good printed sheets on the stillage (about 1,400 to 1,420).';
comment on column public.print_runs.sheets_spoiled is 'Sheets spoiled on the printer, dryer, oven or lacquer line.';
comment on column public.print_runs.order_id is 'Not used any more: stillages belong to no order. Kept for rows entered before.';
