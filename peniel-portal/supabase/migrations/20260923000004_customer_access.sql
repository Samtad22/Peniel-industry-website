-- ============================================================================
-- Customer access layer
--
-- Customers have no policies on base tables. Everything they see comes from
-- the views below, which
--   (a) filter to the caller's company via app.my_company_id(), and
--   (b) select only customer-safe columns — never line_id, shift,
--       measurements, internal_notes, location, or anything about machines.
--
-- The views run with their owner's rights (the default for views), so they
-- read the base tables past RLS; the WHERE clause is the tenant filter.
-- security_barrier stops a caller's own predicates from being evaluated
-- before that filter. Views are granted SELECT only — simple views are
-- otherwise auto-updatable, which would let a customer write through them.
--
-- Customer writes go through the customer_* functions at the bottom, which
-- check ownership and set only the columns a customer may set.
-- ============================================================================

create view public.customer_company with (security_barrier = true) as
select c.id, c.name, c.code
from public.companies c
where c.id = app.my_company_id();

create view public.customer_brands with (security_barrier = true) as
select b.id, b.name, b.crown_image_path, b.size, b.liner, b.finish, b.colours, b.active
from public.brands b
where b.company_id = app.my_company_id();

create view public.customer_orders with (security_barrier = true) as
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
  o.updated_at
from public.orders o
join public.brands b on b.id = o.brand_id
left join lateral (
  select sum(pe.produced_qty - pe.reject_qty) as good_qty
  from public.production_entries pe
  where pe.order_id = o.id and pe.published
) done on true
where o.company_id = app.my_company_id();

create view public.customer_order_timeline with (security_barrier = true) as
select e.id, e.order_id, e.status, e.customer_reason, e.created_at
from public.order_status_events e
join public.orders o on o.id = e.order_id
where o.company_id = app.my_company_id();

create view public.customer_order_attachments with (security_barrier = true) as
select a.id, a.order_id, a.file_name, a.file_path, a.size_bytes, a.mime_type, a.type, a.created_at
from public.order_attachments a
where a.company_id = app.my_company_id();

-- Aggregated per order and day: no line, no shift, unpublished entries excluded.
create view public.customer_daily_output with (security_barrier = true) as
select
  pe.order_id,
  pe.entry_date,
  sum(pe.produced_qty)::bigint as produced_qty,
  sum(pe.reject_qty)::bigint as reject_qty,
  case when sum(pe.produced_qty) > 0
    then round(100.0 * sum(pe.reject_qty) / sum(pe.produced_qty), 2)
    else 0 end as reject_pct
from public.production_entries pe
join public.orders o on o.id = pe.order_id
where pe.published and o.company_id = app.my_company_id()
group by pe.order_id, pe.entry_date;

create view public.customer_quality_batches with (security_barrier = true) as
select
  i.id,
  i.batch_no,
  i.order_id,
  o.order_no,
  i.inspected_at,
  i.sample_size,
  i.reject_pct,
  i.result,
  i.customer_reason
from public.qc_inspections i
join public.orders o on o.id = i.order_id
where i.published and o.company_id = app.my_company_id();

create view public.customer_defects_by_type with (security_barrier = true) as
select
  i.id as inspection_id,
  i.batch_no,
  i.order_id,
  d.defect_type,
  dt.customer_label,
  d.count
from public.qc_defects d
join public.qc_inspections i on i.id = d.inspection_id
join public.orders o on o.id = i.order_id
join public.defect_types dt on dt.code = d.defect_type
where i.published and o.company_id = app.my_company_id();

create view public.customer_finished_stock with (security_barrier = true) as
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
  s.customer_reason
from public.finished_stock s
join public.brands b on b.id = s.brand_id
left join public.orders o on o.id = s.order_id
where s.company_id = app.my_company_id();

create view public.customer_pickup_bookings with (security_barrier = true) as
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
  array(select i.stock_id from public.pickup_booking_items i where i.booking_id = pb.id) as stock_ids
