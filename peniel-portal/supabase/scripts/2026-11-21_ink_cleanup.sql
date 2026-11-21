-- ============================================================================
-- One-off: inks after the 20 Nov stock count
--
-- 1. Bright Red UV-6614 is used up and replaced by Bright Red UV-H9208: the
--    brands' grams per sheet of 6614 move to H9208 (where a brand has none
--    of H9208 yet) and 6614 goes off the list.
-- 2. Inks the brands' colours made (a Pantone name, no part number) that have
--    no stock of their own (0 or below, e.g. PANTONE 2252 C at -1.51 kg):
--    Peniel mixes those colours from base inks, so they hold no stock. Any
--    below 0 are set to 0 by a stock count, and they go off the list (their
--    history stays; a brand's colour doesn't bring them back). Inks with
--    grams per sheet set for a brand stay.
-- Ends with what was done. Running it again changes nothing.
-- ============================================================================

drop table if exists ink_cleanup_report;
create temp table ink_cleanup_report (step int generated always as identity, ink text, done text);

do $$
declare
  v_old uuid;
  v_new uuid;
  v_moved int;
  m record;
begin
  select id into v_old from public.raw_materials where ink_name in ('Bright Red UV-6614', 'Red 6614') order by active desc limit 1;
  select id into v_new from public.raw_materials where ink_name = 'Bright Red UV-H9208' order by active desc limit 1;
  if v_old is not null and v_new is not null then
    insert into public.brand_ink_rates (brand_id, material_id, g_per_sheet)
    select r.brand_id, v_new, r.g_per_sheet from public.brand_ink_rates r where r.material_id = v_old
    on conflict (brand_id, material_id) do nothing;
    get diagnostics v_moved = row_count;
    delete from public.brand_ink_rates where material_id = v_old;
    if (select on_hand from public.raw_materials where id = v_old) = 0 then
      update public.raw_materials set active = false where id = v_old and active;
      if found then
        insert into ink_cleanup_report (ink, done) values ('Bright Red UV-6614', format('off the list; %s brand rate(s) moved to Bright Red UV-H9208', v_moved));
      end if;
    else
      insert into ink_cleanup_report (ink, done) values ('Bright Red UV-6614', format('%s brand rate(s) moved to UV-H9208; kept on the list (it still has stock)', v_moved));
    end if;
  end if;

  for m in
    select x.id, x.ink_name, x.unit, x.on_hand from public.raw_materials x
    where x.active and x.ink_name is not null and x.part_no is null and x.on_hand <= 0
      and not exists (select 1 from public.brand_ink_rates r where r.material_id = x.id)
    order by x.ink_name
  loop
    if m.on_hand < 0 then
      insert into public.raw_material_movements (material_id, quantity, reason)
      values (m.id, -m.on_hand, format('Stock count: set to 0 %s (was %s). A colour mixed from base inks: no stock of its own', m.unit, trim_scale(m.on_hand)));
    end if;
    update public.raw_materials set active = false where id = m.id;
    insert into ink_cleanup_report (ink, done) values (m.ink_name, case when m.on_hand < 0 then format('set to 0 (was %s %s) and off the list', trim_scale(m.on_hand), m.unit) else 'off the list' end);
  end loop;

  if not exists (select 1 from ink_cleanup_report) then
    insert into ink_cleanup_report (ink, done) values ('-', 'Nothing to do');
  end if;
end $$;

select ink, done from ink_cleanup_report order by step;
