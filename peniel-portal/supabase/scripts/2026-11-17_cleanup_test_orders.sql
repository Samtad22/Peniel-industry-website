-- ============================================================================
-- One-off, LIVE project: remove every order made while testing the portal
--
-- Run ONCE in the Supabase SQL Editor, BEFORE the import of the real POs
-- (2026-11-17_import_order_delivery_sheet.sql). Every order in the portal
-- today is a test order: the real POs are not in yet.
--
-- Deleted, with each order: its production entries (their automatic raw
-- material use goes back on the stock), inspections and their certificates
-- and signatures, sorting reports, produced goods, deliveries, attachments
-- (the database rows; the files stay in Storage, unused), status history,
-- finished stock of the orders and the pickups left empty by that, and the
-- certificate PDFs saved for them.
-- Kept, only unlinked from the deleted orders: proofs, artwork sent by
-- customers, other documents, message conversations, printed sheets
-- (stillages) and raw material movements.
-- Kept as they are: customers, users, brands, inventory, machines, settings
-- and the activity log (which keeps a "deleted" row for each order).
-- Order numbers start again at PN-26-0001.
--
-- The result at the end shows what was removed.
-- ============================================================================

create temp table if not exists cleanup_report (what text, removed int);
truncate cleanup_report;

do $$
declare
  n int;
begin
  -- Unlink what stays.
  update public.print_runs set order_id = null where order_id is not null;
  update public.raw_material_movements set order_id = null where order_id is not null;
  update public.proofs set order_id = null where order_id is not null;
  update public.artwork_submissions set order_id = null where order_id is not null;
  update public.message_threads set order_id = null where order_id is not null;

  -- The certificate PDFs saved for the test orders; other documents are kept.
  delete from public.documents where order_id is not null and type = 'certificate_of_analysis' and file_path like '%/documents/coa/%';
  get diagnostics n = row_count; insert into cleanup_report values ('Certificate PDFs (Documents)', n);
  update public.documents set order_id = null where order_id is not null;

  -- Finished stock of the orders, and pickups left with nothing in them.
  delete from public.pickup_booking_items i using public.finished_stock s where s.id = i.stock_id and s.order_id is not null;
  delete from public.finished_stock where order_id is not null;
  get diagnostics n = row_count; insert into cleanup_report values ('Finished stock lines', n);
  delete from public.pickup_bookings b where not exists (select 1 from public.pickup_booking_items i where i.booking_id = b.id);
  get diagnostics n = row_count; insert into cleanup_report values ('Pickups', n);

  -- Production entries (unpublished first: published ones are frozen).
  update public.production_entries set published = false where published;
  delete from public.production_entries;
  get diagnostics n = row_count; insert into cleanup_report values ('Production entries', n);

  -- Inspections, with their defects, signatures and certificates.
  delete from public.qc_inspections;
  get diagnostics n = row_count; insert into cleanup_report values ('Inspections', n);

  -- The orders, with their attachments, status history, sorting, produced goods and deliveries.
  delete from public.orders;
  get diagnostics n = row_count; insert into cleanup_report values ('Orders', n);

  -- Order numbers start again.
  delete from app.order_counters;
end $$;

select what, removed from cleanup_report order by what;
