-- ============================================================================
-- Raw materials: a wastage allowance on top of the usage rate
--
-- raw_materials.waste_pct (0 to 100, default 0): extra used for wastage, on
-- top of the rate. What a material is taken to use is rate x (1 + wastage %):
-- automatic use on stillages, oven passes and production entries (from now
-- on; earlier records keep what they took), the dashboard and the
-- Calculator. Set per material in Inventory → Settings.
--
-- PVC-free liner compound: 0.173 kg per 1,000 crowns (173 mg a crown) plus
-- 10% wastage = 0.1903 kg per 1,000 crowns. Peniel works the wastage down
-- (or up) as the real figure comes in (production: 625 kg for about 257 to
-- 258 boxes past the camera, 270 to 280 after sorting the rejects). Set
-- only where the rate is still an earlier one (0.1818, 0.2, 0.2427, 0.2273)
-- or not set: a rate changed by hand stays.
--
-- material_usage_sync is as before (20261109000001), with the wastage.
-- Safe to run more than once.
-- ============================================================================

alter table public.raw_materials add column if not exists waste_pct numeric not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'raw_materials_waste_pct_check') then
    alter table public.raw_materials add constraint raw_materials_waste_pct_check check (waste_pct >= 0 and waste_pct <= 100);
  end if;
end $$;
comment on column public.raw_materials.waste_pct is 'Wastage allowance in %, on top of use_rate: used = rate x (1 + waste_pct / 100).';

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
    select id, use_basis, use_rate * (1 + coalesce(waste_pct, 0) / 100.0) as use_rate from public.raw_materials
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

update public.raw_materials
set use_basis = 'thousand_crowns', use_rate = 0.173, waste_pct = 10
where ink_name is null
  and regexp_replace(lower(name), '[^a-z]', '', 'g') in ('pvcfreelinercompound', 'pvcfreecompound', 'pvcfree', 'linercompound')
  and (use_rate is null or use_rate in (0.1818, 0.2, 0.2427, 0.2273))
  and (use_basis is null or use_basis = 'thousand_crowns');

select name, use_basis, use_rate, waste_pct, round(use_rate * (1 + waste_pct / 100), 4) as with_wastage
from public.raw_materials
where regexp_replace(lower(name), '[^a-z]', '', 'g') in ('pvcfreelinercompound', 'pvcfreecompound', 'pvcfree', 'linercompound');