from public.pickup_bookings pb
where pb.company_id = app.my_company_id();

create view public.customer_proofs with (security_barrier = true) as
select
  p.id,
  p.brand_id,
  b.name as brand_name,
  p.order_id,
  p.file_path,
  p.status,
  p.customer_comment,
  p.responded_at,
  p.created_at
from public.proofs p
join public.brands b on b.id = p.brand_id
where b.company_id = app.my_company_id();

create view public.customer_artwork with (security_barrier = true) as
select
  a.id,
  a.brand_id,
  a.version,
  a.file_path,
  a.approved_at,
  (b.current_artwork_version_id = a.id) as is_current
from public.artwork_versions a
join public.brands b on b.id = a.brand_id
where b.company_id = app.my_company_id();

create view public.customer_documents with (security_barrier = true) as
select d.id, d.brand_id, d.order_id, d.type, d.title, d.file_name, d.file_path, d.created_at
from public.documents d
where d.visibility = 'customer' and d.company_id = app.my_company_id();

create view public.customer_message_threads with (security_barrier = true) as
select t.id, t.order_id, t.subject, t.created_at, t.last_message_at
from public.message_threads t
where t.company_id = app.my_company_id();

create view public.customer_messages with (security_barrier = true) as
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
where t.company_id = app.my_company_id();

