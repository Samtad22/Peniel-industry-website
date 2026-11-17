-- ============================================================================
-- Deliveries per order: each delivery order (DO), delivered and remaining
--
-- Peniel's "Order and Delivery" sheet, in the portal. An order (one brand on
-- a customer's PO) gets its list of deliveries: DO number, date, quantity.
--   * kind 'delivery' counts toward what was delivered;
--   * kind 'return_exchange' ("RE"): crowns delivered before, sent back by
--     the customer (e.g. light and dark artwork mixed), sorted and delivered
--     again. Listed, but not counted again.
-- Delivered = the sum of the deliveries; remaining = ordered - delivered.
--
-- A pickup collected with a delivery note (staff_record_collection) adds its
-- deliveries by itself: one row per collected stock line, DO = the delivery
-- note, the date it was collected.
--
-- Staff read; admin, sales and warehouse record and correct; only admin
-- deletes; audited. Customers read their own company's deliveries through
-- customer_order_deliveries (DO, date, quantity, kind: no notes, no names).
-- Safe to run more than once.
-- ============================================================================

create table if not exists public.order_deliveries (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null,
  company_id        uuid not null,
  kind              text not null default 'delivery' check (kind in ('delivery', 'return_exchange')),
  do_no             text check (length(do_no) <= 40),
  -- Empty only for an opening figure without a date (from the delivery sheet).
  delivered_on      date,
  quantity          bigint not null check (quantity > 0 and quantity <= 10000000000),
  notes             text check (length(notes) <= 1000),
  finished_stock_id uuid unique references public.finished_stock (id) on delete set null,
  entered_by        uuid references public.profiles (user_id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (order_id, company_id) references public.orders (id, company_id) on delete cascade
);
create index if not exists order_deliveries_order_idx on public.order_deliveries (order_id, delivered_on);
create index if not exists order_deliveries_company_idx on public.order_deliveries (company_id);
comment on table public.order_deliveries is 'Deliveries of an order (DO number, date, crowns). kind return_exchange = delivered before, returned, sorted and sent back: not counted again.';

-- The company is the order's (the customer view filters on it).
create or replace function app.order_deliveries_company() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  select o.company_id into new.company_id from public.orders o where o.id = new.order_id;
  if new.company_id is null then
    raise exception 'Choose the order (order_unknown).' using errcode = '23503';
  end if;
  new.do_no := nullif(btrim(new.do_no), '');
  new.notes := nullif(btrim(new.notes), '');
  return new;
end
$$;
drop trigger if exists set_company on public.order_deliveries;
create trigger set_company before insert or update of order_id, do_no, notes on public.order_deliveries
  for each row execute function app.order_deliveries_company();

alter table public.order_deliveries enable row level security;
revoke all on public.order_deliveries from anon;
revoke all on public.order_deliveries from authenticated;
grant select, insert, update, delete on public.order_deliveries to authenticated;
drop policy if exists staff_read on public.order_deliveries;
create policy staff_read on public.order_deliveries for select to authenticated using (app.is_staff());
drop policy if exists deliveries_write on public.order_deliveries;
create policy deliveries_write on public.order_deliveries for all to authenticated
  using (app.has_role('admin', 'sales', 'warehouse'))
  with check (app.has_role('admin', 'sales', 'warehouse'));
drop policy if exists admin_only_delete on public.order_deliveries;
create policy admin_only_delete on public.order_deliveries as restrictive for delete to authenticated using (app.has_role('admin'));

drop trigger if exists audit on public.order_deliveries;
create trigger audit after insert or update or delete on public.order_deliveries
  for each row execute function app.audit_row();
drop trigger if exists touch_updated_at on public.order_deliveries;
create trigger touch_updated_at before update on public.order_deliveries
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- A collected pickup records its deliveries
-- ---------------------------------------------------------------------------
create or replace function app.finished_stock_delivered() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_note text;
begin
  if new.order_id is null or new.collected_at is null or old.collected_at is not null then
    return null;
  end if;
  select b.delivery_note_no into v_note
  from public.pickup_booking_items i join public.pickup_bookings b on b.id = i.booking_id
  where i.stock_id = new.id
  order by b.updated_at desc nulls last
  limit 1;
  insert into public.order_deliveries (order_id, company_id, kind, do_no, delivered_on, quantity, notes, finished_stock_id)
  values (new.order_id, new.company_id, 'delivery', v_note, (new.collected_at at time zone 'Africa/Addis_Ababa')::date, new.quantity,
          'Pickup collected, batch ' || new.batch_no, new.id)
  on conflict (finished_stock_id) do nothing;
  return null;
end
$$;
drop trigger if exists delivered on public.finished_stock;
create trigger delivered after update of collected_at on public.finished_stock
  for each row execute function app.finished_stock_delivered();

-- ---------------------------------------------------------------------------
-- Customers: their own deliveries (no notes, no names)
-- ---------------------------------------------------------------------------
create or replace view public.customer_order_deliveries with (security_barrier = true) as
select d.id, d.order_id, d.kind, d.do_no, d.delivered_on, d.quantity
from public.order_deliveries d
where d.company_id = app.my_company_id();
revoke all on public.customer_order_deliveries from public, anon, authenticated;
grant select on public.customer_order_deliveries to authenticated;
comment on view public.customer_order_deliveries is 'A customer''s own deliveries: DO, date, crowns, kind.';
