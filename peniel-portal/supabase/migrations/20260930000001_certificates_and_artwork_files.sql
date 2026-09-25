-- ============================================================================
-- Certificate of Analysis per batch, colour variation check, AI/EPS artwork
--
-- 1. certificate_of_analysis(inspection): the data for the CoA form
--    (PIC-OF-053). Customers get it only for their own batches that are
--    published AND released; it carries the CoA's measured results (and
--    nothing else from the measurements: no press, line, SPC or notes).
--    Staff can open any inspection's certificate (marked as a draft until
--    it is released and published).
-- 2. "Colour variation" stays a visual check, listed after the CoA ones.
-- 3. The artwork and proofs buckets also accept AI and EPS files.
--
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Certificate of Analysis
-- ---------------------------------------------------------------------------
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
  final boolean;
begin
  select
    i.id, i.batch_no, i.inspected_at, i.sample_size, i.measurements, i.result, i.published, i.published_at,
    o.id as order_id, o.order_no, o.po_number, o.company_id, o.delivery_method, o.delivery_address,
    c.name as company_name, b.name as brand_name, b.size as crown_size, b.liner, b.finish,
    ins.full_name as prepared_by, pub.full_name as approved_by
  into r
  from public.qc_inspections i
  join public.orders o on o.id = i.order_id
  join public.companies c on c.id = o.company_id
  join public.brands b on b.id = o.brand_id
  left join public.profiles ins on ins.user_id = i.inspector_id
  left join public.profiles pub on pub.user_id = i.published_by
  where i.id = p_inspection_id;
  if not found then
    return null;
  end if;

  final := r.published and r.result = 'released';
  if not is_staff and (r.company_id is distinct from app.my_company_id() or not final) then
    return null;
  end if;

  return jsonb_build_object(
    'id', r.id,
    'final', final,
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
    'prepared_by', r.prepared_by,
    'approved_by', r.approved_by
  );
end
$$;

revoke all on function public.certificate_of_analysis(uuid) from public, anon;
grant execute on function public.certificate_of_analysis(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Colour variation stays a visual check (after the CoA's 13)
-- ---------------------------------------------------------------------------
insert into public.defect_types (code, customer_label, sort_order, active)
values ('colour_variation', 'Colour variation', 25, true)
on conflict (code) do update set active = true, sort_order = 25;

-- ---------------------------------------------------------------------------
-- 3. AI and EPS artwork files
-- ---------------------------------------------------------------------------
update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'application/postscript')
where id in ('artwork', 'proofs')
  and not ('application/postscript' = any (allowed_mime_types));
