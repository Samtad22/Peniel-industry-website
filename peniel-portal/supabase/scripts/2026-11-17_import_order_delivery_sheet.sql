-- ============================================================================
-- One-off, LIVE project: the real POs and deliveries, from Peniel's
-- "Order and Delivery" sheet (17 Nov 2026)
--
-- Run ONCE in the Supabase SQL Editor, AFTER the cleanup of the test orders
-- (2026-11-17_cleanup_test_orders.sql) and after migration
-- 20261117000007_order_deliveries.sql. Safe to run again: what is already
-- there is not added twice.
--
-- * Customers are found by name (Habesha..., BGI..., Dashen..., East...,
--   Heineken...); a missing one is added. Brands are found by name within the
--   customer; a missing one is added (26mm, PVC-free: edit it in Customers).
-- * One order per brand on each PO, in crowns, due 31 Dec 2026 (the sheet has
--   no due dates: change them on each order). Status: Delivered when all is
--   delivered, In production when part is, else Confirmed.
-- * Every DO of the sheet as a delivery (cartons x 10,000). "RE" lines are
--   return exchanges: listed, not counted again.
-- * Dates the sheet had with day and month swapped (Excel read 9/4 as 4 Sep)
--   are corrected from the DO order: e.g. DO 1661 is 9 Apr, DO 1669 7 May.
-- * BGI's first 500 cartons have no date or DO on the sheet: DO 1679 of
--   10 Jun 2026 (from Peniel). A copy imported before without them (or with
--   DO 1682) is corrected here, not added twice.
-- * Heineken: PO 00019449 (150,000,000: Heineken 6M, Sofi 10M, Bedele Special
--   4M, Harar 130M) and the new PO PO00020672 (Heineken 3,080,000). Heineken
--   deliveries fill the original PO first (DO 33 is split: 920,000 on it,
--   440,000 on the new one), then the new PO.
-- * Prices and payments are left out.
--
-- The result at the end lists every PO line: ordered, delivered, remaining.
-- ============================================================================

create temp table if not exists po_orders (ord int generated always as identity, key text, pattern text, company_name text, code text, po text, brand text, quantity bigint, status text);
create temp table if not exists po_deliveries (po text, brand text, kind text, do_no text, delivered_on date, quantity bigint, notes text);
create temp table if not exists po_report (customer text, po text, brand text, order_no text, ordered bigint, delivered bigint, remaining bigint, status text, note text);
truncate po_orders restart identity; truncate po_deliveries; truncate po_report;

