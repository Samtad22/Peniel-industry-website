-- ============================================================================
-- Row Level Security on every base table
--
-- Staff read everything and write by role (docs/PORTAL_SPEC.md §1).
-- Customers get NO policy on any base table — apart from reading their own
-- profile row — so a direct query returns zero rows. Customers read through
-- the customer_* views and write through customer_* functions only.
-- ============================================================================

-- The anon role (not signed in) gets nothing at all.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon, public;

-- Signed-in users reach base tables only as far as the policies below allow.
grant select, insert, update, delete on all tables in schema public to authenticated;
-- The audit trail is append-only and written by triggers.
revoke insert, update, delete on public.audit_log from authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'brands', 'profiles', 'orders', 'order_status_events',
    'order_attachments', 'production_lines', 'production_entries',
    'defect_types', 'qc_inspections', 'qc_defects', 'raw_materials',
    'raw_material_movements', 'finished_stock', 'pickup_bookings',
    'pickup_booking_items', 'artwork_versions', 'proofs', 'documents',
    'message_threads', 'messages', 'hold_reason_presets', 'audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Staff: read all operational tables
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'brands', 'orders', 'order_status_events', 'order_attachments',
    'production_lines', 'production_entries', 'defect_types', 'qc_inspections',
    'qc_defects', 'raw_materials', 'raw_material_movements', 'finished_stock',
    'pickup_bookings', 'pickup_booking_items', 'artwork_versions', 'proofs',
    'documents', 'message_threads', 'messages', 'hold_reason_presets'
  ] loop
    execute format(
      'create policy staff_read on public.%I for select to authenticated using (app.is_staff())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Staff: write by role. admin can write everything.
-- ---------------------------------------------------------------------------
do $$
declare
  rule record;
begin
  for rule in
    select * from (values
      ('companies',              array['admin']),
      ('brands',                 array['admin', 'sales']),
      ('orders',                 array['admin', 'sales']),
      ('order_status_events',    array['admin', 'sales']),
      ('order_attachments',      array['admin', 'sales']),
      ('production_lines',       array['admin', 'production']),
      ('production_entries',     array['admin', 'production']),
      ('defect_types',           array['admin', 'quality']),
      ('qc_inspections',         array['admin', 'quality']),
      ('qc_defects',             array['admin', 'quality']),
      ('raw_materials',          array['admin', 'warehouse', 'production']),
      ('raw_material_movements', array['admin', 'warehouse', 'production']),
      ('finished_stock',         array['admin', 'warehouse', 'quality']),
      ('pickup_bookings',        array['admin', 'warehouse', 'sales']),
      ('pickup_booking_items',   array['admin', 'warehouse', 'sales']),
      ('artwork_versions',       array['admin', 'sales']),
      ('proofs',                 array['admin', 'sales']),
      ('documents',              array['admin', 'sales']),
      ('message_threads',        array['admin', 'sales', 'production', 'quality', 'warehouse']),
      ('messages',               array['admin', 'sales', 'production', 'quality', 'warehouse']),
      ('hold_reason_presets',    array['admin'])
    ) as r (tbl, roles)
  loop
    execute format(
      'create policy staff_write on public.%I for all to authenticated
         using (app.has_role(variadic %L::public.user_role[]))
         with check (app.has_role(variadic %L::public.user_role[]))',
      rule.tbl, rule.roles, rule.roles);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles: everyone reads their own row (to learn their role/company);
-- staff read all; only admins change them.
-- ---------------------------------------------------------------------------
create policy own_profile on public.profiles for select to authenticated
  using (user_id = auth.uid());
create policy staff_read on public.profiles for select to authenticated
  using (app.is_staff());
create policy admin_write on public.profiles for all to authenticated
  using (app.has_role('admin')) with check (app.has_role('admin'));

-- ---------------------------------------------------------------------------
-- Audit log: admins only
-- ---------------------------------------------------------------------------
create policy admin_read on public.audit_log for select to authenticated
  using (app.has_role('admin'));

-- ---------------------------------------------------------------------------
-- Nothing in the unexposed `app` schema is directly readable
-- ---------------------------------------------------------------------------
revoke all on all tables in schema app from public, anon, authenticated;
