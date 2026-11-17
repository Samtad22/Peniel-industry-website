-- ============================================================================
-- Produced goods: the crowns produced per order and batch, entered by hand
--
-- Production → Produced goods. Staff record the good crowns produced for a
-- batch of an order (in crowns; the form also takes cartons of 10,000). The
-- Certificate of Analysis of that batch shows their total as its Quantity.
-- A batch with no produced goods keeps the quantity from finished stock, as
-- before. Several entries for one batch add up. Batch numbers match without
-- regard to case or spaces at the ends.
--
-- Kept apart from finished_stock on purpose: finished stock is what the
-- customer books a pickup from (added from Inventory or at Ready for pickup),
-- so recording produced goods there too would count the crowns twice.
--
-- Admin, production and quality add and correct entries; only admin deletes
-- (as for the other logs). Staff read. Customers read nothing of the table;
-- they see the total only on their batch's certificate, as before.
-- Audited. Safe to run more than once.
-- ============================================================================

create table if not exists public.produced_goods (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  batch_no    text not null check (btrim(batch_no) <> '' and length(batch_no) <= 40),
  quantity    bigint not null check (quantity > 0 and quantity <= 1000000000),
  produced_on date not null default (now() at time zone 'Africa/Addis_Ababa')::date,
  notes       text check (length(notes) <= 1000),
  entered_by  uuid references public.profiles (user_id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists produced_goods_batch_idx on public.produced_goods (order_id, lower(btrim(batch_no)));
create index if not exists produced_goods_date_idx on public.produced_goods (produced_on desc);
comment on table public.produced_goods is 'Crowns produced per order and batch, entered by hand (Production → Produced goods). Their total is the Quantity on the batch''s Certificate of Analysis.';

alter table public.produced_goods enable row level security;
revoke all on public.produced_goods from anon;
revoke all on public.produced_goods from authenticated;
grant select, insert, update, delete on public.produced_goods to authenticated;
drop policy if exists staff_read on public.produced_goods;
create policy staff_read on public.produced_goods for select to authenticated using (app.is_staff());
drop policy if exists goods_write on public.produced_goods;
create policy goods_write on public.produced_goods for all to authenticated
  using (app.has_role('admin', 'production', 'quality'))
  with check (app.has_role('admin', 'production', 'quality'));
drop policy if exists admin_only_delete on public.produced_goods;
create policy admin_only_delete on public.produced_goods as restrictive for delete to authenticated using (app.has_role('admin'));

drop trigger if exists audit on public.produced_goods;
create trigger audit after insert or update or delete on public.produced_goods
  for each row execute function app.audit_row();
drop trigger if exists touch_updated_at on public.produced_goods;
create trigger touch_updated_at before update on public.produced_goods
  for each row execute function app.touch_updated_at();

-- The certificate: as in 20261011000001, with the quantity from produced goods.
create or replace function public.certificate_of_analysis(p_inspection_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  r record;
  -- The CoA's measured parameters (lib/qc.ts), plus older keys for the same measures.
  coa_keys text[] := array[
    'shell_height_mm', 'shell_angle_deg', 'shell_outside_diameter_mm', 'shell_internal_diameter_mm',
    'shell_metal_thickness_mm', 'shell_metal_hardness_hr30t', 'crown_weight_g', 'liner_weight_mg',
    'leaking_pressure_kgcm2', 'release_performance_kgcm2', 'scratch_dust_mg',
    'crown_height_mm', 'outer_diameter_mm'
  ];
  is_staff boolean := app.is_staff();
  fp text := app.coa_fingerprint(p_inspection_id);
  released boolean;
  signed boolean;
  final boolean;
  sigs jsonb;
begin
  select
    i.id, i.batch_no, i.inspected_at, i.sample_size, i.measurements, i.result, i.published, i.published_at, i.coa_legacy,
    o.id as order_id, o.order_no, o.po_number, o.company_id, o.delivery_method, o.delivery_address,
    c.name as company_name, b.name as brand_name, b.size as crown_size, b.liner, b.finish,
    ins.full_name as inspector_name
  into r
  from public.qc_inspections i
  join public.orders o on o.id = i.order_id
  join public.companies c on c.id = o.company_id
  join public.brands b on b.id = o.brand_id
  left join public.profiles ins on ins.user_id = i.inspector_id
  where i.id = p_inspection_id;
  if not found then
    return null;
  end if;

  -- The signature, if it still matches the results (a changed result voids it).
  select coalesce(jsonb_object_agg(s.line, jsonb_build_object('name', s.signer_name, 'image', s.image, 'signed_at', s.signed_at, 'signer_id', s.signer_id)), '{}'::jsonb)
  into sigs
  from public.coa_signatures s
  where s.inspection_id = r.id and s.line = 'prepared' and s.fingerprint = fp;

  released := r.published and r.result = 'released';
  signed := sigs ? 'prepared';
  final := released and (signed or r.coa_legacy);
  if not is_staff and (r.company_id is distinct from app.my_company_id() or not final) then
    return null;
  end if;

  return jsonb_build_object(
    'id', r.id,
    'final', final,
    'released', released,
    'signed', signed,
    'legacy', r.coa_legacy,
    'batch_no', r.batch_no,
    'inspected_at', r.inspected_at,
    'published_at', r.published_at,
    'sample_size', r.sample_size,
    'result', r.result,
    'order_no', r.order_no,
    'po_number', r.po_number,
    'company', r.company_name,
    'shipped_to', case when r.delivery_method = 'delivery' then coalesce(nullif(btrim(r.delivery_address), ''), r.company_name) else r.company_name end,
    'brand', r.brand_name,
    'crown_size', r.crown_size,
    'liner', r.liner,
    'finish', r.finish,
    -- Produced goods recorded for this batch (Production → Produced goods), else the finished stock.
    'quantity', coalesce(
      (select sum(g.quantity) from public.produced_goods g
       where g.order_id = r.order_id and lower(btrim(g.batch_no)) = lower(btrim(r.batch_no))),
      (select sum(s.quantity) from public.finished_stock s where s.order_id = r.order_id and s.batch_no = r.batch_no)),
    'delivered_at', (select max(s.collected_at) from public.finished_stock s where s.order_id = r.order_id and s.batch_no = r.batch_no),
    'results', coalesce((
      select jsonb_object_agg(m.key, m.value)
      from jsonb_each(coalesce(r.measurements, '{}'::jsonb)) m
      where m.key = any (coa_keys)
    ), '{}'::jsonb),
    'checks', coalesce((
      select jsonb_agg(jsonb_build_object('code', t.code, 'label', t.customer_label, 'count', coalesce(d.count, 0)) order by t.sort_order, t.customer_label)
      from public.defect_types t
      left join public.qc_defects d on d.defect_type = t.code and d.inspection_id = r.id
      where t.active or coalesce(d.count, 0) > 0
    ), '[]'::jsonb),
    -- The quality manager who signed (older, unsigned certificates keep the inspector's name).
    'prepared_by', coalesce(sigs -> 'prepared' ->> 'name', case when r.coa_legacy then r.inspector_name end),
    'approved_by', null,
    -- Signer ids only for staff (to know who may remove it); customers get the name and signature.
    'signatures', case when is_staff then sigs else (
      select coalesce(jsonb_object_agg(k, v - 'signer_id'), '{}'::jsonb) from jsonb_each(sigs) as e(k, v)
    ) end
  );
end
$$;

revoke all on function public.certificate_of_analysis(uuid) from public, anon;
grant execute on function public.certificate_of_analysis(uuid) to authenticated;