-- SELECT only, signed-in users only.
do $$
declare v text;
begin
  for v in
    select table_name from information_schema.views
    where table_schema = 'public' and table_name like 'customer\_%'
  loop
    execute format('revoke all on public.%I from public, anon, authenticated', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;

-- ============================================================================
-- Customer writes
-- ============================================================================

-- Raised for anything the caller may not touch. Deliberately identical for
-- "does not exist" and "belongs to someone else" so IDs cannot be probed.
create function app.deny()
returns void language plpgsql set search_path = ''
as $$
begin
  raise exception 'Not found or not permitted' using errcode = '42501';
end
$$;

create function app.require_customer()
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare cid uuid := app.my_company_id();
begin
  if cid is null then
    perform app.deny();
  end if;
  return cid;
end
$$;

-- Place an order. Status is always `submitted`; staff take it from there.
create function public.customer_create_order(
  p_brand_id         uuid,
  p_po_number        text,
  p_quantity         bigint,
  p_requested_date   date default null,
  p_delivery_method  public.delivery_method default 'pickup',
  p_delivery_address text default null
)
returns table (id uuid, order_no text)
language plpgsql security definer set search_path = ''
as $$
declare
  cid uuid := app.require_customer();
begin
  if not exists (
    select 1 from public.brands b
    where b.id = p_brand_id and b.company_id = cid and b.active
  ) then
    perform app.deny();
  end if;
  if nullif(btrim(p_po_number), '') is null then
    raise exception 'PO number is required' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero' using errcode = '22023';
  end if;
  if p_delivery_method = 'delivery' and nullif(btrim(p_delivery_address), '') is null then
    raise exception 'A delivery address is required for delivery orders' using errcode = '22023';
  end if;

  return query
  insert into public.orders as o
    (company_id, brand_id, po_number, quantity, requested_date,
     delivery_method, delivery_address, status, submitted_by)
  values
    (cid, p_brand_id, btrim(p_po_number), p_quantity, p_requested_date,
     p_delivery_method, nullif(btrim(p_delivery_address), ''), 'submitted', auth.uid())
  returning o.id, o.order_no;
end
$$;

-- Record a file the customer has already uploaded to Storage
-- (bucket `order-attachments`, path `{company_id}/{order_id}/…`).
create function public.customer_add_order_attachment(
  p_order_id   uuid,
  p_file_path  text,
  p_file_name  text,
  p_size_bytes bigint,
  p_mime_type  text,
  p_type       public.attachment_type default 'purchase_order'
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  cid uuid := app.require_customer();
  new_id uuid;
begin
  if not exists (select 1 from public.orders o where o.id = p_order_id and o.company_id = cid) then
    perform app.deny();
  end if;
  if p_file_path not like cid::text || '/' || p_order_id::text || '/%'
     or p_file_path like '%..%'
     or not exists (
       select 1 from storage.objects so
       where so.bucket_id = 'order-attachments' and so.name = p_file_path
     ) then
    perform app.deny();
  end if;

  insert into public.order_attachments
    (order_id, company_id, file_path, file_name, size_bytes, mime_type, type, uploaded_by)
  values
    (p_order_id, cid, p_file_path, p_file_name, p_size_bytes, p_mime_type, p_type, auth.uid())
  returning id into new_id;
  return new_id;
end
$$;

-- Approve a proof, or request changes (comment required).
create function public.customer_respond_to_proof(
  p_proof_id uuid,
  p_approve  boolean,
  p_comment  text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  cid uuid := app.require_customer();
begin
  if not exists (
    select 1 from public.proofs p
    join public.brands b on b.id = p.brand_id
    where p.id = p_proof_id and b.company_id = cid
  ) then
    perform app.deny();
  end if;
  if not p_approve and nullif(btrim(p_comment), '') is null then
    raise exception 'Please describe the changes you need' using errcode = '22023';
  end if;

  update public.proofs p
  set status = case when p_approve then 'approved' else 'changes_requested' end::public.proof_status,
      customer_comment = nullif(btrim(p_comment), ''),
      responded_by = auth.uid(),
      responded_at = now()
  where p.id = p_proof_id and p.status = 'sent';

  if not found then
    raise exception 'This proof has already been answered' using errcode = '22023';
  end if;
end
$$;

-- Ask to collect finished stock.
create function public.customer_request_pickup(
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
  if exists (
    select 1 from public.finished_stock s
    where s.id = any (p_stock_ids) and s.status <> 'available'
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

-- Send a message, starting a new thread when p_thread_id is null.
create function public.customer_send_message(
  p_body      text,
  p_thread_id uuid default null,
  p_subject   text default null,
  p_order_id  uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  cid uuid := app.require_customer();
  tid uuid := p_thread_id;
begin
  if nullif(btrim(p_body), '') is null then
    raise exception 'Message cannot be empty' using errcode = '22023';
  end if;

  if tid is null then
    if nullif(btrim(p_subject), '') is null then
      raise exception 'A subject is required for a new conversation' using errcode = '22023';
    end if;
    if p_order_id is not null
       and not exists (select 1 from public.orders o where o.id = p_order_id and o.company_id = cid) then
      perform app.deny();
    end if;
    insert into public.message_threads (company_id, order_id, subject, created_by)
    values (cid, p_order_id, btrim(p_subject), auth.uid())
    returning id into tid;
  elsif not exists (select 1 from public.message_threads t where t.id = tid and t.company_id = cid) then
    perform app.deny();
  end if;

  insert into public.messages (thread_id, author_id, body, read_by_customer)
  values (tid, auth.uid(), btrim(p_body), true);

  update public.message_threads set last_message_at = now() where id = tid;
  return tid;
end
$$;

revoke all on function
  public.customer_create_order(uuid, text, bigint, date, public.delivery_method, text),
  public.customer_add_order_attachment(uuid, text, text, bigint, text, public.attachment_type),
  public.customer_respond_to_proof(uuid, boolean, text),
  public.customer_request_pickup(uuid[], timestamptz, text),
  public.customer_send_message(text, uuid, text, uuid)
from public, anon;

grant execute on function
  public.customer_create_order(uuid, text, bigint, date, public.delivery_method, text),
  public.customer_add_order_attachment(uuid, text, text, bigint, text, public.attachment_type),
  public.customer_respond_to_proof(uuid, boolean, text),
  public.customer_request_pickup(uuid[], timestamptz, text),
  public.customer_send_message(text, uuid, text, uuid)
to authenticated;

revoke all on function app.deny(), app.require_customer() from public, anon;
grant execute on function app.deny(), app.require_customer() to authenticated;
