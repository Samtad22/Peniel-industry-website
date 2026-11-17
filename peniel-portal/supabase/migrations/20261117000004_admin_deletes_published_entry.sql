-- ============================================================================
-- Admin deletes a production entry, published or not
--
-- A published production entry stays frozen against changes (unpublish it to
-- correct it), but admin can now delete it in one step, e.g. when it was
-- entered by mistake: the customer's output for that day goes down by it.
-- Before, it had to be unpublished first. Only admin deletes production
-- entries (the restrictive policy of 20261018000001); the deletion is in
-- the activity log as before.
-- Safe to run more than once.
-- ============================================================================

create or replace function app.guard_published_entry()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.published and not app.has_role('admin') then
      raise exception 'Unpublish this entry before deleting it' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if old.published and new.published and (
       new.produced_qty <> old.produced_qty or new.reject_qty <> old.reject_qty
    or new.order_id <> old.order_id or new.entry_date <> old.entry_date
    or new.shift <> old.shift or new.line_id <> old.line_id
  ) then
    raise exception 'Unpublish this entry before changing it' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
