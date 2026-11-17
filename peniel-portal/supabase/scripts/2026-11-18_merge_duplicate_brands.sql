-- ============================================================================
-- One-off: merge duplicate brands (one Sprite, one Coca, ...)
--
-- The same brand can be on the list twice, under two customers (e.g. Sprite
-- under a "Coca-Cola" customer added by hand and again under East Africa
-- Bottling S.C., added when the Order and Delivery sheet was loaded). Peniel
-- makes one Sprite, so each brand should be there once.
--
-- For each brand name that is on the list (active) more than once (names
-- compared without case, spaces or punctuation; "Coca-Cola" = "Coca"):
--   * The one kept: the brand with the most orders (the real POs), then
--     the most stillages and ink rates, then the oldest.
--   * Moved to it from the others: printed stillages, sample sheets,
--     artwork versions, proofs, the artwork library, and grams of ink per
--     sheet (where it has none for that ink). Orders, finished stock,
--     documents and artwork submissions move too when the two brands are
--     under the same customer; under another customer they stay where they
--     are and are listed below (there should be none after the test orders
--     were cleaned up).
--   * Colours, crown image and finish are copied over when the one kept has
--     none.
--   * The others are taken off the list (active = false), not deleted: their
--     history stays in the activity log.
-- Then a customer left with no active brand, no orders and no customer
-- users is taken off the list too.
--
-- The result lists what was done. Running it again changes nothing more.
-- ============================================================================

drop table if exists merge_report;
create temp table merge_report (step int generated always as identity, action text, detail text);

do $$
declare
  g record;
  d record;
  v_keep uuid;
  v_keep_company uuid;
  v_left text;
begin
  for g in
    with b as (
      select b.id, b.company_id, b.name, b.created_at,
             case regexp_replace(lower(b.name), '[^a-z0-9]', '', 'g') when 'cocacola' then 'coca' else regexp_replace(lower(b.name), '[^a-z0-9]', '', 'g') end as k
      from public.brands b where b.active
    )
    select k, array_agg(id) as ids from b group by k having count(*) > 1
  loop
    -- The one kept.
    select b.id, b.company_id into v_keep, v_keep_company
    from public.brands b
    where b.id = any (g.ids)
    order by (select count(*) from public.orders o where o.brand_id = b.id and o.status not in ('cancelled', 'rejected')) desc,
             (select count(*) from public.print_runs r where r.brand_id = b.id) + (select count(*) from public.brand_ink_rates r where r.brand_id = b.id) desc,
             b.created_at, b.id
    limit 1;

    for d in
      select b.id, b.company_id, b.name, c.name as company
      from public.brands b join public.companies c on c.id = b.company_id
      where b.id = any (g.ids) and b.id <> v_keep
    loop
      update public.print_runs set brand_id = v_keep where brand_id = d.id;
      update public.sample_sheets set brand_id = v_keep where brand_id = d.id;
      update public.artwork_versions set brand_id = v_keep where brand_id = d.id;
      update public.proofs set brand_id = v_keep where brand_id = d.id;
      update public.brand_artwork_files set brand_id = v_keep where brand_id = d.id;
      insert into public.brand_ink_rates (brand_id, material_id, g_per_sheet)
        select v_keep, r.material_id, r.g_per_sheet from public.brand_ink_rates r where r.brand_id = d.id
        on conflict (brand_id, material_id) do nothing;
      delete from public.brand_ink_rates where brand_id = d.id;

      v_left := null;
      if d.company_id = v_keep_company then
        update public.orders set brand_id = v_keep where brand_id = d.id;
        update public.finished_stock set brand_id = v_keep where brand_id = d.id;
        update public.documents set brand_id = v_keep where brand_id = d.id;
        update public.artwork_submissions set brand_id = v_keep where brand_id = d.id;
      else
        select nullif(concat_ws(', ',
                 nullif((select count(*) from public.orders where brand_id = d.id), 0) || ' orders',
                 nullif((select count(*) from public.finished_stock where brand_id = d.id), 0) || ' finished stock lines',
                 nullif((select count(*) from public.documents where brand_id = d.id), 0) || ' documents',
                 nullif((select count(*) from public.artwork_submissions where brand_id = d.id), 0) || ' artwork submissions'), '')
          into v_left;
      end if;

      -- What the one kept doesn't have yet.
      update public.brands k set
        colours = case when coalesce(cardinality(k.colours), 0) = 0 then o.colours else k.colours end,
        crown_image_path = coalesce(k.crown_image_path, o.crown_image_path),
        finish = coalesce(k.finish, o.finish)
      from public.brands o
      where k.id = v_keep and o.id = d.id;

      update public.brands set active = false where id = d.id;
      insert into merge_report (action, detail) values (
        'Merged',
        format('%s (%s) into %s (%s)%s', d.name, d.company,
               (select name from public.brands where id = v_keep), (select name from public.companies where id = v_keep_company),
               case when v_left is not null then format('. Left on the old brand, under its customer: %s', v_left) else '' end));
    end loop;
  end loop;

  -- Customers left with nothing.
  for d in
    select c.id, c.name from public.companies c
    where c.active
      and not exists (select 1 from public.brands b where b.company_id = c.id and b.active)
      and not exists (select 1 from public.orders o where o.company_id = c.id and o.status not in ('cancelled', 'rejected'))
      and not exists (select 1 from public.profiles p where p.company_id = c.id and p.active)
  loop
    update public.companies set active = false where id = d.id;
    insert into merge_report (action, detail) values ('Customer taken off the list', format('%s: no brands, orders or users left', d.name));
  end loop;

  -- Customers with users but no brands left: say so, leave them.
  for d in
    select c.name, (select count(*) from public.profiles p where p.company_id = c.id and p.active) as users from public.companies c
    where c.active and not exists (select 1 from public.brands b where b.company_id = c.id and b.active)
      and exists (select 1 from public.profiles p where p.company_id = c.id and p.active)
  loop
    insert into merge_report (action, detail) values ('Check', format('%s has %s customer user(s) but no brands left: move them to the right customer under Users', d.name, d.users));
  end loop;

  if not exists (select 1 from merge_report) then
    insert into merge_report (action, detail) values ('Nothing to do', 'No brand is on the list twice.');
  end if;
end $$;

select action, detail from merge_report order by step;
