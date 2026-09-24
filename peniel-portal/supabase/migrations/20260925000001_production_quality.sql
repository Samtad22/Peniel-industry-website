-- ============================================================================
-- Phase 3 — Production and quality
--
-- * Publishing is stamped: who published a production entry or QC result, and
--   when. Customers see the time as "Last updated by Peniel".
-- * Rejects can't exceed the crowns produced.
-- * A published production entry can't be changed or deleted; unpublish it
--   first, so the customer never sees numbers change silently.
-- * QC inspections are saved (with their defect counts) in one call,
--   qc_save_inspection, which also works out the reject rate.
-- * The customer views gain the timestamps behind "Last updated by Peniel".
--
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Who published, and when
-- ---------------------------------------------------------------------------
alter table public.production_entries
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references public.profiles (user_id);
alter table public.qc_inspections
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references public.profiles (user_id);

update public.production_entries set published_at = coalesce(published_at, updated_at) where published;
update public.qc_inspections set published_at = coalesce(published_at, updated_at) where published;

create or replace function app.stamp_published()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    new.published_at := now();
    new.published_by := auth.uid();
  elsif not new.published then
    new.published_at := null;
    new.published_by := null;
  end if;
  return new;
end
$$;

drop trigger if exists stamp_published on public.production_entries;
create trigger stamp_published before insert or update on public.production_entries
  for each row execute function app.stamp_published();
drop trigger if exists stamp_published on public.qc_inspections;
create trigger stamp_published before insert or update on public.qc_inspections
  for each row execute function app.stamp_published();

-- ---------------------------------------------------------------------------
-- Production entries: rejects ≤ produced; published entries are frozen
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.production_entries'::regclass and conname = 'production_entries_rejects_le_produced'
  ) then
    alter table public.production_entries
      add constraint production_entries_rejects_le_produced check (reject_qty <= produced_qty);
  end if;
end $$;

create or replace function app.guard_published_entry()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.published then
      raise exception 'Unpublish this entry before deleting it' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if old.published and new.published and (
       new.produced_qty <> old.produced_qty or new.reject_qty <> old.reject_qty
    or new.order_id <> old.order_id or new.entry_date <> old.entry_date
    or new.shift <> old.shift or new.line_id <> old.line_id
  ) then
    raise exception 'Unpublish this entry before changing it' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

drop trigger if exists guard_published_entry on public.production_entries;
create trigger guard_published_entry before update or delete on public.production_entries
  for each row execute function app.guard_published_entry();

-- ---------------------------------------------------------------------------
-- Save a QC inspection and its defect counts in one go.
--
-- Runs as the caller (security invoker), so RLS decides who may write:
-- admin and quality. p = {
--   id?, batch_no, order_id, inspected_at, sample_size,
--   measurements: {…numbers…}, defects: {defect_code: count},
--   result: null | 'released' | 'on_hold', customer_reason, internal_notes,
--   published: bool }
-- ---------------------------------------------------------------------------
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
       customer_reason, internal_notes, published, inspector_id)
    values
      (btrim(p ->> 'batch_no'), (p ->> 'order_id')::uuid,
       coalesce(nullif(p ->> 'inspected_at', '')::timestamptz, now()), v_sample,
       coalesce(p -> 'measurements', '{}'::jsonb), round(100.0 * v_total / v_sample, 2), v_result,
       nullif(btrim(p ->> 'customer_reason'), ''), nullif(btrim(p ->> 'internal_notes'), ''),
       coalesce((p ->> 'published')::boolean, false), auth.uid())
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
      published       = coalesce((p ->> 'published')::boolean, false)
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

-- ---------------------------------------------------------------------------
-- "Last updated by Peniel": timestamps on the customer views.
-- New columns go at the end so the views can be replaced in place.
-- ---------------------------------------------------------------------------
create or replace view public.customer_daily_output with (security_barrier = true) as
select
  pe.order_id,
  pe.entry_date,
  sum(pe.produced_qty)::bigint as produced_qty,
  sum(pe.reject_qty)::bigint as reject_qty,
  case when sum(pe.produced_qty) > 0
    then round(100.0 * sum(pe.reject_qty) / sum(pe.produced_qty), 2)
    else 0 end as reject_pct,
  max(pe.published_at) as published_at
from public.production_entries pe
join public.orders o on o.id = pe.order_id
where pe.published and o.company_id = app.my_company_id()
group by pe.order_id, pe.entry_date;

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
  i.published_at
from public.qc_inspections i
join public.orders o on o.id = i.order_id
where i.published and o.company_id = app.my_company_id();

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
where s.company_id = app.my_company_id();

revoke all on public.customer_daily_output, public.customer_quality_batches, public.customer_finished_stock
  from public, anon, authenticated;
grant select on public.customer_daily_output, public.customer_quality_batches, public.customer_finished_stock
  to authenticated;
