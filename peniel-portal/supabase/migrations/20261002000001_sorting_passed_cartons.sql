-- ============================================================================
-- Sorting report: "Quantity" is the cartons that PASSED sorting; "Waste" is
-- the cartons scrapped. Cartons sorted = passed + waste.
-- (e.g. 12 cartons sorted: quantity 10 passed, waste 2 scrapped.)
--
-- Renames sorting_records.sorted_cartons to passed_cartons so the column says
-- what it holds. The numbers already entered keep their meaning.
--
-- Safe to run more than once.
-- ============================================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sorting_records' and column_name = 'sorted_cartons'
  ) then
    alter table public.sorting_records rename column sorted_cartons to passed_cartons;
  end if;
end $$;

comment on column public.sorting_records.passed_cartons is 'Cartons that passed sorting (the report''s "Quantity"). Sorted = passed + waste.';
comment on column public.sorting_records.waste_cartons is 'Cartons scrapped in sorting (the report''s "Waste").';
