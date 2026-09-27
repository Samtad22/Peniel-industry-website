-- ============================================================================
-- Orders: a "cancelled" status (1 of 2)
--
-- A new order status must be committed before anything uses it, so it has
-- its own file. Run this first, then 20261017000002_customer_cancel.sql.
-- Safe to run more than once.
-- ============================================================================

alter type public.order_status add value if not exists 'cancelled';
