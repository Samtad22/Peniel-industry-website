-- ============================================================================
-- Base coat used by colour: white and transparent apart
--
-- White base coat and transparent base coat go on different products. Until
-- now a material used "per sheet base-coated" was taken off for every base
-- coat, whichever colour. Two new usage bases:
--   white_base_coat_sheet        per sheet given the WHITE base coat
--   transparent_base_coat_sheet  per sheet given the TRANSPARENT base coat
-- The coat of a pass is the one recorded on it (stillage_passes.material,
-- "White base coat" / "Transparent base coat"), else the brand's base coat.
-- base_coat_sheet stays for anything used on every base coat, either colour.
--
-- Materials already on "per sheet base-coated" whose name says white or
-- transparent move to their colour's basis (rate kept). As before, rates apply
-- from when they are set: past passes are not recounted unless edited.
-- The usage is recounted when a pass's coat (material) is changed too.
--
-- Internal only. Safe to run more than once.
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'raw_materials_use_basis_check') then
    alter table public.raw_materials drop constraint raw_materials_use_basis_check;
  end if;
  alter table public.raw_materials add constraint raw_materials_use_basis_check check (
    use_basis in ('sheet_in', 'sheet_printed', 'base_coat_sheet', 'white_base_coat_sheet', 'transparent_base_coat_sheet',
                  'varnish_sheet', 'lacquer_sheet', 'oven_pass', 'thousand_crowns', 'box'));
end $$;

comment on column public.raw_materials.use_basis is 'What the material is used per: sheet_in (tinplate), sheet_printed, base_coat_sheet (any base coat), white_base_coat_sheet, transparent_base_coat_sheet, varnish_sheet, lacquer_sheet, oven_pass, thousand_crowns, box (one box of 10,000 good crowns packed).';

-- The coat of a base coat pass: what was recorded on it, else the brand's.
create or replace function app.base_coat_of(p_material text, p_brand_coat text) returns text
language sql immutable
set search_path = ''
as $$
  select case
    when p_material ~* 'transparent|clear' then 'transparent'
    when p_material ~* 'white' then 'white'
    when p_brand_coat in ('white', 'transparent') then p_brand_coat
  end
$$;

-- Same as before (20261022000001), plus the coat's own basis on base coat passes.
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
  v_coat text;
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
    select sp.*, pr.stillage_no, pr.sheets_printed, pr.base_sheets, pr.id as run_id, b.base_coat as brand_coat into p
    from public.stillage_passes sp join public.print_runs pr on pr.id = sp.print_run_id
    left join public.brands b on b.id = pr.brand_id
    where sp.id = p_id;
    if found then
      v_label := p.stage || ', stillage ' || coalesce(p.stillage_no, left(p.run_id::text, 8));
      v_basis := jsonb_build_object(
        p.stage || '_sheet', case when p.stage = 'base_coat' then coalesce(p.base_sheets, 0) else p.sheets_printed end,
        'oven_pass', 1);
      -- The white or the transparent coat: only that coat's material is used.
      if p.stage = 'base_coat' then
        v_coat := app.base_coat_of(p.material, p.brand_coat);
        if v_coat is not null then
          v_basis := v_basis || jsonb_build_object(v_coat || '_base_coat_sheet', coalesce(p.base_sheets, 0));
        end if;
      end if;
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

drop trigger if exists material_usage on public.stillage_passes;
create trigger material_usage after insert or update of stage, print_run_id, material or delete on public.stillage_passes
  for each row execute function app.material_usage_trigger();

-- Materials on "per sheet base-coated" named for one coat move to that coat.
update public.raw_materials set use_basis = 'transparent_base_coat_sheet'
where use_basis = 'base_coat_sheet' and name ~* 'transparent|clear';
update public.raw_materials set use_basis = 'white_base_coat_sheet'
where use_basis = 'base_coat_sheet' and name ~* 'white';
