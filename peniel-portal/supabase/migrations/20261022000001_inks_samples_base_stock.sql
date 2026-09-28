-- ============================================================================
-- Printing inks as raw materials, sample sheets, and base coat before a brand
--
-- 1. Inks: every colour on a brand (its Pantone or ink name, e.g.
--    "PANTONE 485 C") is an ink on the raw-material list, one stock per ink in
--    kg (raw_materials.ink_name), shared by every brand that prints it. New
--    colours added to a brand get their ink by themselves.
-- 2. brand_ink_rates: how many grams of each ink a sheet of a brand takes.
--    The print form uses it to fill in the ink used; the printer can change
--    the figure. Admin, warehouse and production set it.
-- 3. print_runs.inks: grams of each ink used for the stillage
--    ({"<ink material id>": grams}). Saving it takes the ink off stock (in kg)
--    like the other materials used automatically, kept in step on edit and
--    delete.
-- 4. sample_sheets: sheets printed as samples (colour match, proof, trial):
--    brand, sheets and grams of each ink. Tinplate and ink come off stock the
--    same way; they are not stock for the presses. Admin and production log
--    them; only admin deletes.
-- 5. Base coat before the brand is known: a base-coated stillage can have no
--    brand yet (base-coated stock). The brand is chosen when it is printed.
--
-- Internal only: customers read none of it. Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Inks
-- ---------------------------------------------------------------------------
alter table public.raw_materials add column if not exists ink_name text;
create unique index if not exists raw_materials_ink_name_key on public.raw_materials (lower(ink_name));
comment on column public.raw_materials.ink_name is 'A printing ink: the colour name as on the brands (e.g. PANTONE 485 C). Stock in kg; usage per stillage in print_runs.inks.';

-- "PANTONE 485 C #DA291C" -> "PANTONE 485 C"; a bare "#DA291C" -> null.
create or replace function app.ink_name(p text) returns text
language sql immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(btrim(coalesce(p, '')), '\s*#[0-9A-Fa-f]{6}$', '')), '')
$$;

-- The inks of these colours on the list, added when missing.
create or replace function app.ensure_inks(p_colours text[]) returns void
language sql security definer
set search_path = public, pg_temp
as $$
  insert into public.raw_materials (name, unit, on_hand, ink_name)
  select distinct on (lower(x.n)) left('Ink · ' || x.n, 80), 'kg', 0, x.n
  from (select app.ink_name(c) as n from unnest(coalesce(p_colours, '{}'::text[])) c) x
  where x.n is not null
    and not exists (select 1 from public.raw_materials m where lower(m.ink_name) = lower(x.n))
  on conflict do nothing;
$$;
revoke all on function app.ensure_inks(text[]) from public;

create or replace function app.brands_ensure_inks() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform app.ensure_inks(new.colours);
  return null;
end
$$;
drop trigger if exists ensure_inks on public.brands;
create trigger ensure_inks after insert or update of colours on public.brands
  for each row execute function app.brands_ensure_inks();

-- The inks of today's brands.
do $$
declare
  b record;
begin
  for b in select colours from public.brands loop
    perform app.ensure_inks(b.colours);
  end loop;
end $$;

-- An ink figure: {"<ink material id>": grams, ...}, grams 0 to 10,000,000.
-- Zero entries are dropped.
create or replace function app.check_inks() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  e record;
begin
  if new.inks is null or jsonb_typeof(new.inks) <> 'object' then
    if new.inks is not null and jsonb_typeof(new.inks) <> 'null' then
      raise exception 'Ink used: a list of inks and grams (ink_grams).' using errcode = '23514';
    end if;
    new.inks := '{}'::jsonb;
    return new;
  end if;
  for e in select key, value from jsonb_each(new.inks) loop
    if jsonb_typeof(e.value) <> 'number' or (e.value::text)::numeric < 0 or (e.value::text)::numeric > 10000000 then
      raise exception 'Ink used: grams from 0 to 10,000,000 (ink_grams).' using errcode = '23514';
    end if;
    if e.key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not exists (select 1 from public.raw_materials m where m.id = e.key::uuid and m.ink_name is not null) then
      raise exception 'That is not an ink on the list (ink_unknown).' using errcode = '23514';
    end if;
  end loop;
  new.inks := coalesce((select jsonb_object_agg(key, value) from jsonb_each(new.inks) where (value::text)::numeric > 0), '{}'::jsonb);
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Ink per sheet, per brand
-- ---------------------------------------------------------------------------
create table if not exists public.brand_ink_rates (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands (id) on delete cascade,
  material_id uuid not null references public.raw_materials (id) on delete cascade,
  g_per_sheet numeric not null check (g_per_sheet > 0 and g_per_sheet <= 1000),
  updated_by  uuid references public.profiles (user_id) on delete set null default auth.uid(),
  updated_at  timestamptz not null default now(),
  unique (brand_id, material_id)
);
comment on table public.brand_ink_rates is 'INTERNAL. Grams of an ink one printed sheet of a brand takes; fills in the ink used on the print and sample forms.';

