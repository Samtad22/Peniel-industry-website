-- ============================================================================
-- Signing the Certificate of Analysis
--
-- The CoA (form PIC-OF-053) has two signature lines: "Prepared by" (usually
-- the QC who inspected the batch) and "Approved by" (the quality officer or
-- manager). Both are now signed in the portal, drawn on screen.
--
-- 1. coa_signatures: one per line per inspection. Quality or admin sign, as
--    themselves; "Approved by" comes after "Prepared by", by a different
--    person, and only for a released batch.
-- 2. staff_signatures: each person's saved signature, to reuse.
-- 3. Customers get the certificate only when the batch is released,
--    published AND signed on both lines. Certificates customers could
--    already open before this change stay open (coa_legacy).
-- 4. Each signature keeps a fingerprint of the results it signed (the
--    measurements, sample, result and defect counts). If the results change
--    afterwards the signature no longer counts, and the line is signed again:
--    what was signed is what the customer sees.
-- 5. coa_notified_fp: the results the customer was last emailed about, so the
--    "Certificate of Analysis ready" email goes once per signed certificate.
--
-- Signatures are PNG images drawn in the browser (data URLs). They appear on
-- the certificate the customer sees, which is the point of signing.
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Signatures on a certificate
-- ---------------------------------------------------------------------------
create table if not exists public.coa_signatures (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.qc_inspections (id) on delete cascade,
  line          text not null check (line in ('prepared', 'approved')),
  signer_id     uuid not null references public.profiles (user_id) default auth.uid(),
  signer_name   text not null default '',
  image         text not null check (image like 'data:image/png;base64,%' and length(image) <= 200000),
  signed_at     timestamptz not null default now(),
  fingerprint   text not null default '',
  constraint coa_signatures_one_per_line unique (inspection_id, line)
);

-- Certificates customers could already open stay open: marked once, when the
-- column is added (a re-run must not mark batches released since).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'qc_inspections' and column_name = 'coa_legacy'
  ) then
    alter table public.qc_inspections add column coa_legacy boolean not null default false;
    update public.qc_inspections set coa_legacy = true where published and result = 'released';
  end if;
end
$$;
alter table public.qc_inspections add column if not exists coa_notified_fp text;
comment on column public.qc_inspections.coa_legacy is 'Released and published before certificates were signed in the portal: customers keep seeing it unsigned.';
comment on column public.qc_inspections.coa_notified_fp is 'Fingerprint of the signed results the customer was last emailed about.';

-- What a signature vouches for: the certificate's results as they are now.
create or replace function app.coa_fingerprint(p_inspection_id uuid) returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select md5(concat_ws('|',
    i.measurements::text, i.sample_size::text, coalesce(i.result::text, ''), i.batch_no, i.order_id::text,
    coalesce((select string_agg(d.defect_type || '=' || d.count, ',' order by d.defect_type)
              from public.qc_defects d where d.inspection_id = i.id and d.count > 0), '')))
  from public.qc_inspections i where i.id = p_inspection_id
$$;
revoke all on function app.coa_fingerprint(uuid) from public;

create or replace function app.coa_signatures_check() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_prepared uuid;
  v_result text;
begin
  if tg_op = 'DELETE' then
    -- (Not when the whole inspection is being deleted.)
    if old.line = 'prepared'
      and exists (select 1 from public.qc_inspections i where i.id = old.inspection_id)
      and exists (select 1 from public.coa_signatures a where a.inspection_id = old.inspection_id and a.line = 'approved' and a.fingerprint = old.fingerprint) then
      raise exception 'Remove the "Approved by" signature first.' using errcode = '23514';
    end if;
    return old;
  end if;

  new.signer_id := auth.uid();
  select coalesce(nullif(btrim(p.full_name), ''), p.email) into new.signer_name from public.profiles p where p.user_id = new.signer_id;
  new.signed_at := now();
  new.fingerprint := app.coa_fingerprint(new.inspection_id);

  -- A signature for results that have since changed no longer counts: signing again replaces it.
  -- ("Approved by" first: it sits on top of "Prepared by".)
  delete from public.coa_signatures s
  where s.inspection_id = new.inspection_id and s.line = 'approved' and s.fingerprint is distinct from new.fingerprint;
  delete from public.coa_signatures s
  where s.inspection_id = new.inspection_id and s.line = new.line and s.fingerprint is distinct from new.fingerprint;

  if new.line = 'approved' then
    select s.signer_id into v_prepared from public.coa_signatures s
    where s.inspection_id = new.inspection_id and s.line = 'prepared' and s.fingerprint = new.fingerprint;
    if v_prepared is null then
      raise exception 'The certificate needs its "Prepared by" signature (for these results) first.' using errcode = '23514';
    end if;
    if v_prepared = new.signer_id then
      raise exception 'A different person signs "Approved by".' using errcode = '23514';
    end if;
    select i.result::text into v_result from public.qc_inspections i where i.id = new.inspection_id;
    if v_result is distinct from 'released' then
      raise exception 'Only a released batch can be approved.' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists check_signature on public.coa_signatures;
