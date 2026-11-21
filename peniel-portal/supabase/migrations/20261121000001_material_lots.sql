-- ============================================================================
-- Raw materials: part numbers, and production and expiry dates per lot
--
-- From Peniel's Daily Raw Material control and Ink finance sheets: each item
-- has a part number (e.g. UV-H1022) and every delivery a production date
-- and an expiry date ("best before").
--
--   * raw_materials.part_no: the supplier's part number (internal).
--   * raw_material_lots: one row per delivery (lot) of a material: when it
--     came in, how much (in the material's unit), its production and expiry
--     dates, the supplier's lot number and a note. Stock is used oldest
--     first, so what is on hand is taken to be the newest lots
--     (lib/material-lots.ts): Inventory shows what has expired and what
--     expires next.
--
-- Staff read; admin, warehouse and production add and correct; only admin
-- deletes; audited. Customers never read either. Deleting a material takes
-- its lots with it. Safe to run more than once.
-- ============================================================================

alter table public.raw_materials add column if not exists part_no text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'raw_materials_part_no_check') then
    alter table public.raw_materials add constraint raw_materials_part_no_check check (length(part_no) <= 40);
  end if;
end $$;
comment on column public.raw_materials.part_no is 'INTERNAL. The supplier''s part number, e.g. UV-H1022.';

create table if not exists public.raw_material_lots (
  id          uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.raw_materials (id) on delete cascade,
  received_on date,
  quantity    numeric not null check (quantity > 0 and quantity <= 1000000000),
  produced_on date,
  expires_on  date,
  lot_no      text check (length(lot_no) <= 60),
  notes       text check (length(notes) <= 300),
  entered_by  uuid references public.profiles (user_id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (expires_on is null or produced_on is null or expires_on >= produced_on)
);
create index if not exists raw_material_lots_material_idx on public.raw_material_lots (material_id, received_on);
create index if not exists raw_material_lots_expiry_idx on public.raw_material_lots (expires_on);
comment on table public.raw_material_lots is 'INTERNAL. Deliveries (lots) of a raw material: quantity received, production and expiry dates. Stock is used oldest first.';

create or replace function app.raw_material_lots_clean() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.lot_no := nullif(btrim(new.lot_no), '');
  new.notes := nullif(btrim(new.notes), '');
  return new;
end
$$;
drop trigger if exists clean on public.raw_material_lots;
create trigger clean before insert or update on public.raw_material_lots
  for each row execute function app.raw_material_lots_clean();

alter table public.raw_material_lots enable row level security;
revoke all on public.raw_material_lots from anon;
revoke all on public.raw_material_lots from authenticated;
grant select, insert, update, delete on public.raw_material_lots to authenticated;
drop policy if exists staff_read on public.raw_material_lots;
create policy staff_read on public.raw_material_lots for select to authenticated using (app.is_staff());
drop policy if exists lots_write on public.raw_material_lots;
create policy lots_write on public.raw_material_lots for all to authenticated
  using (app.has_role('admin', 'warehouse', 'production'))
  with check (app.has_role('admin', 'warehouse', 'production'));
drop policy if exists admin_only_delete on public.raw_material_lots;
create policy admin_only_delete on public.raw_material_lots as restrictive for delete to authenticated using (app.has_role('admin'));

drop trigger if exists audit on public.raw_material_lots;
create trigger audit after insert or update or delete on public.raw_material_lots
  for each row execute function app.audit_row();
drop trigger if exists touch_updated_at on public.raw_material_lots;
create trigger touch_updated_at before update on public.raw_material_lots
  for each row execute function app.touch_updated_at();