create or replace function app.brand_ink_rates_check() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.raw_materials m where m.id = new.material_id and m.ink_name is not null) then
    raise exception 'That is not an ink on the list (ink_unknown).' using errcode = '23514';
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end
$$;
drop trigger if exists check_ink on public.brand_ink_rates;
create trigger check_ink before insert or update on public.brand_ink_rates
  for each row execute function app.brand_ink_rates_check();

alter table public.brand_ink_rates enable row level security;
revoke all on public.brand_ink_rates from anon;
revoke all on public.brand_ink_rates from authenticated;
grant select, insert, update, delete on public.brand_ink_rates to authenticated;
drop policy if exists staff_read on public.brand_ink_rates;
create policy staff_read on public.brand_ink_rates for select to authenticated using (app.is_staff());
drop policy if exists rates_write on public.brand_ink_rates;
create policy rates_write on public.brand_ink_rates for all to authenticated
  using (app.has_role('admin', 'warehouse', 'production'))
  with check (app.has_role('admin', 'warehouse', 'production'));

drop trigger if exists audit on public.brand_ink_rates;
create trigger audit after insert or update or delete on public.brand_ink_rates
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- 3. Ink used per stillage
-- ---------------------------------------------------------------------------
alter table public.print_runs add column if not exists inks jsonb not null default '{}'::jsonb;
comment on column public.print_runs.inks is 'Grams of each ink used for this stillage: {"<ink material id>": grams}.';
drop trigger if exists check_inks on public.print_runs;
create trigger check_inks before insert or update of inks on public.print_runs
  for each row execute function app.check_inks();

