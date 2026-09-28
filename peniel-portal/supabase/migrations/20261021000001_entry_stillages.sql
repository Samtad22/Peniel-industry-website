-- ============================================================================
-- Production entries name the printed stillages they were pressed from
--
-- After "To the press", a finished stillage is at a press until its sheets
-- are all used. Each daily production entry now names the stillage(s) of the
-- order's brand it was pressed from (at least one), so every entry can be
-- traced back to its printed sheets.
--
-- 1. print_runs.used_up_at / used_up_by: the stillage's sheets are all used.
--    Until then it stays selectable in the daily entry, shift after shift.
-- 2. production_entry_stillages: entry <-> stillage (internal, staff only).
--    A stillage must be at a press and of the order's brand.
-- 3. log_production_entry(): saves an entry, its stillages and any stillages
--    used up, in one go, with the caller's rights (RLS applies).
-- 4. A stillage that fed production can't be taken back from the press.
-- Customers never read any of it. Safe to run more than once.
-- ============================================================================

alter table public.print_runs add column if not exists used_up_at timestamptz;
alter table public.print_runs add column if not exists used_up_by uuid references public.profiles (user_id) on delete set null;
comment on column public.print_runs.used_up_at is 'When the stillage''s sheets were all used at the press (empty = still at the press, selectable in the daily entry).';

-- Used up only once it is at a press; back from the press clears it.
create or replace function app.print_runs_used_up() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.used_up_at is not null and new.to_press_at is null then
    raise exception 'Only a stillage at a press can be used up (stillage_not_at_press).' using errcode = '23514';
  end if;
  if new.used_up_at is null then
    new.used_up_by := null;
  elsif old.used_up_at is null then
    new.used_up_by := coalesce(new.used_up_by, auth.uid());
  end if;
  -- Taken back from the press after it fed production: not allowed.
  if new.to_press_at is null and old.to_press_at is not null
     and exists (select 1 from public.production_entry_stillages l where l.print_run_id = new.id) then
    raise exception 'This stillage was used in production entries, so it can''t go back to stock (stillage_in_production).' using errcode = '23514';
  end if;
  return new;
end
$$;

create table if not exists public.production_entry_stillages (
  entry_id     uuid not null references public.production_entries (id) on delete cascade,
  print_run_id uuid not null references public.print_runs (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (entry_id, print_run_id)
);
create index if not exists production_entry_stillages_run_idx on public.production_entry_stillages (print_run_id);
comment on table public.production_entry_stillages is 'Which printed stillages a production entry was pressed from (internal).';

drop trigger if exists used_up on public.print_runs;
create trigger used_up before update on public.print_runs
  for each row execute function app.print_runs_used_up();

-- A link must point at a stillage at a press, of the order's brand.
create or replace function app.entry_stillage_check() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_run record;
  v_brand uuid;
begin
  select to_press_at, brand_id, stillage_no into v_run from public.print_runs where id = new.print_run_id;
  select o.brand_id into v_brand
  from public.production_entries e join public.orders o on o.id = e.order_id
  where e.id = new.entry_id;
  if v_run.to_press_at is null then
    raise exception 'Stillage % hasn''t gone to a press (stillage_not_at_press).', coalesce(v_run.stillage_no, '') using errcode = '23514';
  end if;
  if v_run.brand_id is distinct from v_brand then
    raise exception 'Stillage % is a different brand from the order (stillage_wrong_brand).', coalesce(v_run.stillage_no, '') using errcode = '23514';
  end if;
  return new;
end
$$;
drop trigger if exists check_link on public.production_entry_stillages;
create trigger check_link before insert or update on public.production_entry_stillages
  for each row execute function app.entry_stillage_check();

alter table public.production_entry_stillages enable row level security;
revoke all on public.production_entry_stillages from anon;
revoke all on public.production_entry_stillages from authenticated;
grant select, insert, delete on public.production_entry_stillages to authenticated;

drop policy if exists staff_read on public.production_entry_stillages;
create policy staff_read on public.production_entry_stillages for select to authenticated using (app.is_staff());
drop policy if exists production_write on public.production_entry_stillages;
create policy production_write on public.production_entry_stillages for insert to authenticated
  with check (app.has_role('admin', 'production'));
drop policy if exists admin_delete on public.production_entry_stillages;
create policy admin_delete on public.production_entry_stillages for delete to authenticated
  using (app.has_role('admin'));

-- One entry, its stillages and the ones used up, saved together.
create or replace function public.log_production_entry(
  p_entry_date date,
  p_shift text,
  p_line_id uuid,
  p_order_id uuid,
  p_produced integer,
  p_rejects integer,
  p_stillages uuid[],
  p_used_up uuid[] default '{}'
) returns uuid
language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if coalesce(array_length(p_stillages, 1), 0) = 0 then
    raise exception 'Choose the printed stillage(s) this was pressed from (stillage_required).' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(coalesce(p_used_up, '{}')) u where not (u = any (p_stillages))) then
    raise exception 'A used-up stillage must be one of the stillages chosen (stillage_required).' using errcode = '23514';
  end if;

  insert into public.production_entries (entry_date, shift, line_id, order_id, produced_qty, reject_qty, entered_by)
  values (p_entry_date, p_shift, p_line_id, p_order_id, p_produced, p_rejects, auth.uid())
  returning id into v_id;

  insert into public.production_entry_stillages (entry_id, print_run_id)
  select v_id, s from (select distinct unnest(p_stillages) as s) x;

  if coalesce(array_length(p_used_up, 1), 0) > 0 then
    update public.print_runs set used_up_at = now()
    where id = any (p_used_up) and used_up_at is null;
  end if;
  return v_id;
end
$$;
revoke all on function public.log_production_entry(date, text, uuid, uuid, integer, integer, uuid[], uuid[]) from public, anon;
grant execute on function public.log_production_entry(date, text, uuid, uuid, integer, integer, uuid[], uuid[]) to authenticated;