create trigger check_signature before insert or delete on public.coa_signatures
  for each row execute function app.coa_signatures_check();

alter table public.coa_signatures enable row level security;
revoke all on public.coa_signatures from anon;
revoke all on public.coa_signatures from authenticated;
grant select, insert, delete on public.coa_signatures to authenticated;

drop policy if exists staff_read on public.coa_signatures;
create policy staff_read on public.coa_signatures for select to authenticated
  using (app.is_staff());
drop policy if exists quality_sign on public.coa_signatures;
create policy quality_sign on public.coa_signatures for insert to authenticated
  with check (app.has_role('admin', 'quality'));
drop policy if exists own_or_admin_remove on public.coa_signatures;
create policy own_or_admin_remove on public.coa_signatures for delete to authenticated
  using (app.has_role('admin', 'quality') and (signer_id = auth.uid() or app.has_role('admin')));

drop trigger if exists audit on public.coa_signatures;
create trigger audit after insert or update or delete on public.coa_signatures
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- 2. Saved signatures (each person sees and changes only their own)
-- ---------------------------------------------------------------------------
create table if not exists public.staff_signatures (
  user_id    uuid primary key references public.profiles (user_id) on delete cascade default auth.uid(),
  image      text not null check (image like 'data:image/png;base64,%' and length(image) <= 200000),
  updated_at timestamptz not null default now()
);
alter table public.staff_signatures enable row level security;
revoke all on public.staff_signatures from anon;
revoke all on public.staff_signatures from authenticated;
grant select, insert, update, delete on public.staff_signatures to authenticated;
drop policy if exists own_row on public.staff_signatures;
create policy own_row on public.staff_signatures for all to authenticated
  using (user_id = auth.uid() and app.is_staff()) with check (user_id = auth.uid() and app.is_staff());

drop trigger if exists touch_updated_at on public.staff_signatures;
create trigger touch_updated_at before update on public.staff_signatures
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. The certificate: final only when released, published and signed on both
--    lines for the results as they are (or issued before signing, coa_legacy)
-- ---------------------------------------------------------------------------
create or replace function app.coa_signed(p_inspection_id uuid) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select count(*) = 2 from public.coa_signatures s
  where s.inspection_id = p_inspection_id and s.fingerprint = app.coa_fingerprint(p_inspection_id)
    and (app.is_staff() or exists (
      select 1 from public.qc_inspections i join public.orders o on o.id = i.order_id
      where i.id = p_inspection_id and o.company_id = app.my_company_id()))
$$;
revoke all on function app.coa_signed(uuid) from public;
-- The customer view calls it as the customer (only for their own batches).
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

  -- Signatures that still match the results (a changed result voids them).
  select coalesce(jsonb_object_agg(s.line, jsonb_build_object('name', s.signer_name, 'image', s.image, 'signed_at', s.signed_at, 'signer_id', s.signer_id)), '{}'::jsonb)
  into sigs
  from public.coa_signatures s
  where s.inspection_id = r.id and s.fingerprint = fp;

  released := r.published and r.result = 'released';
  signed := sigs ? 'prepared' and sigs ? 'approved';
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
    'prepared_by', coalesce(sigs -> 'prepared' ->> 'name', r.inspector_name),
    'approved_by', sigs -> 'approved' ->> 'name',
    -- Signer ids only for staff (to know who may sign next); customers get names and signatures.
    'signatures', case when is_staff then sigs else (
      select coalesce(jsonb_object_agg(k, v - 'signer_id'), '{}'::jsonb) from jsonb_each(sigs) as e(k, v)
    ) end
  );
end
$$;

revoke all on function public.certificate_of_analysis(uuid) from public, anon;
grant execute on function public.certificate_of_analysis(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The customer's batch list: is the certificate ready to open? (new column at the end)
-- ---------------------------------------------------------------------------
create or replace view public.customer_quality_batches with (security_barrier = true) as
select
  i.id,
  i.batch_no,
  i.order_id,
  o.order_no,
  i.inspected_at,
  i.sample_size,
  i.reject_pct,
  i.result,
  i.customer_reason,
  i.published_at,
  (i.result = 'released' and (i.coa_legacy or app.coa_signed(i.id))) as certificate_ready
from public.qc_inspections i
join public.orders o on o.id = i.order_id
where i.published and o.company_id = app.my_company_id();

revoke all on public.customer_quality_batches from public, anon, authenticated;
grant select on public.customer_quality_batches to authenticated;

-- ---------------------------------------------------------------------------
-- 4. "Certificate of Analysis ready" email, once per signed certificate
--    (the app's notification job, with the service role, claims it)
-- ---------------------------------------------------------------------------
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
    and (select count(*) from public.coa_signatures s where s.inspection_id = i.id and s.fingerprint = fp) = 2;
  return found;
end
$$;
revoke all on function public.coa_claim_ready_email(uuid) from public, anon, authenticated;
grant execute on function public.coa_claim_ready_email(uuid) to service_role;
