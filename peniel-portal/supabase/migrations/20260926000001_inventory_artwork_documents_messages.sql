-- ============================================================================
-- Phase 4 — Inventory, artwork, documents, messages
--
-- * Messages: staff can leave internal notes in a thread; customers never
--   see them.
-- * Documents: size and type recorded; quality and warehouse may upload too
--   (QC certificates, delivery notes); files must sit in the company folder.
-- * Proofs: version, note to the customer, approve-by date and file details.
-- * Finished stock: collected stock is kept for the record but leaves the
--   customer's stock view; staff_record_collection records a pickup (vehicle,
--   driver, delivery note) and closes fully collected orders as Delivered.
-- * Raw materials: each movement updates the stock on hand, which can't go
--   below zero.
--
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Messages: internal notes
-- ---------------------------------------------------------------------------
alter table public.messages add column if not exists internal boolean not null default false;

create or replace view public.customer_messages with (security_barrier = true) as
select
  m.id,
  m.thread_id,
  m.body,
  (p.role <> 'customer_user') as from_peniel,
  p.full_name as author_name,
  m.read_by_customer,
  m.created_at
from public.messages m
join public.message_threads t on t.id = m.thread_id
join public.profiles p on p.user_id = m.author_id
where t.company_id = app.my_company_id() and not m.internal;

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
alter table public.documents
  add column if not exists size_bytes bigint,
  add column if not exists mime_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documents'::regclass and conname = 'documents_path_in_company_folder'
  ) then
    alter table public.documents
      add constraint documents_path_in_company_folder check (file_path like company_id::text || '/%');
  end if;
end $$;

create or replace view public.customer_documents with (security_barrier = true) as
select d.id, d.brand_id, d.order_id, d.type, d.title, d.file_name, d.file_path, d.created_at,
       d.size_bytes, d.mime_type
from public.documents d
where d.visibility = 'customer' and d.company_id = app.my_company_id();

drop policy if exists staff_write on public.documents;
create policy staff_write on public.documents for all to authenticated
  using (app.has_role('admin', 'sales', 'quality', 'warehouse'))
  with check (app.has_role('admin', 'sales', 'quality', 'warehouse'));

drop policy if exists "portal: documents insert (quality, warehouse)" on storage.objects;
create policy "portal: documents insert (quality, warehouse)"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and app.has_role('quality', 'warehouse'));

-- ---------------------------------------------------------------------------
-- Proofs
-- ---------------------------------------------------------------------------
alter table public.proofs
  add column if not exists version int,
  add column if not exists note text,
  add column if not exists approve_by date,
  add column if not exists file_name text,
  add column if not exists size_bytes bigint,
  add column if not exists mime_type text;

-- New proofs are numbered per brand: v1, v2, …
create or replace function app.number_proof()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.version is null then
    select coalesce(max(p.version), 0) + 1 into new.version from public.proofs p where p.brand_id = new.brand_id;
  end if;
  if new.file_name is null then
    new.file_name := regexp_replace(new.file_path, '^.*/', '');
  end if;
  return new;
end
$$;

drop trigger if exists number_proof on public.proofs;
create trigger number_proof before insert on public.proofs
  for each row execute function app.number_proof();

update public.proofs p set version = v.n
from (select id, row_number() over (partition by brand_id order by created_at) as n from public.proofs) v
where v.id = p.id and p.version is null;
update public.proofs set file_name = regexp_replace(file_path, '^.*/', '') where file_name is null;

create or replace view public.customer_proofs with (security_barrier = true) as
select
  p.id,
  p.brand_id,
  b.name as brand_name,
  p.order_id,
  p.file_path,
  p.status,
  p.customer_comment,
  p.responded_at,
  p.created_at,
  p.version,
  p.note,
  p.approve_by,
  p.file_name,
  p.size_bytes,
  p.mime_type,
  o.order_no,
  r.full_name as responded_by_name
from public.proofs p
join public.brands b on b.id = p.brand_id
left join public.orders o on o.id = p.order_id
left join public.profiles r on r.user_id = p.responded_by
where b.company_id = app.my_company_id();

-- ---------------------------------------------------------------------------
-- Finished stock: collection
-- ---------------------------------------------------------------------------
alter table public.finished_stock add column if not exists collected_at timestamptz;

create or replace view public.customer_finished_stock with (security_barrier = true) as
select
  s.id,
  s.brand_id,
  b.name as brand_name,
  s.order_id,
  o.order_no,
  s.batch_no,
  s.quantity,
  s.ready_since,
  s.status,
  s.customer_reason,
  s.updated_at
from public.finished_stock s
join public.brands b on b.id = s.brand_id
left join public.orders o on o.id = s.order_id
where s.company_id = app.my_company_id() and s.collected_at is null;