-- ---------------------------------------------------------------------------
-- 4. Sample sheets
-- ---------------------------------------------------------------------------
create table if not exists public.sample_sheets (
  id          uuid primary key default gen_random_uuid(),
  sample_date date not null default (now() at time zone 'Africa/Addis_Ababa')::date,
  shift       text check (shift in ('A', 'B', 'C')),
  brand_id    uuid references public.brands (id) on delete set null,
  purpose     text not null default 'colour_match' check (purpose in ('colour_match', 'proof', 'trial', 'other')),
  sheets      int not null check (sheets between 1 and 100000),
  inks        jsonb not null default '{}'::jsonb,
  notes       text check (length(notes) <= 1000),
  entered_by  uuid references public.profiles (user_id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists sample_sheets_date_idx on public.sample_sheets (sample_date desc);
comment on table public.sample_sheets is 'INTERNAL. Sheets printed as samples (colour match, proof, trial) with the ink used: tinplate and ink come off stock; not stock for the presses.';

drop trigger if exists check_inks on public.sample_sheets;
create trigger check_inks before insert or update of inks on public.sample_sheets
  for each row execute function app.check_inks();

alter table public.sample_sheets enable row level security;
revoke all on public.sample_sheets from anon;
revoke all on public.sample_sheets from authenticated;
grant select, insert, update, delete on public.sample_sheets to authenticated;
drop policy if exists staff_read on public.sample_sheets;
create policy staff_read on public.sample_sheets for select to authenticated using (app.is_staff());
drop policy if exists production_write on public.sample_sheets;
create policy production_write on public.sample_sheets for all to authenticated
  using (app.has_role('admin', 'production')) with check (app.has_role('admin', 'production'));
drop policy if exists admin_only_delete on public.sample_sheets;
create policy admin_only_delete on public.sample_sheets as restrictive for delete to authenticated using (app.has_role('admin'));

drop trigger if exists audit on public.sample_sheets;
create trigger audit after insert or update or delete on public.sample_sheets
  for each row execute function app.audit_row();
drop trigger if exists touch_updated_at on public.sample_sheets;
create trigger touch_updated_at before update on public.sample_sheets
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Materials used: as before, plus the inks of stillages and sample sheets
-- (grams -> kg), and sample sheets' tinplate.
-- ---------------------------------------------------------------------------
create or replace function app.material_usage_sync(p_table text, p_id uuid) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_basis jsonb := '{}'::jsonb;   -- basis -> amount for this record
  v_inks jsonb := '{}'::jsonb;    -- ink material id -> grams
  v_label text;
  r record;
  p record;
  e record;
  srt record;
  smp record;
  m record;
  k record;
begin
  delete from public.raw_material_movements where source = 'auto' and source_table = p_table and source_id = p_id;

  if p_table = 'print_runs' then
    select * into r from public.print_runs where id = p_id;
    if found then
      v_label := 'stillage ' || coalesce(r.stillage_no, left(r.id::text, 8));
      -- Tinplate enters the line at the first step: the base coat, or the printer.
      v_basis := jsonb_build_object(
        'sheet_in', case when r.base_sheets is not null then r.base_sheets
                         when r.printed then r.sheets_printed + r.sheets_spoiled else 0 end,
        'sheet_printed', case when r.printed then r.sheets_printed + r.sheets_spoiled else 0 end);
      v_inks := coalesce(r.inks, '{}'::jsonb);
    end if;
  elsif p_table = 'stillage_passes' then
    select sp.*, pr.stillage_no, pr.sheets_printed, pr.base_sheets, pr.id as run_id into p
    from public.stillage_passes sp join public.print_runs pr on pr.id = sp.print_run_id
    where sp.id = p_id;
    if found then
      v_label := p.stage || ', stillage ' || coalesce(p.stillage_no, left(p.run_id::text, 8));
      v_basis := jsonb_build_object(
        p.stage || '_sheet', case when p.stage = 'base_coat' then coalesce(p.base_sheets, 0) else p.sheets_printed end,
        'oven_pass', 1);
    end if;
  elsif p_table = 'production_entries' then
    select pe.*, o.order_no into e from public.production_entries pe join public.orders o on o.id = pe.order_id where pe.id = p_id;
    if found then
      v_label := 'production ' || e.order_no || ' ' || e.entry_date || ' shift ' || e.shift;
      v_basis := jsonb_build_object(
        'thousand_crowns', (e.produced_qty + e.reject_qty) / 1000.0,
        -- Good crowns go into boxes of 10,000.
        'box', e.produced_qty / 10000.0);
    end if;
  elsif p_table = 'sorting_records' then
    select sr.passed_cartons, sr.batch_no, sr.sorted_on, o.order_no into srt
    from public.sorting_records sr join public.orders o on o.id = sr.order_id where sr.id = p_id;
    if found then
      v_label := 'sorting ' || srt.order_no || ' batch ' || srt.batch_no || ' ' || srt.sorted_on;
      -- Crowns that passed sorting are packed again: one box per carton.
      v_basis := jsonb_build_object('box', srt.passed_cartons);
    end if;
  elsif p_table = 'sample_sheets' then
    select s.*, b.name as brand into smp from public.sample_sheets s left join public.brands b on b.id = s.brand_id where s.id = p_id;
    if found then
      v_label := 'sample sheets' || coalesce(' ' || smp.brand, '') || ' ' || smp.sample_date;
      v_basis := jsonb_build_object('sheet_in', smp.sheets, 'sheet_printed', smp.sheets);
      v_inks := coalesce(smp.inks, '{}'::jsonb);
    end if;
  end if;

  for m in
    select id, use_basis, use_rate from public.raw_materials
    where active and use_basis is not null and use_rate > 0 and v_basis ? use_basis
  loop
    if (v_basis ->> m.use_basis)::numeric > 0 then
      insert into public.raw_material_movements (material_id, quantity, reason, source, source_table, source_id)
      values (m.id, -round((v_basis ->> m.use_basis)::numeric * m.use_rate, 3), 'Used: ' || v_label, 'auto', p_table, p_id);
    end if;
  end loop;

  -- Inks: grams used, stock in kg.
  for k in
    select mt.id, (i.value::text)::numeric as grams
    from jsonb_each(v_inks) i join public.raw_materials mt on mt.id::text = i.key and mt.ink_name is not null
  loop
    if k.grams > 0 then
      insert into public.raw_material_movements (material_id, quantity, reason, source, source_table, source_id)
      values (k.id, -round(k.grams / 1000.0, 3), 'Used: ' || v_label, 'auto', p_table, p_id);
    end if;
  end loop;
end
$$;
revoke all on function app.material_usage_sync(text, uuid) from public;

drop trigger if exists material_usage on public.print_runs;
create trigger material_usage after insert or update of sheets_printed, sheets_spoiled, base_sheets, printed, inks or delete on public.print_runs
  for each row execute function app.material_usage_trigger();
drop trigger if exists material_usage on public.sample_sheets;
create trigger material_usage after insert or update of sheets, inks, brand_id, sample_date or delete on public.sample_sheets
  for each row execute function app.material_usage_trigger();

-- ---------------------------------------------------------------------------
-- 5. Base-coated stock: no brand until it is printed
-- ---------------------------------------------------------------------------
alter table public.print_runs alter column brand_id drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'print_runs_brand_when_printed') then
    alter table public.print_runs add constraint print_runs_brand_when_printed check (brand_id is not null or not printed);
  end if;
end $$;
comment on column public.print_runs.brand_id is 'The brand printed. Empty only on base-coated stock that is not printed yet (the brand is chosen when it is printed).';
