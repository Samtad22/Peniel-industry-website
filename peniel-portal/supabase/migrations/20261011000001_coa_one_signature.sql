-- ============================================================================
-- The Certificate of Analysis has one signature: "Prepared by"
--
-- Peniel dropped the "Approved by" line. The certificate is signed once, by
-- the quality manager (role quality), under "Prepared by":
-- 1. Only quality signs (admin can still remove a signature). "Approved by"
--    signatures already made are removed; new ones are refused.
-- 2. Customers get the certificate when the batch is released, published and
--    signed for its results (or it was issued before signing, coa_legacy).
-- 3. The "ready" email goes once that signature is in and the batch is
--    published.
-- Changing the results still voids the signature (see 20261010000001).
-- Safe to run more than once.
-- ============================================================================

create or replace function app.coa_signatures_check() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.line <> 'prepared' then
    raise exception 'The certificate has one signature: "Prepared by", by the quality manager.' using errcode = '23514';
  end if;

  new.signer_id := auth.uid();
  select coalesce(nullif(btrim(p.full_name), ''), p.email) into new.signer_name from public.profiles p where p.user_id = new.signer_id;
  new.signed_at := now();
  new.fingerprint := app.coa_fingerprint(new.inspection_id);

  -- A signature for results that have since changed no longer counts: signing again replaces it.
  delete from public.coa_signatures s
  where s.inspection_id = new.inspection_id and s.fingerprint is distinct from new.fingerprint;
  return new;
end
$$;

-- "Approved by" signatures from before this change.
delete from public.coa_signatures where line = 'approved';

drop policy if exists quality_sign on public.coa_signatures;
create policy quality_sign on public.coa_signatures for insert to authenticated
  with check (app.has_role('quality'));

create or replace function app.coa_signed(p_inspection_id uuid) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.coa_signatures s
    where s.inspection_id = p_inspection_id and s.line = 'prepared' and s.fingerprint = app.coa_fingerprint(p_inspection_id)
  )
  and (app.is_staff() or exists (
    select 1 from public.qc_inspections i join public.orders o on o.id = i.order_id
    where i.id = p_inspection_id and o.company_id = app.my_company_id()))
$$;
revoke all on function app.coa_signed(uuid) from public;
grant execute on function app.coa_signed(uuid) to authenticated;

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
    'quantity', (select sum(s.quantity) from public.finished_stock s where s.order_id = r.order_id and s.batch_no = r.batch_no),
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

create or replace function public.coa_claim_ready_email(p_inspection_id uuid) returns boolean
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  fp text := app.coa_fingerprint(p_inspection_id);
begin
  update public.qc_inspections i set coa_notified_fp = fp
  where i.id = p_inspection_id and i.published and i.result = 'released'
    and i.coa_notified_fp is distinct from fp
    and exists (select 1 from public.coa_signatures s where s.inspection_id = i.id and s.line = 'prepared' and s.fingerprint = fp);
  return found;
end
$$;
revoke all on function public.coa_claim_ready_email(uuid) from public, anon, authenticated;
grant execute on function public.coa_claim_ready_email(uuid) to service_role;