do $$
begin
  insert into po_orders (key, pattern, company_name, code, po, brand, quantity, status) values
    ('habesha', '^habesha', 'Habesha Breweries S.C.', 'HAB', '4800182900', 'Habesha', 70390000, 'in_production'),
    ('habesha', '^habesha', 'Habesha Breweries S.C.', 'HAB', '4800182900', 'Negus', 38000000, 'in_production'),
    ('habesha', '^habesha', 'Habesha Breweries S.C.', 'HAB', '4800182900', 'Kidame', 33380000, 'in_production'),
    ('habesha', '^habesha', 'Habesha Breweries S.C.', 'HAB', '4800182900', 'Feta', 59300000, 'in_production'),
    ('habesha', '^habesha', 'Habesha Breweries S.C.', 'HAB', '4800182900', 'Habesha Kostara', 7800000, 'confirmed'),
    ('bgi', '^bgi', 'BGI Ethiopia', 'BGI', '002908', 'Meta', 50000000, 'in_production'),
    ('dashen', '^dashen', 'Dashen Brewery S.C.', 'DSH', '0000000293', 'Dashen', 75000000, 'in_production'),
    ('dashen', '^dashen', 'Dashen Brewery S.C.', 'DSH', '0000000293', 'Balageru', 25000000, 'in_production'),
    ('east', '^east', 'East Africa Bottling S.C.', 'EAB', '5000146385-1', 'Coca', 44500000, 'in_production'),
    ('east', '^east', 'East Africa Bottling S.C.', 'EAB', '5000146385-1', 'Sprite', 35000000, 'in_production'),
    ('east', '^east', 'East Africa Bottling S.C.', 'EAB', '5000146385-1', 'Fanta Orange', 30000000, 'confirmed'),
    ('east', '^east', 'East Africa Bottling S.C.', 'EAB', '5000146385-1', 'Fanta Pineapple', 7000000, 'confirmed'),
    ('east', '^east', 'East Africa Bottling S.C.', 'EAB', '5000146385-1', 'Novida', 2000000, 'confirmed'),
    ('heineken', '^heineken', 'Heineken Breweries S.C.', 'HNK', '00019449', 'Heineken', 6000000, 'delivered'),
    ('heineken', '^heineken', 'Heineken Breweries S.C.', 'HNK', '00019449', 'Sofi', 10000000, 'in_production'),
    ('heineken', '^heineken', 'Heineken Breweries S.C.', 'HNK', '00019449', 'Bedele Special', 4000000, 'confirmed'),
    ('heineken', '^heineken', 'Heineken Breweries S.C.', 'HNK', '00019449', 'Harar', 130000000, 'in_production'),
    ('heineken', '^heineken', 'Heineken Breweries S.C.', 'HNK', 'PO00020672', 'Heineken', 3080000, 'in_production');
  insert into po_deliveries (po, brand, kind, do_no, delivered_on, quantity, notes) values
    ('002908', 'Meta', 'delivery', '1679', '2026-06-10'::date, 5000000, 'From the Order and Delivery sheet'),
    ('4800182900', 'Feta', 'delivery', '1629', '2026-02-14'::date, 2640000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1633', '2026-02-17'::date, 1700000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1634', '2026-02-19'::date, 1920000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1636', '2026-02-20'::date, 2000000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1640', '2026-02-28'::date, 1060000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1642', '2026-03-04'::date, 1920000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1643', '2026-03-05'::date, 1920000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1646', '2026-03-06'::date, 1920000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1647', '2026-03-07'::date, 1920000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1648', '2026-03-09'::date, 1920000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1649', '2026-03-10'::date, 1920000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1650', '2026-03-10'::date, 1920000, 'From the Order and Delivery sheet'),
    ('4800182900', 'Negus', 'delivery', '1652', '2026-03-14'::date, 3000000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1653', '2026-03-15'::date, 1920000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1654', '2026-03-16'::date, 1920000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1655', '2026-03-16'::date, 1500000, 'From the Order and Delivery sheet'),
    ('4800182900', 'Kidame', 'delivery', '1656', '2026-03-18'::date, 3000000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1657', '2026-03-23'::date, 730000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Balageru', 'delivery', '1657', '2026-03-23'::date, 1190000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Balageru', 'delivery', '1658', '2026-03-24'::date, 1500000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Balageru', 'delivery', '1659', '2026-03-25'::date, 1130000, 'From the Order and Delivery sheet'),
    ('4800182900', 'Habesha', 'delivery', '1660', '2026-03-27'::date, 2300000, 'From the Order and Delivery sheet'),
    ('4800182900', 'Feta', 'delivery', '1661', '2026-04-09'::date, 2800000, 'From the Order and Delivery sheet'),
    ('5000146385-1', 'Coca', 'delivery', '1662', '2026-04-09'::date, 1900000, 'From the Order and Delivery sheet'),
    ('4800182900', 'Negus', 'delivery', '1663', '2026-04-14'::date, 2800000, 'From the Order and Delivery sheet'),
    ('4800182900', 'Habesha', 'delivery', '1664', '2026-04-16'::date, 220000, 'From the Order and Delivery sheet'),
    ('4800182900', 'Negus', 'delivery', '1664', '2026-04-16'::date, 2680000, 'From the Order and Delivery sheet'),
    ('5000146385-1', 'Coca', 'delivery', '1665', '2026-04-20'::date, 1900000, 'From the Order and Delivery sheet'),
    ('4800182900', 'Negus', 'delivery', '1666', '2026-04-20'::date, 2900000, 'From the Order and Delivery sheet'),
    ('4800182900', 'Kidame', 'delivery', '1667', '2026-04-21'::date, 2900000, 'From the Order and Delivery sheet'),
    ('4800182900', 'Habesha', 'delivery', '1668', '2026-04-30'::date, 870000, 'From the Order and Delivery sheet'),
    ('4800182900', 'Kidame', 'delivery', '1668', '2026-04-30'::date, 2030000, 'From the Order and Delivery sheet'),
    ('4800182900', 'Habesha', 'delivery', '1669', '2026-05-07'::date, 370000, 'From the Order and Delivery sheet'),
    ('4800182900', 'Feta', 'delivery', '1669', '2026-05-07'::date, 680000, 'From the Order and Delivery sheet'),
    ('5000146385-1', 'Coca', 'delivery', '1670', '2026-05-12'::date, 1900000, 'From the Order and Delivery sheet'),
    ('5000146385-1', 'Coca', 'delivery', '1671', '2026-05-14'::date, 1900000, 'From the Order and Delivery sheet'),
    ('5000146385-1', 'Coca', 'delivery', '1672', '2026-05-18'::date, 1900000, 'From the Order and Delivery sheet'),
    ('5000146385-1', 'Coca', 'delivery', '1673', '2026-05-19'::date, 1540000, 'From the Order and Delivery sheet'),
    ('5000146385-1', 'Coca', 'delivery', '1674', '2026-05-20'::date, 1900000, 'From the Order and Delivery sheet'),
    ('5000146385-1', 'Coca', 'delivery', '1675', '2026-05-21'::date, 1900000, 'From the Order and Delivery sheet'),
    ('5000146385-1', 'Coca', 'delivery', '1676', '2026-05-25'::date, 1900000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1677', '2026-05-25'::date, 1900000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1678', '2026-05-29'::date, 1490000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Balageru', 'delivery', '1678', '2026-05-29'::date, 410000, 'From the Order and Delivery sheet'),
    ('5000146385-1', 'Coca', 'delivery', '1679', '2026-06-02'::date, 1900000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1680', '2026-06-02'::date, 1900000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1681', '2026-06-04'::date, 1900000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1682', '2026-06-05'::date, 3000000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '1683', '2026-06-12'::date, 3000000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '1684', '2026-06-13'::date, 3000000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '1685', '2026-06-15'::date, 2000000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1686', '2026-06-18'::date, 1230000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Balageru', 'delivery', '1686', '2026-06-18'::date, 670000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '1687', '2026-06-19'::date, 1900000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Balageru', 'delivery', '1688', '2026-06-24'::date, 1900000, 'From the Order and Delivery sheet'),
    ('5000146385-1', 'Coca', 'delivery', '1689', '2026-06-24'::date, 1900000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1690', '2026-06-26'::date, 1900000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '1691', '2026-06-26'::date, 2000000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1692', '2026-06-29'::date, 630000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Balageru', 'delivery', '1692', '2026-06-29'::date, 1270000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '1693', '2026-06-30'::date, 1750000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1694', '2026-07-01'::date, 1900000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '1695', '2026-07-03'::date, 3000000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '1696', '2026-07-07'::date, 2770000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1697', '2026-07-07'::date, 1900000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '1', '2026-07-13'::date, 3000000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '2', '2026-07-15'::date, 1900000, 'From the Order and Delivery sheet'),
    ('5000146385-1', 'Coca', 'delivery', '4', '2026-07-22'::date, 7560000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '5', '2026-07-23'::date, 2000000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '6', '2026-07-27'::date, 3000000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '7', '2026-07-30'::date, 3000000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '9', '2026-08-01'::date, 2800000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '11', '2026-08-03'::date, 1900000, 'From the Order and Delivery sheet'),
    ('5000146385-1', 'Coca', 'delivery', '12', '2026-08-08'::date, 7560000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '13', '2026-08-24'::date, 2800000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '14', '2026-09-02'::date, 2800000, 'From the Order and Delivery sheet'),
    ('00019449', 'Sofi', 'delivery', '15', '2026-09-02'::date, 2880000, 'From the Order and Delivery sheet'),
    ('00019449', 'Harar', 'delivery', '15', '2026-09-02'::date, 2800000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '16', '2026-09-02'::date, 2800000, 'From the Order and Delivery sheet'),
    ('00019449', 'Heineken', 'delivery', '16', '2026-09-05'::date, 600000, 'From the Order and Delivery sheet'),
    ('00019449', 'Harar', 'delivery', '16', '2026-09-05'::date, 1000000, 'From the Order and Delivery sheet'),
    ('00019449', 'Heineken', 'delivery', '20', '2026-09-08'::date, 2000000, 'From the Order and Delivery sheet'),
    ('00019449', 'Harar', 'delivery', '20', '2026-09-08'::date, 880000, 'From the Order and Delivery sheet'),
    ('00019449', 'Sofi', 'delivery', '21', '2026-09-10'::date, 1280000, 'From the Order and Delivery sheet'),
    ('00019449', 'Harar', 'delivery', '21', '2026-09-10'::date, 6000000, 'From the Order and Delivery sheet'),
    ('00019449', 'Heineken', 'delivery', '22', '2026-09-14'::date, 480000, 'From the Order and Delivery sheet'),
    ('00019449', 'Sofi', 'delivery', '22', '2026-09-14'::date, 570000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '23', '2026-09-18'::date, 1900000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '24', '2026-09-22'::date, 2640000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '25', '2026-10-06'::date, 1960000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '26', '2026-10-09'::date, 2160000, 'From the Order and Delivery sheet'),
    ('4800182900', 'Feta', 'delivery', '27', '2026-10-09'::date, 800000, 'From the Order and Delivery sheet'),
    ('002908', 'Meta', 'delivery', '28', '2026-10-09'::date, 1960000, 'From the Order and Delivery sheet'),
    ('0000000293', 'Dashen', 'delivery', '29', '2026-10-12'::date, 1770000, 'From the Order and Delivery sheet'),
    ('5000146385-1', 'Sprite', 'delivery', '1701', '2026-11-05'::date, 1680000, 'From the Order and Delivery sheet'),
    ('00019449', 'Heineken', 'delivery', '32', '2026-11-11'::date, 2000000, 'From the Order and Delivery sheet'),
    ('00019449', 'Heineken', 'delivery', '33', '2026-11-13'::date, 920000, 'From the Order and Delivery sheet'),
    ('PO00020672', 'Heineken', 'delivery', '33', '2026-11-13'::date, 440000, 'From the Order and Delivery sheet (beyond the original PO 00019449: on the new PO)'),
    ('00019449', 'Sofi', 'delivery', '33', '2026-11-13'::date, 1200000, 'From the Order and Delivery sheet'),
    ('00019449', 'Sofi', 'delivery', '33', '2026-11-13'::date, 240000, 'From the Order and Delivery sheet'),
    ('PO00020672', 'Heineken', 'delivery', '34', '2026-11-14'::date, 80000, 'From the Order and Delivery sheet (beyond the original PO 00019449: on the new PO)'),
    ('00019449', 'Sofi', 'delivery', '34', '2026-11-14'::date, 820000, 'From the Order and Delivery sheet'),
    ('4800182900', 'Habesha', 'delivery', '35', '2026-11-16'::date, 970000, 'From the Order and Delivery sheet'),
    ('4800182900', 'Negus', 'return_exchange', '35', '2026-11-16'::date, 1160000, 'From the Order and Delivery sheet (RE: returned, sorted and sent back)'),
    ('4800182900', 'Kidame', 'return_exchange', '35', '2026-11-16'::date, 720000, 'From the Order and Delivery sheet (RE: returned, sorted and sent back)');
end $$;

do $$
declare
  k record;
  l record;
  v_company uuid;
  v_brand uuid;
  v_order uuid;
  v_code text;
  v_new_company boolean;
  v_new_brand boolean;
  v_new_order boolean;
  i int;
begin
  -- BGI's first 500 cartons, imported earlier without a date or DO, or as DO 1682: DO 1679 of 10 Jun 2026.
  update public.order_deliveries d
  set do_no = '1679', delivered_on = '2026-06-10', notes = 'From the Order and Delivery sheet'
  where d.quantity = 5000000
    and d.order_id in (select o.id from public.orders o where o.po_number = '002908')
    and (
      (d.do_no is null and d.delivered_on is null and d.notes like 'From the Order and Delivery sheet: delivered before the dated DOs%')
      or (d.do_no = '1682' and d.delivered_on = '2026-06-10' and d.notes = 'From the Order and Delivery sheet')
    );

  -- Customer by customer (order numbers follow), each PO's brands as on the sheet.
  for k in select key, pattern, company_name, code from po_orders group by key, pattern, company_name, code order by company_name loop
    -- The customer: by name (on the list first), else added.
    select c.id into v_company from public.companies c where lower(c.name) ~ k.pattern order by c.active desc, c.created_at limit 1;
    v_new_company := v_company is null;
    if v_new_company then
      v_code := k.code; i := 1;
      while exists (select 1 from public.companies c where c.code = v_code) loop
        i := i + 1; v_code := k.code || i;
      end loop;
      insert into public.companies (name, code) values (k.company_name, v_code) returning id into v_company;
    end if;

    for l in select * from po_orders where key = k.key order by ord loop
      -- The brand: same name; else the one brand whose name starts with it; else added.
      select b.id into v_brand from public.brands b where b.company_id = v_company and lower(btrim(b.name)) = lower(l.brand) limit 1;
      if v_brand is null and (select count(*) from public.brands b where b.company_id = v_company and lower(b.name) like lower(l.brand) || '%') = 1 then
        select b.id into v_brand from public.brands b where b.company_id = v_company and lower(b.name) like lower(l.brand) || '%';
      end if;
      v_new_brand := v_brand is null;
      if v_new_brand then
        insert into public.brands (company_id, name) values (v_company, l.brand) returning id into v_brand;
      end if;

      -- The order: this brand on this PO; else added, then moved to its status.
      select o.id into v_order from public.orders o where o.company_id = v_company and o.brand_id = v_brand and o.po_number = l.po limit 1;
      v_new_order := v_order is null;
      if v_new_order then
        insert into public.orders (company_id, brand_id, po_number, quantity, internal_notes)
        values (v_company, v_brand, l.po, l.quantity, 'Imported from the Order and Delivery sheet (17 Nov 2026). Due date 31 Dec 2026 is a placeholder.')
        returning id into v_order;
        update public.orders set status = l.status::public.order_status, confirmed_due_date = '2026-12-31', confirmed_at = now() where id = v_order;
      end if;

      insert into public.order_deliveries (order_id, company_id, kind, do_no, delivered_on, quantity, notes)
      select v_order, v_company, d.kind, d.do_no, d.delivered_on, d.quantity, d.notes
      from po_deliveries d
      where d.po = l.po and d.brand = l.brand
        and not exists (
          select 1 from public.order_deliveries x
          where x.order_id = v_order and x.kind = d.kind and x.do_no is not distinct from d.do_no
            and x.delivered_on is not distinct from d.delivered_on and x.quantity = d.quantity
        );

      insert into po_report
      select (select c.name from public.companies c where c.id = v_company), l.po, (select b.name from public.brands b where b.id = v_brand), o.order_no,
             o.quantity, t.delivered, greatest(o.quantity - t.delivered, 0), o.status::text,
             concat_ws(', ', case when v_new_company then 'customer added' end, case when v_new_brand then 'brand added' end, case when not v_new_order then 'order was there' end)
      from public.orders o,
           lateral (select coalesce(sum(x.quantity) filter (where x.kind = 'delivery'), 0)::bigint as delivered from public.order_deliveries x where x.order_id = o.id) t
      where o.id = v_order;
      v_brand := null; v_order := null;
    end loop;
    v_company := null;
  end loop;
end $$;

select customer, po, brand, order_no, ordered, delivered, remaining, status, note from po_report order by customer, po, ordered desc;
