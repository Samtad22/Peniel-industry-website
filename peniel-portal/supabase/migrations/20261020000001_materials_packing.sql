-- ============================================================================
-- Raw materials: varnish and packing in, printing ink out
--
-- 1. raw_materials.active: a material taken off the list stays in the
--    history (movements, reports) but is hidden from Inventory, the reports'
--    stock lists and automatic use. Admin and warehouse can take one off or
--    bring it back from its Settings.
-- 2. A new usage basis, "box": one box of 10,000 good crowns packed. Each
--    production entry packs produced_qty / 10,000 boxes (camera rejects go
--    to sorting, not into boxes). Each box takes 1 box and 1 polybag.
-- 3. The list: Varnish (used per sheet varnished; the rate is set in
--    Inventory), Polybag and Box (1 each per box, automatically). Printing
--    ink is taken off: deleted if it was never used, otherwise hidden.
-- Safe to run more than once.
-- ============================================================================

alter table public.raw_materials add column if not exists active boolean not null default true;
comment on column public.raw_materials.active is 'False = taken off the list: kept for history, hidden from Inventory and not used automatically.';

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'raw_materials_use_basis_check') then
    alter table public.raw_materials drop constraint raw_materials_use_basis_check;
  end if;
  alter table public.raw_materials add constraint raw_materials_use_basis_check check (
    use_basis in ('sheet_in', 'sheet_printed', 'base_coat_sheet', 'varnish_sheet', 'lacquer_sheet', 'oven_pass', 'thousand_crowns', 'box'));
end $$;

comment on column public.raw_materials.use_basis is 'What the material is used per: sheet_in (tinplate), sheet_printed, base_coat_sheet, varnish_sheet, lacquer_sheet, oven_pass, thousand_crowns, box (one box of 10,000 good crowns packed).';

-- Same as before, plus the "box" basis and only materials on the list.
create or replace function app.material_usage_sync(p_table text, p_id uuid) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_basis jsonb := '{}'::jsonb;   -- basis -> amount for this record
  v_label text;
  r record;
  p record;
  e record;
  m record;
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
end
$$;
revoke all on function app.material_usage_sync(text, uuid) from public;

-- The new materials (rates for packing: 1 box and 1 polybag per box).
insert into public.raw_materials (name, unit, on_hand, reorder_level, use_basis, use_rate) values
  ('Varnish', 'L',        0, null, null,  null),
  ('Polybag', 'polybags', 0, null, 'box', 1),
  ('Box',     'boxes',    0, null, 'box', 1)
on conflict (name) do nothing;

-- Printing ink off the list: deleted if never used, else kept for history.
delete from public.raw_materials m
where m.name = 'Printing ink'
  and not exists (select 1 from public.raw_material_movements mv where mv.material_id = m.id);
update public.raw_materials set active = false, use_basis = null, use_rate = null
where name = 'Printing ink' and active;
