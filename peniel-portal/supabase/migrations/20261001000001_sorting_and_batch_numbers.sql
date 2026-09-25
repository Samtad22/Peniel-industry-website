-- ============================================================================
-- Sorting of held batches, and batch numbers per order
--
-- 1. Batch numbers restart per brand at Peniel (Meta batch 015 and Dashen
--    batch 015 both exist), so a batch number only has to be unique within
--    its order, not across the whole portal.
-- 2. sorting_records: the daily "on hold products for sorting" report. Each
--    row is one batch sorted on one day: cartons sorted and cartons of waste
--    (1 carton = 10,000 crowns), and who reported it. INTERNAL ONLY: no
--    customer view reads this table; customers keep seeing the batch as on
--    hold, then released.
--
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Batch number unique per order
-- ---------------------------------------------------------------------------
alter table public.qc_inspections drop constraint if exists qc_inspections_batch_no_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'qc_inspections_order_batch_key') then
    alter table public.qc_inspections
      add constraint qc_inspections_order_batch_key unique (order_id, batch_no);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Sorting records (internal)
-- ---------------------------------------------------------------------------
create table if not exists public.sorting_records (
  id             uuid primary key default gen_random_uuid(),
  inspection_id  uuid not null references public.qc_inspections (id) on delete cascade,
  sorted_on      date not null default (now() at time zone 'Africa/Addis_Ababa')::date,
  sorted_cartons int not null check (sorted_cartons >= 0 and sorted_cartons <= 100000),
  waste_cartons  int not null default 0 check (waste_cartons >= 0 and waste_cartons <= 100000),
  reported_by    text check (length(reported_by) <= 100),   -- who sent the report, e.g. the sorting supervisor
  notes          text check (length(notes) <= 1000),
  entered_by     uuid references public.profiles (user_id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint sorting_records_something check (sorted_cartons + waste_cartons > 0)
);
create index if not exists sorting_records_inspection_idx on public.sorting_records (inspection_id, sorted_on);
create index if not exists sorting_records_date_idx on public.sorting_records (sorted_on desc);

alter table public.sorting_records enable row level security;
revoke all on public.sorting_records from anon;
revoke all on public.sorting_records from authenticated;
grant select, insert, update, delete on public.sorting_records to authenticated;

-- Staff read; admin and quality write. Customers: no policy, so nothing.
drop policy if exists staff_read on public.sorting_records;
create policy staff_read on public.sorting_records for select to authenticated
  using (app.is_staff());
drop policy if exists quality_insert on public.sorting_records;
create policy quality_insert on public.sorting_records for insert to authenticated
  with check (app.has_role('admin', 'quality'));
drop policy if exists quality_update on public.sorting_records;
create policy quality_update on public.sorting_records for update to authenticated
  using (app.has_role('admin', 'quality')) with check (app.has_role('admin', 'quality'));
drop policy if exists quality_delete on public.sorting_records;
create policy quality_delete on public.sorting_records for delete to authenticated
  using (app.has_role('admin', 'quality'));

drop trigger if exists audit on public.sorting_records;
create trigger audit after insert or update or delete on public.sorting_records
  for each row execute function app.audit_row();

drop trigger if exists touch_updated_at on public.sorting_records;
create trigger touch_updated_at before update on public.sorting_records
  for each row execute function app.touch_updated_at();
