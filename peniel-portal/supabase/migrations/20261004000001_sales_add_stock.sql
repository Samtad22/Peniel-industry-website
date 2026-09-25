-- ============================================================================
-- Ready for pickup puts the crowns into stock
--
-- Sales (and admin) set an order to "Ready for pickup". The same step now
-- records the finished stock the customer books a pickup from, so Sales may
-- ADD finished stock. Editing, holding and removing stock stay with admin,
-- warehouse and quality.
--
-- Safe to run more than once.
-- ============================================================================
drop policy if exists sales_add_stock on public.finished_stock;
create policy sales_add_stock on public.finished_stock for insert to authenticated
  with check (app.has_role('sales'));