-- Pickups list the batch numbers they cover (collected stock included).
create or replace view public.customer_pickup_bookings with (security_barrier = true) as
select
  pb.id,
  pb.requested_at,
  pb.customer_note,
  pb.status,
  pb.proposed_time,
  pb.vehicle,
  pb.driver,
  pb.delivery_note_no,
  pb.created_at,
  array(select i.stock_id from public.pickup_booking_items i where i.booking_id = pb.id) as stock_ids,
  array(
    select s.batch_no from public.pickup_booking_items i
    join public.finished_stock s on s.id = i.stock_id
    where i.booking_id = pb.id order by s.batch_no
  ) as batch_nos
from public.pickup_bookings pb
where pb.company_id = app.my_company_id();

-- Same as before, but collected stock can't be booked again.
create or replace function public.customer_request_pickup(
  p_stock_ids    uuid[],
  p_requested_at timestamptz,
  p_note         text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  cid uuid := app.require_customer();
  wanted int := cardinality(array(select distinct unnest(p_stock_ids)));
  new_id uuid;
begin
  if coalesce(wanted, 0) = 0 then
    raise exception 'Choose at least one batch to collect' using errcode = '22023';
  end if;
  if wanted <> (
    select count(*) from public.finished_stock s
    where s.id = any (p_stock_ids) and s.company_id = cid
  ) then
    perform app.deny();
  end if;
  if p_requested_at is null or p_requested_at < now() then
    raise exception 'Choose a pickup time in the future' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.finished_stock s
    where s.id = any (p_stock_ids) and (s.status <> 'available' or s.collected_at is not null)
  ) or exists (
    select 1 from public.pickup_booking_items i
    join public.pickup_bookings pb on pb.id = i.booking_id
    where i.stock_id = any (p_stock_ids) and pb.status <> 'collected'
  ) then
    raise exception 'One or more batches are not available for pickup' using errcode = '22023';
  end if;

  insert into public.pickup_bookings (company_id, requested_at, requested_by, customer_note)
  values (cid, p_requested_at, auth.uid(), nullif(btrim(p_note), ''))
  returning id into new_id;

  insert into public.pickup_booking_items (booking_id, stock_id)
  select new_id, s from (select distinct unnest(p_stock_ids) as s) x;

  return new_id;
end
$$;

-- Record that a booked pickup was collected (warehouse, sales, admin).
create or replace function public.staff_record_collection(
  p_booking_id    uuid,
  p_vehicle       text,
  p_driver        text,
  p_delivery_note text
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not app.has_role('admin', 'warehouse', 'sales') then
    perform app.deny();
  end if;
  if nullif(btrim(p_delivery_note), '') is null then
    raise exception 'Enter the delivery note number' using errcode = '22023';
  end if;

  update public.pickup_bookings
  set status = 'collected',
      vehicle = nullif(btrim(p_vehicle), ''),
      driver = nullif(btrim(p_driver), ''),
      delivery_note_no = btrim(p_delivery_note)
  where id = p_booking_id and status <> 'collected';
  if not found then
    raise exception 'This pickup is already recorded, or does not exist' using errcode = '22023';
  end if;

  update public.finished_stock s
  set collected_at = now()
  where s.id in (select i.stock_id from public.pickup_booking_items i where i.booking_id = p_booking_id);

  -- An order ready for pickup with nothing left in stock has been delivered.
  update public.orders o
  set status = 'delivered', customer_reason = null
  where o.status = 'ready_for_pickup'
    and o.id in (
      select s.order_id from public.finished_stock s
      join public.pickup_booking_items i on i.stock_id = s.id
      where i.booking_id = p_booking_id and s.order_id is not null
    )
    and not exists (
      select 1 from public.finished_stock s2 where s2.order_id = o.id and s2.collected_at is null
    );
end
$$;

revoke all on function public.customer_request_pickup(uuid[], timestamptz, text) from public, anon;
grant execute on function public.customer_request_pickup(uuid[], timestamptz, text) to authenticated;
revoke all on function public.staff_record_collection(uuid, text, text, text) from public, anon;
grant execute on function public.staff_record_collection(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Raw materials: movements update the stock on hand
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.raw_materials'::regclass and conname = 'raw_materials_on_hand_not_negative'
  ) then
    alter table public.raw_materials add constraint raw_materials_on_hand_not_negative check (on_hand >= 0);
  end if;
end $$;

create or replace function app.apply_material_movement()
returns trigger language plpgsql set search_path = ''
as $$
begin
  update public.raw_materials
  set on_hand = on_hand + new.quantity, updated_at = now()
  where id = new.material_id;
  return null;
end
$$;

drop trigger if exists apply_material_movement on public.raw_material_movements;
create trigger apply_material_movement after insert on public.raw_material_movements
  for each row execute function app.apply_material_movement();

-- ---------------------------------------------------------------------------
-- The replaced customer views keep SELECT-only access
-- ---------------------------------------------------------------------------
revoke all on public.customer_messages, public.customer_documents, public.customer_proofs, public.customer_finished_stock,
  public.customer_pickup_bookings from public, anon, authenticated;
grant select on public.customer_messages, public.customer_documents, public.customer_proofs, public.customer_finished_stock,
  public.customer_pickup_bookings to authenticated;
