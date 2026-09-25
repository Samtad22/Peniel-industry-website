-- ============================================================================
-- Wording: no em dashes in text the portal shows.
--
-- 1. The two preset hold reasons that had an em dash are reworded, and so
--    is any customer reason that was copied from them (orders, their
--    timeline, QC batches, finished stock).
-- 2. The default production line names ("Line 1 — Press A") use a middle
--    dot instead. Lines renamed by Peniel are left as they are.
--
-- Safe to run more than once.
-- ============================================================================
do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('Raw material delivery delayed — we will confirm a new date shortly.', 'Raw material delivery delayed. We will confirm a new date shortly.'),
      ('Production rescheduled — see the revised due date.', 'Production rescheduled. See the revised due date.')
    ) as t(old_text, new_text)
  loop
    if exists (select 1 from public.hold_reason_presets where text = p.new_text) then
      delete from public.hold_reason_presets where text = p.old_text;
    else
      update public.hold_reason_presets set text = p.new_text where text = p.old_text;
    end if;

    update public.orders set customer_reason = replace(customer_reason, p.old_text, p.new_text)
      where position(p.old_text in customer_reason) > 0;
    update public.order_status_events set customer_reason = replace(customer_reason, p.old_text, p.new_text)
      where position(p.old_text in customer_reason) > 0;
    update public.qc_inspections set customer_reason = replace(customer_reason, p.old_text, p.new_text)
      where position(p.old_text in customer_reason) > 0;
    update public.finished_stock set customer_reason = replace(customer_reason, p.old_text, p.new_text)
      where position(p.old_text in customer_reason) > 0;
  end loop;

  update public.production_lines set name = 'Line 1 · Press A'
    where name = 'Line 1 — Press A' and not exists (select 1 from public.production_lines where name = 'Line 1 · Press A');
  update public.production_lines set name = 'Line 2 · Press B'
    where name = 'Line 2 — Press B' and not exists (select 1 from public.production_lines where name = 'Line 2 · Press B');
end $$;
