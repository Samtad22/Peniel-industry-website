-- ============================================================================
-- Customers can cancel their own order while Peniel hasn't confirmed it (2 of 2)
--
-- customer_cancel_order(order, reason): only the customer's own company,
-- only while the order is still "submitted". The order becomes "cancelled"
-- (final, like "rejected"); the timeline and the audit log record it.
-- Staff don't cancel orders; they reject a new or confirmed one, as before.
-- Run after 20261017000001_order_cancelled.sql. Safe to run more than once.
-- ============================================================================

-- Allowed status moves: "cancelled" only from "submitted", and it is final.
create or replace function app.check_order_transition()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status::text = 'submitted' then
    raise exception 'An order cannot go back to Submitted' using errcode = 'check_violation';
  end if;
  if old.status::text = 'rejected' then
    raise exception 'A rejected order cannot be reopened; ask the customer to submit it again'
      using errcode = 'check_violation';
  end if;
  if old.status::text = 'cancelled' then
    raise exception 'A cancelled order cannot be reopened; the customer can submit it again'
      using errcode = 'check_violation';
  end if;
  if new.status::text = 'cancelled' and old.status::text <> 'submitted' then
    raise exception 'Only an order Peniel has not confirmed yet can be cancelled' using errcode = 'check_violation';
  end if;
  if new.status::text = 'rejected' and old.status::text not in ('submitted', 'confirmed') then
    raise exception 'Only new or confirmed orders can be rejected; put it on hold instead'
      using errcode = 'check_violation';
  end if;
  if new.status::text not in ('rejected', 'cancelled') and new.confirmed_due_date is null then
    raise exception 'Set a due date when confirming the order' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

-- The customer cancels their own order, as themselves (the timeline shows who).
create or replace function public.customer_cancel_order(p_order_id uuid, p_reason text default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if app.is_staff() or app.my_company_id() is null then
    raise exception 'Only the customer can cancel their order here' using errcode = '42501';
  end if;
  select o.status::text into v_status from public.orders o
  where o.id = p_order_id and o.company_id = app.my_company_id()
  for update;
  if not found then
    raise exception 'Order not found' using errcode = '42501';
  end if;
  if v_status <> 'submitted' then
    raise exception 'Peniel has already confirmed this order: send us a message to change or cancel it.' using errcode = '23514';
  end if;
  update public.orders
  set status = 'cancelled',
      customer_reason = coalesce(nullif(btrim(left(p_reason, 500)), ''), 'Cancelled by the customer before Peniel confirmed it.')
  where id = p_order_id;
end
$$;
revoke all on function public.customer_cancel_order(uuid, text) from public, anon;
grant execute on function public.customer_cancel_order(uuid, text) to authenticated;
