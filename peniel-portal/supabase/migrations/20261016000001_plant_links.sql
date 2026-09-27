-- ============================================================================
-- Linking the plant together
--
-- 1. Stillages to the press: a finished (lacquered) stillage is sent to a
--    press as a whole (print_runs.to_press_at / press_id). Printed-sheet stock
--    per brand = finished stillages not yet sent.
-- 2. Production per liner: production_lines are now the liners of the presses
--    (machine_id), named "Press 1 · Liner 1A". The setup lines ("Line 1 ·
--    Press A", "Line 2 · Press B") stay for past entries but are hidden from
--    new ones (active = false). A liner added later gets its line; a liner
--    still on the way is hidden until installed.
-- 3. Raw materials used automatically: each material can have a usage rate on
--    one basis (per sheet into the line, per sheet printed, per sheet through
--    the base coat / varnish / lacquer, per oven pass, per 1,000 crowns).
--    Logging sheets, oven passes and production entries then records the
--    material used as "auto" movements, kept in step when the record is
--    changed or deleted. Rates apply from when they are set (no back-dating).
--    Stock can go below zero from automatic use (a count is due); by hand it
--    still can't.
--
-- Internal only. Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Stillages to the press
-- ---------------------------------------------------------------------------
alter table public.print_runs add column if not exists to_press_at timestamptz;
alter table public.print_runs add column if not exists press_id uuid references public.machines (id) on delete set null;
comment on column public.print_runs.to_press_at is 'When the finished stillage went to a press (empty = still in printed-sheet stock).';

create or replace function app.print_runs_to_press() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.to_press_at is not null and old.to_press_at is null and not exists (
    select 1 from public.stillage_passes p
    where p.print_run_id = new.id and p.stage = 'lacquer' and p.finished_at is not null
  ) then
    raise exception 'Only a finished (lacquered) stillage goes to the press.' using errcode = '23514';
  end if;
  if new.to_press_at is null then
    new.press_id := null;
  end if;
  return new;
end
$$;
drop trigger if exists to_press on public.print_runs;
create trigger to_press before update on public.print_runs
  for each row execute function app.print_runs_to_press();

-- ---------------------------------------------------------------------------
-- 2. Production lines = the presses' liners
-- ---------------------------------------------------------------------------
alter table public.production_lines add column if not exists machine_id uuid references public.machines (id) on delete set null;
alter table public.production_lines add column if not exists active boolean not null default true;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'production_lines_machine_key') then
    alter table public.production_lines add constraint production_lines_machine_key unique (machine_id);
  end if;
end $$;

-- The setup lines keep their past entries but aren't offered any more.
update public.production_lines set active = false where machine_id is null and active;

-- One line per liner (a machine in the press section with a press above it).
create or replace function app.liner_line(p_machine uuid) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.production_lines (name, machine_id)
  select p.name || ' · ' || m.name, m.id
  from public.machines m join public.machines p on p.id = m.parent_id
  where m.id = p_machine and m.category = 'press'
  on conflict (machine_id) do nothing;
end
$$;
revoke all on function app.liner_line(uuid) from public;

do $$
declare
  m record;
begin
  for m in select id from public.machines where category = 'press' and parent_id is not null loop
    perform app.liner_line(m.id);
  end loop;
end $$;

-- A liner added or renamed later keeps its line in step.
create or replace function app.machines_liner_line() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.category = 'press' and new.parent_id is not null then
    perform app.liner_line(new.id);
    update public.production_lines l
    set name = p.name || ' · ' || new.name
    from public.machines p
    where l.machine_id = new.id and p.id = new.parent_id and l.name is distinct from p.name || ' · ' || new.name;
  end if;
  -- A press renamed: its liners' lines follow.
  if tg_op = 'UPDATE' and new.parent_id is null and new.name is distinct from old.name then
    update public.production_lines l
    set name = new.name || ' · ' || c.name
    from public.machines c
    where c.parent_id = new.id and l.machine_id = c.id;
  end if;
  return null;
end
$$;
drop trigger if exists liner_line on public.machines;
create trigger liner_line after insert or update on public.machines
  for each row execute function app.machines_liner_line();

