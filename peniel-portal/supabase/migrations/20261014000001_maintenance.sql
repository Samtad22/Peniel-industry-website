-- ============================================================================
-- Maintenance: the plant's machines, their status, and a maintenance log
--
-- Four sections, in process order:
--   ctp          CTP machine, its plate developer and its (small) plate oven
--   printing     the printing machine (two-unit roller) and its UV dryer
--   coating_oven the big LPG oven: white base coat, varnish and lacquer
--   press        the presses, each with two liners (liners have parent_id = the press)
--
-- machines.status: running, down (stopped / under repair), idle, on_order
-- (bought, not installed yet). Opening a log that stops a machine marks it
-- down; finishing its last open stopping log marks it running again.
--
-- maintenance_logs: one job on one machine: kind, started_at, finished_at
-- (empty = still going on), stopped_machine (counts as downtime), what was
-- done, parts, who did it, notes. Preventive services also move the machine's
-- next service date (service_every_days).
--
-- INTERNAL ONLY (machine names never reach customers, CLAUDE.md rule 2):
-- admin and production read and write; nobody else. Audited.
-- Safe to run more than once.
-- ============================================================================

create table if not exists public.machines (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique check (code ~ '^[a-z0-9-]{1,40}$'),
  name               text not null check (length(btrim(name)) between 1 and 80),
  category           text not null check (category in ('ctp', 'printing', 'coating_oven', 'press')),
  parent_id          uuid references public.machines (id) on delete set null,
  sort_order         int not null default 0,
  status             text not null default 'running' check (status in ('running', 'down', 'idle', 'on_order')),
  status_note        text check (length(status_note) <= 200),
  status_since       timestamptz not null default now(),
  service_every_days int check (service_every_days between 1 and 730),
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists machines_category_idx on public.machines (category, sort_order);

create table if not exists public.maintenance_logs (
  id              uuid primary key default gen_random_uuid(),
  machine_id      uuid not null references public.machines (id) on delete cascade,
  kind            text not null check (kind in ('breakdown', 'repair', 'preventive', 'cleaning', 'parts', 'inspection')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  stopped_machine boolean not null default false,
  description     text not null check (length(btrim(description)) between 1 and 1000),
  parts           text check (length(parts) <= 500),
  done_by         text check (length(done_by) <= 120),
  notes           text check (length(notes) <= 1000),
  entered_by      uuid references public.profiles (user_id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint maintenance_logs_finished_after_started check (finished_at is null or finished_at >= started_at)
);
create index if not exists maintenance_logs_machine_idx on public.maintenance_logs (machine_id, started_at desc);
create index if not exists maintenance_logs_open_idx on public.maintenance_logs (machine_id) where finished_at is null;

comment on table public.machines is 'INTERNAL. The plant''s machines by section (CTP, printing, coating oven, presses and liners) with their status. No customer view reads this table.';
comment on table public.maintenance_logs is 'INTERNAL. Maintenance and breakdown log per machine; finished_at empty = still going on. No customer view reads this table.';

-- A stopping job marks its machine down; finishing the last one marks it running.
-- Tidy the text a log is saved with.
create or replace function app.maintenance_tidy() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.description := btrim(new.description);
  new.parts := nullif(btrim(new.parts), '');
  new.done_by := nullif(btrim(new.done_by), '');
  new.notes := nullif(btrim(new.notes), '');
  return new;
end
$$;

create or replace function app.maintenance_machine_status() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_machine uuid := coalesce(new.machine_id, old.machine_id);
  v_open boolean;
begin
  select exists (
    select 1 from public.maintenance_logs l
    where l.machine_id = v_machine and l.stopped_machine and l.finished_at is null
  ) into v_open;
  if v_open then
    update public.machines set status = 'down', status_since = now()
    where id = v_machine and status <> 'down';
  else
    -- Only undo a "down" this log caused: idle and on-order machines stay as they are.
    update public.machines set status = 'running', status_since = now(), status_note = null
    where id = v_machine and status = 'down'
      and tg_op <> 'INSERT'
      and (old.stopped_machine and old.finished_at is null);
  end if;
  return null;
end
$$;

drop trigger if exists tidy on public.maintenance_logs;
create trigger tidy before insert or update on public.maintenance_logs
  for each row execute function app.maintenance_tidy();
drop trigger if exists machine_status on public.maintenance_logs;
create trigger machine_status after insert or update or delete on public.maintenance_logs
  for each row execute function app.maintenance_machine_status();

-- Status changes record when; a note goes with the status it explains.
create or replace function app.machines_status_since() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.name := btrim(new.name);
  new.status_note := nullif(btrim(new.status_note), '');
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_since := now();
  end if;
  return new;
end
$$;
drop trigger if exists status_since on public.machines;
create trigger status_since before insert or update on public.machines
  for each row execute function app.machines_status_since();

-- ---------------------------------------------------------------------------
-- Access: admin and production only
-- ---------------------------------------------------------------------------
alter table public.machines enable row level security;
alter table public.maintenance_logs enable row level security;
revoke all on public.machines, public.maintenance_logs from anon;
revoke all on public.machines, public.maintenance_logs from authenticated;
grant select, insert, update, delete on public.machines, public.maintenance_logs to authenticated;

drop policy if exists plant_read on public.machines;
create policy plant_read on public.machines for select to authenticated using (app.has_role('admin', 'production'));
drop policy if exists plant_status on public.machines;
create policy plant_status on public.machines for update to authenticated
  using (app.has_role('admin', 'production')) with check (app.has_role('admin', 'production'));
drop policy if exists admin_add on public.machines;
create policy admin_add on public.machines for insert to authenticated with check (app.has_role('admin'));
drop policy if exists admin_remove on public.machines;
create policy admin_remove on public.machines for delete to authenticated using (app.has_role('admin'));

drop policy if exists plant_all on public.maintenance_logs;
create policy plant_all on public.maintenance_logs for all to authenticated
  using (app.has_role('admin', 'production')) with check (app.has_role('admin', 'production'));

drop trigger if exists audit on public.machines;
create trigger audit after insert or update or delete on public.machines
  for each row execute function app.audit_row();
drop trigger if exists audit on public.maintenance_logs;
create trigger audit after insert or update or delete on public.maintenance_logs
  for each row execute function app.audit_row();
drop trigger if exists touch_updated_at on public.machines;
create trigger touch_updated_at before update on public.machines
  for each row execute function app.touch_updated_at();
drop trigger if exists touch_updated_at on public.maintenance_logs;
create trigger touch_updated_at before update on public.maintenance_logs
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Peniel's machines (added once; later edits in the portal are kept)
-- ---------------------------------------------------------------------------
insert into public.machines (code, name, category, sort_order, status, status_note) values
  ('ctp',          'CTP machine',                          'ctp',          10, 'running',  null),
  ('ctp-developer','Plate developer',                      'ctp',          20, 'running',  null),
  ('ctp-oven',     'Plate oven',                           'ctp',          30, 'running',  null),
  ('printer',      'Printing machine (two-unit roller)',   'printing',     10, 'running',  null),
  ('uv-dryer',     'UV dryer',                             'printing',     20, 'running',  null),
  ('coating-oven', 'Coating oven (LPG): white base, varnish, lacquer', 'coating_oven', 10, 'running', null),
  ('press-1',      'Press 1',                              'press',        10, 'running',  null),
  ('press-2',      'Press 2',                              'press',        20, 'down',     'Under repair'),
  ('press-3',      'Press 3',                              'press',        30, 'on_order', 'On the way, not installed yet')
on conflict (code) do nothing;

insert into public.machines (code, name, category, parent_id, sort_order, status, status_note)
select v.code, v.name, 'press', p.id, v.sort_order, v.status, v.note
from (values
  ('liner-1a', 'Liner 1A', 'press-1', 11, 'running',  null),
  ('liner-1b', 'Liner 1B', 'press-1', 12, 'running',  null),
  ('liner-2a', 'Liner 2A', 'press-2', 21, 'idle',     'Press 2 is under repair'),
  ('liner-2b', 'Liner 2B', 'press-2', 22, 'idle',     'Press 2 is under repair'),
  ('liner-3a', 'Liner 3A', 'press-3', 31, 'on_order', 'On the way, not installed yet'),
  ('liner-3b', 'Liner 3B', 'press-3', 32, 'on_order', 'On the way, not installed yet')
) as v(code, name, parent, sort_order, status, note)
join public.machines p on p.code = v.parent
on conflict (code) do nothing;
