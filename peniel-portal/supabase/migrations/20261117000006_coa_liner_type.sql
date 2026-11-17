-- ============================================================================
-- Liner type ID per inspection, printed on its Certificate of Analysis
--
-- The certificate's "Liner Type ID" came from one setting for every batch
-- (Settings → Certificate of Analysis, e.g. Contoform 0369; "PVC" for PVC
-- liners). Some brands use another liner (Heineken: Actega Svelon 855), so
-- each inspection can now carry its own: qc_inspections.liner_type_id. The
-- inspection form fills it in from the brand's last inspection, else the
-- setting; empty = the setting, as before.
--
-- It is printed on the certificate, so it is part of what the quality
-- manager signs: changing it clears the signature like any other result.
-- Inspections without one keep their signatures (the fingerprint is the
-- same as before for them).
--
-- Internal column; customers see it only on their batch's certificate.
-- Safe to run more than once.
-- ============================================================================

alter table public.qc_inspections add column if not exists liner_type_id text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'qc_inspections_liner_type_id_check') then
    alter table public.qc_inspections add constraint qc_inspections_liner_type_id_check check (length(liner_type_id) <= 60);
  end if;
end $$;
comment on column public.qc_inspections.liner_type_id is 'The liner type ID printed on this batch''s certificate (e.g. Actega Svelon 855). Empty = the one in Settings → Certificate of Analysis.';

-- Saving an inspection (as in 20260925000001), with the liner type ID.
create or replace function public.qc_save_inspection(p jsonb)
returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_id      uuid := nullif(p ->> 'id', '')::uuid;
  v_sample  int := (p ->> 'sample_size')::int;
  v_result  public.qc_result := nullif(p ->> 'result', '')::public.qc_result;
  v_total   int := 0;
  v_defects jsonb := coalesce(p -> 'defects', '{}'::jsonb);
  d         record;
begin
  if not app.has_role('admin', 'quality') then
    perform app.deny();
  end if;
  if nullif(btrim(p ->> 'batch_no'), '') is null then
    raise exception 'Enter the batch number' using errcode = '22023';
  end if;
  if v_sample is null or v_sample <= 0 then
    raise exception 'Enter the sample size' using errcode = '22023';
  end if;
  if not exists (select 1 from public.orders o where o.id = (p ->> 'order_id')::uuid) then
    raise exception 'Choose the order this batch belongs to' using errcode = '22023';
  end if;
  if jsonb_typeof(v_defects) <> 'object' then
    raise exception 'Defect counts are invalid' using errcode = '22023';
  end if;

  for d in select key, value from jsonb_each_text(v_defects) loop
    if d.value !~ '^\d+$' then
      raise exception 'Defect counts must be whole numbers' using errcode = '22023';
    end if;
    if not exists (select 1 from public.defect_types t where t.code = d.key) then
      raise exception 'Unknown defect type %', d.key using errcode = '22023';
    end if;
    v_total := v_total + d.value::int;
  end loop;
  if v_total > v_sample then
    raise exception 'More defects than crowns in the sample' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.qc_inspections
      (batch_no, order_id, inspected_at, sample_size, measurements, reject_pct, result,
       customer_reason, internal_notes, published, inspector_id, liner_type_id)
    values
      (btrim(p ->> 'batch_no'), (p ->> 'order_id')::uuid,
       coalesce(nullif(p ->> 'inspected_at', '')::timestamptz, now()), v_sample,
       coalesce(p -> 'measurements', '{}'::jsonb), round(100.0 * v_total / v_sample, 2), v_result,
       nullif(btrim(p ->> 'customer_reason'), ''), nullif(btrim(p ->> 'internal_notes'), ''),
       coalesce((p ->> 'published')::boolean, false), auth.uid(),
       nullif(btrim(p ->> 'liner_type_id'), ''))
    returning id into v_id;
  else
    update public.qc_inspections set
      batch_no        = btrim(p ->> 'batch_no'),
      order_id        = (p ->> 'order_id')::uuid,
      inspected_at    = coalesce(nullif(p ->> 'inspected_at', '')::timestamptz, inspected_at),
      sample_size     = v_sample,
      measurements    = coalesce(p -> 'measurements', '{}'::jsonb),
      reject_pct      = round(100.0 * v_total / v_sample, 2),
      result          = v_result,
      customer_reason = nullif(btrim(p ->> 'customer_reason'), ''),
      internal_notes  = nullif(btrim(p ->> 'internal_notes'), ''),
      published       = coalesce((p ->> 'published')::boolean, false),
      -- Left as it is when the form doesn't send it.
      liner_type_id   = case when p ? 'liner_type_id' then nullif(btrim(p ->> 'liner_type_id'), '') else liner_type_id end
    where id = v_id;
    if not found then
      perform app.deny();
    end if;
    delete from public.qc_defects where inspection_id = v_id;
  end if;

  insert into public.qc_defects (inspection_id, defect_type, count)
  select v_id, key, value::int from jsonb_each_text(v_defects) where value::int > 0;

  return v_id;
end
$$;

revoke all on function public.qc_save_inspection(jsonb) from public, anon;
grant execute on function public.qc_save_inspection(jsonb) to authenticated;

-- The results the signature covers (as in 20261010000001), with the liner type ID.
create or replace function app.coa_fingerprint(p_inspection_id uuid) returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select md5(concat_ws('|',
    i.measurements::text, i.sample_size::text, coalesce(i.result::text, ''), i.batch_no, i.order_id::text,
    coalesce((select string_agg(d.defect_type || '=' || d.count, ',' order by d.defect_type)
              from public.qc_defects d where d.inspection_id = i.id and d.count > 0), ''),
    -- The liner type printed on the certificate (no entry: as before, so older signatures stand).
    i.liner_type_id))
  from public.qc_inspections i where i.id = p_inspection_id
$$;
revoke all on function app.coa_fingerprint(uuid) from public;

-- The certificate (as in 20261117000001), with the liner type ID.
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
    i.id, i.batch_no, i.inspected_at, i.sample_size, i.measurements, i.result, i.published, i.published_at, i.coa_legacy, i.liner_type_id,
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
    -- This batch's liner type ID (else the certificate shows the Settings one).
    'liner_type_id', r.liner_type_id,
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
