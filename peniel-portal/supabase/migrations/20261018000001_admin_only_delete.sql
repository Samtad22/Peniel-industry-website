-- ============================================================================
-- Only admin deletes log entries
--
-- Staff who record the plant's logs can still add and correct them, but only
-- an admin can delete an entry (production entries, inspections, sorting,
-- stillages and their oven passes, maintenance jobs, artwork library files).
-- A restrictive policy is ANDed with the existing ones, so nothing else about
-- who reads or writes changes. Automatic clean-ups done by the database itself
-- (cascades, triggers) are unaffected.
-- Safe to run more than once.
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'production_entries', 'qc_inspections', 'sorting_records', 'print_runs',
    'stillage_passes', 'maintenance_logs', 'brand_artwork_files'
  ] loop
    execute format('drop policy if exists admin_only_delete on public.%I', t);
    execute format(
      'create policy admin_only_delete on public.%I as restrictive for delete to authenticated using (app.has_role(''admin''))', t);
  end loop;
end $$;

-- The artwork library's stored files: only admin removes them too.
drop policy if exists "portal: artwork library admin delete" on storage.objects;
create policy "portal: artwork library admin delete" on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'artwork-library' or app.has_role('admin'));
