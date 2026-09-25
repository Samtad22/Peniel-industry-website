-- ============================================================================
-- Sorting of camera rejects, and the customer's reject rate after sorting
--
-- On every production run the liner press camera pushes out crowns it thinks
-- are defective (production_entries.reject_qty). Those cartons go to the
-- sorting station, where sorters pass the good ones and scrap the rest. So:
--
-- 1. sorting_records belong to an order and a batch number (not only to a
--    batch on hold). inspection_id stays for the reports already entered and
--    is filled in when the batch has an inspection.
-- 2. Crowns that pass sorting stay internal: they never count toward the
--    customer's produced quantity (still produced minus camera rejects).
-- 3. The customer's reject rate is the final waste after sorting, per order:
--    customer_orders.reject_pct = waste crowns / crowns produced. Camera
--    rejects before sorting are no longer shown per day: customer_daily_output
--    now reports the crowns that count toward the order (produced_qty) and
--    leaves reject_qty and reject_pct empty (kept so the columns don't move).
--
-- Customers still can't read sorting_records. Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Sorting per order and batch
-- ---------------------------------------------------------------------------
alter table public.sorting_records add column if not exists order_id uuid references public.orders (id) on delete cascade;
alter table public.sorting_records add column if not exists batch_no text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sorting_records_batch_no_check') then
    alter table public.sorting_records
      add constraint sorting_records_batch_no_check check (length(btrim(batch_no)) between 1 and 40);
  end if;
end $$;

-- Reports entered so far were for held batches: take the order and batch from the inspection.
update public.sorting_records s
set order_id = i.order_id, batch_no = i.batch_no
from public.qc_inspections i
where i.id = s.inspection_id and (s.order_id is null or s.batch_no is null);

-- An inspection is optional now; deleting one keeps the sorting (it still has its order and batch).
alter table public.sorting_records alter column inspection_id drop not null;
alter table public.sorting_records drop constraint if exists sorting_records_inspection_id_fkey;
alter table public.sorting_records
  add constraint sorting_records_inspection_id_fkey foreign key (inspection_id) references public.qc_inspections (id) on delete set null;

-- A report given only an inspection (the screens before this change) gets its order and batch from it.
create or replace function app.sorting_records_fill() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.inspection_id is not null then
    select i.order_id, i.batch_no into new.order_id, new.batch_no
    from public.qc_inspections i
    where i.id = new.inspection_id;
  end if;
  new.batch_no := btrim(new.batch_no);
  return new;
end
$$;

drop trigger if exists fill_order_batch on public.sorting_records;
create trigger fill_order_batch before insert or update on public.sorting_records
  for each row execute function app.sorting_records_fill();

alter table public.sorting_records alter column order_id set not null;
alter table public.sorting_records alter column batch_no set not null;

create index if not exists sorting_records_order_idx on public.sorting_records (order_id, batch_no, sorted_on);

comment on table public.sorting_records is
  'INTERNAL. The daily sorting report: crowns the liner camera pushed out, sorted by hand. One row per order, batch and day. passed_cartons stay internal (never added to the customer''s produced quantity); waste_cartons are the final rejects behind customer_orders.reject_pct. 1 carton = 10,000 crowns.';

-- ---------------------------------------------------------------------------
-- 2. Daily output: crowns that count toward the order, no camera rejects
--    produced_qty = produced minus camera rejects. Screens deployed before this
--    change compute produced - reject_qty, which still gives the same number.
-- ---------------------------------------------------------------------------
create or replace view public.customer_daily_output with (security_barrier = true) as
select
  pe.order_id,
  pe.entry_date,
  sum(pe.produced_qty - pe.reject_qty)::bigint as produced_qty,
  null::bigint as reject_qty,
  null::numeric as reject_pct,
  max(pe.published_at) as published_at
from public.production_entries pe
join public.orders o on o.id = pe.order_id
where pe.published and o.company_id = app.my_company_id()
group by pe.order_id, pe.entry_date;

-- ---------------------------------------------------------------------------
-- 3. Orders: reject rate after sorting (new column at the end)
-- ---------------------------------------------------------------------------
create or replace view public.customer_orders with (security_barrier = true) as
select
  o.id,
  o.order_no,
  o.brand_id,
  b.name as brand_name,
  o.po_number,
  o.quantity,
  coalesce(done.good_qty, 0)::bigint as completed_qty,
  o.requested_date,
  o.confirmed_due_date,
  o.revised_due_date,
  coalesce(o.revised_due_date, o.confirmed_due_date) as due_date,
  o.delivery_method,
  o.delivery_address,
  o.status,
  o.customer_reason,
  o.created_at,
  o.updated_at,
  -- Final waste after sorting over the crowns produced; empty until something is sorted.
  case when done.produced_qty > 0 and sorted.waste_cartons is not null
    then least(100, round(100.0 * sorted.waste_cartons * 10000 / done.produced_qty, 2))
  end as reject_pct
from public.orders o
join public.brands b on b.id = o.brand_id
left join lateral (
  select sum(pe.produced_qty - pe.reject_qty) as good_qty, sum(pe.produced_qty) as produced_qty
  from public.production_entries pe
  where pe.order_id = o.id and pe.published
) done on true
left join lateral (
  select sum(sr.waste_cartons) as waste_cartons
  from public.sorting_records sr
  where sr.order_id = o.id
) sorted on true
where o.company_id = app.my_company_id();

revoke all on public.customer_daily_output, public.customer_orders from public, anon, authenticated;
grant select on public.customer_daily_output, public.customer_orders to authenticated;
