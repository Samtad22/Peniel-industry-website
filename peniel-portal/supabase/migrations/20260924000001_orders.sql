-- ============================================================================
-- Phase 2 — Orders
--
-- * Customers place an order and attach its files in one step
--   (customer_submit_order). Files are uploaded first, into the company's
--   `uploads/` folder, so a failed upload never leaves an order without its PO.
-- * The same PO file may belong to several orders ("Order another brand on
--   this PO").
-- * Rejecting an order needs a customer-facing reason, like a hold does.
-- * Status moves are checked: nothing goes back to `submitted`, only new or
--   confirmed orders can be rejected, a rejected order stays rejected, and an
--   order past `submitted` must have a due date.
-- * Staff can read the audit trail of orders (the order page's activity log).
-- * Presets now cover rejections as well as holds.
-- * Customers can mark a conversation as read.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- One PO file, several orders
-- ---------------------------------------------------------------------------
alter table public.order_attachments drop constraint order_attachments_file_path_key;
alter table public.order_attachments add constraint order_attachments_order_file_key unique (order_id, file_path);

-- ---------------------------------------------------------------------------
-- Customers may upload into {company_id}/uploads/… before the order exists,
-- as well as into {company_id}/{their order_id}/…
-- ---------------------------------------------------------------------------
drop policy "portal: customer upload own order attachments" on storage.objects;

create policy "portal: customer upload own order attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order-attachments'
    and (storage.foldername(name))[1] = app.my_company_id()::text
    and (
      (storage.foldername(name))[2] = 'uploads'
      or exists (
        select 1 from public.customer_orders o
        where o.id::text = (storage.foldername(name))[2]
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Place an order with its attachments. Replaces customer_create_order, so
-- every order arrives with a purchase order file.
--
-- p_attachments: [{"path", "name", "size", "mime", "type"}, …] — files the
-- caller has already uploaded to `order-attachments` under their company.
-- ---------------------------------------------------------------------------
drop function public.customer_create_order(uuid, text, bigint, date, public.delivery_method, text);

create function public.customer_submit_order(
  p_brand_id         uuid,
  p_po_number        text,
  p_quantity         bigint,
  p_requested_date   date,
  p_delivery_method  public.delivery_method,
  p_delivery_address text,
  p_attachments      jsonb
)
returns table (id uuid, order_no text)
language plpgsql security definer set search_path = ''
as $$
declare
  cid uuid := app.require_customer();
  new_id uuid;
  new_no text;
  f jsonb;
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
  if p_requested_date is not null and p_requested_date < (now() at time zone 'Africa/Addis_Ababa')::date then
    raise exception 'The requested date is in the past' using errcode = '22023';
  end if;
  if p_delivery_method = 'delivery' and nullif(btrim(p_delivery_address), '') is null then
    raise exception 'A delivery address is required for delivery orders' using errcode = '22023';
  end if;
  if jsonb_typeof(p_attachments) is distinct from 'array' or jsonb_array_length(p_attachments) > 10 then
    raise exception 'Attach up to 10 files' using errcode = '22023';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(p_attachments) a where a ->> 'type' = 'purchase_order'
  ) then
    raise exception 'Attach your purchase order' using errcode = '22023';
  end if;

  -- Every file must already be in Storage, inside the caller's company folder.
  for f in select * from jsonb_array_elements(p_attachments) loop
    if (f ->> 'path') is null
       or (f ->> 'path') not like cid::text || '/%'
       or (f ->> 'path') like '%..%'
       or not exists (
         select 1 from storage.objects so
         where so.bucket_id = 'order-attachments' and so.name = f ->> 'path'
       ) then
      perform app.deny();
    end if;
  end loop;

  insert into public.orders as o
    (company_id, brand_id, po_number, quantity, requested_date,
     delivery_method, delivery_address, status, submitted_by)
  values
    (cid, p_brand_id, btrim(p_po_number), p_quantity, p_requested_date,
     p_delivery_method,
     case when p_delivery_method = 'delivery' then nullif(btrim(p_delivery_address), '') end,
     'submitted', auth.uid())
  returning o.id, o.order_no into new_id, new_no;

  insert into public.order_attachments
    (order_id, company_id, file_path, file_name, size_bytes, mime_type, type, uploaded_by)
  select new_id, cid, a ->> 'path', left(nullif(btrim(a ->> 'name'), ''), 200),
         (a ->> 'size')::bigint, a ->> 'mime',
         coalesce(a ->> 'type', 'other')::public.attachment_type, auth.uid()
  from jsonb_array_elements(p_attachments) a;

  return query select new_id, new_no;
end
$$;

revoke all on function public.customer_submit_order(uuid, text, bigint, date, public.delivery_method, text, jsonb)
  from public, anon;
grant execute on function public.customer_submit_order(uuid, text, bigint, date, public.delivery_method, text, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Customers mark a conversation as read
-- ---------------------------------------------------------------------------
create function public.customer_mark_thread_read(p_thread_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  cid uuid := app.require_customer();
begin
  if not exists (select 1 from public.message_threads t where t.id = p_thread_id and t.company_id = cid) then
    perform app.deny();
  end if;
  update public.messages set read_by_customer = true
  where thread_id = p_thread_id and not read_by_customer;
end
$$;

revoke all on function public.customer_mark_thread_read(uuid) from public, anon;
grant execute on function public.customer_mark_thread_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- A rejection needs a customer-facing reason too
-- ---------------------------------------------------------------------------
create or replace function app.check_order_reason()
returns trigger language plpgsql set search_path = ''
as $$
declare
  needs_reason boolean :=
       (new.status in ('on_hold', 'rejected') and (tg_op = 'INSERT' or old.status is distinct from new.status))
    or (tg_op = 'UPDATE' and new.revised_due_date is distinct from old.revised_due_date)
    or (tg_op = 'UPDATE' and old.confirmed_due_date is not null
        and new.confirmed_due_date is distinct from old.confirmed_due_date);
begin
  if needs_reason and nullif(btrim(new.customer_reason), '') is null then
    raise exception 'A customer_reason is required when rejecting, putting an order on hold or changing its due date'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- Allowed status moves
-- ---------------------------------------------------------------------------
create function app.check_order_transition()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'submitted' then
    raise exception 'An order cannot go back to Submitted' using errcode = 'check_violation';
  end if;
  if old.status = 'rejected' then
    raise exception 'A rejected order cannot be reopened; ask the customer to submit it again'
      using errcode = 'check_violation';
  end if;
  if new.status = 'rejected' and old.status not in ('submitted', 'confirmed') then
    raise exception 'Only new or confirmed orders can be rejected; put it on hold instead'
      using errcode = 'check_violation';
  end if;
  if new.status <> 'rejected' and new.confirmed_due_date is null then
    raise exception 'Set a due date when confirming the order' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger check_order_transition before update of status on public.orders
  for each row execute function app.check_order_transition();

-- ---------------------------------------------------------------------------
-- Staff read the audit trail of orders and their attachments
-- ---------------------------------------------------------------------------
create policy staff_read_order_audit on public.audit_log for select to authenticated
  using (app.is_staff() and entity in ('orders', 'order_attachments'));

-- ---------------------------------------------------------------------------
-- Presets for rejections as well as holds
-- ---------------------------------------------------------------------------
alter table public.hold_reason_presets
  add column kind text not null default 'hold' check (kind in ('hold', 'reject'));

insert into public.hold_reason_presets (text, sort_order, kind) values
  ('We can''t produce this specification. Please contact us to discuss an alternative.', 1, 'reject'),
  ('The purchase order doesn''t match the order details. Please submit the order again with the correct PO.', 2, 'reject'),
  ('This is a duplicate of an order we already have, so no action is needed.', 3, 'reject')
on conflict (text) do nothing;