-- ---------------------------------------------------------------------------
-- 3. Raw materials used automatically
-- ---------------------------------------------------------------------------
alter table public.raw_materials add column if not exists use_basis text;
alter table public.raw_materials add column if not exists use_rate numeric;
alter table public.raw_material_movements add column if not exists source text not null default 'manual';
alter table public.raw_material_movements add column if not exists source_table text;
alter table public.raw_material_movements add column if not exists source_id uuid;
create index if not exists raw_material_movements_source_idx on public.raw_material_movements (source_table, source_id) where source = 'auto';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'raw_materials_use_basis_check') then
    alter table public.raw_materials add constraint raw_materials_use_basis_check check (
      use_basis in ('sheet_in', 'sheet_printed', 'base_coat_sheet', 'varnish_sheet', 'lacquer_sheet', 'oven_pass', 'thousand_crowns'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'raw_materials_use_rate_check') then
    alter table public.raw_materials add constraint raw_materials_use_rate_check check (use_rate >= 0 and use_rate <= 1000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'raw_material_movements_source_check') then
    alter table public.raw_material_movements add constraint raw_material_movements_source_check check (source in ('manual', 'auto'));
  end if;
  -- Automatic use may take stock below zero (a count is due); by hand it can't (the trigger below).
  if exists (select 1 from pg_constraint where conname = 'raw_materials_on_hand_not_negative') then
    alter table public.raw_materials drop constraint raw_materials_on_hand_not_negative;
  end if;
end $$;

comment on column public.raw_materials.use_basis is 'What the material is used per: sheet_in (tinplate), sheet_printed, base_coat_sheet, varnish_sheet, lacquer_sheet, oven_pass, thousand_crowns.';
comment on column public.raw_materials.use_rate is 'Quantity (in the material''s unit) used per basis unit. Empty = not tracked automatically.';

-- Movements keep the stock on hand in step, both ways.
create or replace function app.apply_material_movement()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_on_hand numeric;
begin
  if tg_op = 'DELETE' then
    update public.raw_materials set on_hand = on_hand - old.quantity, updated_at = now() where id = old.material_id;
    return null;
  end if;
  update public.raw_materials
  set on_hand = on_hand + new.quantity, updated_at = now()
  where id = new.material_id
  returning on_hand into v_on_hand;
  if new.source = 'manual' and new.quantity < 0 and v_on_hand < 0 then
    raise exception 'That is more than is in stock (raw_materials_on_hand_not_negative).' using errcode = '23514';
  end if;
  return null;
end
$$;
drop trigger if exists apply_material_movement on public.raw_material_movements;
create trigger apply_material_movement after insert or delete on public.raw_material_movements
  for each row execute function app.apply_material_movement();

-- Recompute the automatic use of one record: remove its auto movements, add them again.
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
      v_basis := jsonb_build_object('thousand_crowns', (e.produced_qty + e.reject_qty) / 1000.0);
    end if;
  end if;

  for m in
    select id, use_basis, use_rate from public.raw_materials
    where use_basis is not null and use_rate > 0 and v_basis ? use_basis
  loop
    if (v_basis ->> m.use_basis)::numeric > 0 then
      insert into public.raw_material_movements (material_id, quantity, reason, source, source_table, source_id)
      values (m.id, -round((v_basis ->> m.use_basis)::numeric * m.use_rate, 3), 'Used: ' || v_label, 'auto', p_table, p_id);
    end if;
  end loop;
end
$$;
revoke all on function app.material_usage_sync(text, uuid) from public;

create or replace function app.material_usage_trigger() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform app.material_usage_sync(tg_table_name, coalesce(new.id, old.id));
  -- A stillage's sheets changed: its passes use sheets from it.
  if tg_table_name = 'print_runs' and tg_op = 'UPDATE' then
    perform app.material_usage_sync('stillage_passes', sp.id) from public.stillage_passes sp where sp.print_run_id = new.id;
  end if;
  return null;
end
$$;

drop trigger if exists material_usage on public.print_runs;
create trigger material_usage after insert or update of sheets_printed, sheets_spoiled, base_sheets, printed or delete on public.print_runs
  for each row execute function app.material_usage_trigger();
drop trigger if exists material_usage on public.stillage_passes;
create trigger material_usage after insert or update of stage, print_run_id or delete on public.stillage_passes
  for each row execute function app.material_usage_trigger();
drop trigger if exists material_usage on public.production_entries;
create trigger material_usage after insert or update of produced_qty, reject_qty or delete on public.production_entries
  for each row execute function app.material_usage_trigger();
