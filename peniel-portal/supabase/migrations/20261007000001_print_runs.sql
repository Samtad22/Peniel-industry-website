-- ============================================================================
-- Printed sheets production (coat & print line)
--
-- Before the presses stamp crowns, tinplate sheets are coated, lacquered and
-- printed with the brand's colours. print_runs records each run: which order
-- (and so brand) the sheets are for, the colours printed, good and spoiled
-- sheets, how many crowns one sheet yields, and the coating, lacquer, oven
-- temperature and tinplate coil or lot.
--
-- INTERNAL ONLY: no customer view reads this table. Staff read; production
-- and admin write. Every change goes to the audit log.
--
-- Safe to run more than once.
-- ============================================================================

create table if not exists public.print_runs (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  run_date         date not null default (now() at time zone 'Africa/Addis_Ababa')::date,
  shift            text not null check (shift in ('A', 'B', 'C')),
  colours          text[] not null default '{}' check (cardinality(colours) <= 8),
  sheets_printed   int not null check (sheets_printed >= 0 and sheets_printed <= 1000000),
  sheets_spoiled   int not null default 0 check (sheets_spoiled >= 0 and sheets_spoiled <= 1000000),
  crowns_per_sheet int not null check (crowns_per_sheet between 1 and 2000),
  coating          text check (length(coating) <= 100),
  lacquer          text check (length(lacquer) <= 100),
  oven_temp_c      numeric(5, 1) check (oven_temp_c between 0 and 400),
  coil_lot         text check (length(coil_lot) <= 60),
  notes            text check (length(notes) <= 1000),
  entered_by       uuid references public.profiles (user_id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint print_runs_something check (sheets_printed + sheets_spoiled > 0)
);
create index if not exists print_runs_order_idx on public.print_runs (order_id, run_date);
create index if not exists print_runs_date_idx on public.print_runs (run_date desc);

comment on table public.print_runs is
  'INTERNAL. Coat & print line runs: sheets printed (good) and spoiled per order, shift and day, with colours, coating, lacquer, oven temperature and coil lot. Good sheets x crowns_per_sheet = crowns the sheets will yield. No customer view reads this table.';
comment on column public.print_runs.sheets_printed is 'Good printed sheets, sent on to the presses.';
comment on column public.print_runs.sheets_spoiled is 'Sheets spoiled or rejected on the coat & print line.';

alter table public.print_runs enable row level security;
revoke all on public.print_runs from anon;
revoke all on public.print_runs from authenticated;
grant select, insert, update, delete on public.print_runs to authenticated;

-- Staff read; admin and production write. Customers: no policy, so nothing.
drop policy if exists staff_read on public.print_runs;
create policy staff_read on public.print_runs for select to authenticated
  using (app.is_staff());
drop policy if exists production_write on public.print_runs;
create policy production_write on public.print_runs for all to authenticated
  using (app.has_role('admin', 'production')) with check (app.has_role('admin', 'production'));

drop trigger if exists audit on public.print_runs;
create trigger audit after insert or update or delete on public.print_runs
  for each row execute function app.audit_row();

drop trigger if exists touch_updated_at on public.print_runs;
create trigger touch_updated_at before update on public.print_runs
  for each row execute function app.touch_updated_at();
