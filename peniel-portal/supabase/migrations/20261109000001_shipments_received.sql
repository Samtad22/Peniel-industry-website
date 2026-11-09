-- ============================================================================
-- Shipments received: Lianyungang Pengkuo New Material Technology Co., Ltd.
--   Invoice PK/26017   of 08 Jul 2026 (P.I. YJ/161227-499, L/C 102ILSL261390504)
--   Invoice PK/26020-1 of 20 Jul 2026 (P.I. PK/260530, L/C TF2615736589)
--   Invoice PK/26019-1 of 10 Sep 2026 (P.I. PK/260527, L/C 102ILSL261820003)
--   Invoice PK/26019-2 of 15 Sep 2026 (P.I. PK/260527, L/C 102ILSL261820003)
--
-- Liner compound in tonnes is recorded in kg (52 t = 52,000 kg). Cartons
-- and corrugated boxes are the Box (one box of 10,000 crowns).
-- Not here: the non-printed tinplate (PK/26017 line 1, 299.989 t;
-- PK/26020-1 line 2, 304.074 t). Tinplate is kept in sheets; it is added by
-- a later migration once the sheet size (kg per sheet) is confirmed.
--
-- Every invoice line is recorded as a delivery in (+) on the raw-material
-- list, on top of the stock already there (nothing is reset). Each movement
-- names its invoice and line, e.g. "Received: invoice PK/26019-1 of
-- 10 Sep 2026, line 1 (USD 3.15/kg)".
--
-- Which material each line goes to:
--   * a material already on the list under the same name (or a usual other
--     name: "Lacquer" for adhesive lacquer, "Varnish" for over print varnish,
--     "Base coat white" for white base coat...), in the same unit. A material
--     taken off the list is brought back.
--   * the same, kept in another unit but never used and with no automatic
--     usage rate (e.g. Varnish, added in litres at 0): it is kept in the
--     invoice's unit from now on.
--   * otherwise a new material with the invoice's name and unit. Adding kg
--     to a material kept in litres would be wrong, so a material with history
--     in another unit is left as it is (a NOTICE names it).
--   * UV inks are inks (raw_materials.ink_name), listed with the brand inks
--     and choosable on the print and sample forms.
--
-- Same product on two lines (CTP plate developer, printing blanket at two
-- prices): one material, one movement per line.
--
-- No reorder levels or usage rates are set: Peniel sets them in Inventory.
-- Internal only: customers read none of it. Safe to run more than once (a
-- line already recorded is skipped).
-- ============================================================================

do $$
declare
  l record;
  m record;
  v_key text;          -- the line's normalised unit
  v_reason text;
  v_name text;
  v_id uuid;
begin
  for l in
    select * from (values
      -- invoice,      date,          line, name,                                unit,   qty,  price,             ink name,                       other names (lower case, letters and digits only)
      ('PK/26017',   '08 Jul 2026',  2, 'Box',                                  'boxes', 17500, 'USD 0.80/pc',  null,                           array['box', 'boxes', 'carton', 'cartons', 'corrugatedbox', 'corrugatedboxes']),
      ('PK/26020-1', '20 Jul 2026',  1, 'PVC-free liner compound',              'kg',  52000, 'USD 2,430/t',     null,                           array['pvcfreelinercompound', 'pvcfreecompound', 'pvcfree', 'linercompound']),
      ('PK/26020-1', '20 Jul 2026',  3, 'Box',                                  'boxes', 14700, 'USD 0.90/pc',  null,                           array['box', 'boxes', 'carton', 'cartons', 'corrugatedbox', 'corrugatedboxes']),
      ('PK/26019-1', '10 Sep 2026',  1, 'White base coat',                      'kg',   2500, 'USD 3.15/kg',     null,                           array['whitebasecoat', 'basecoatwhite', 'whitebase', 'whitecoat']),
      ('PK/26019-1', '10 Sep 2026',  2, 'Transparent base coat',                'kg',   1800, 'USD 3.60/kg',     null,                           array['transparentbasecoat', 'basecoattransparent', 'transparentbase', 'clearbasecoat']),
      ('PK/26019-1', '10 Sep 2026',  3, 'Thinner',                              'kg',   1800, 'USD 2.30/kg',     null,                           array['thinner', 'thinners']),
      ('PK/26019-1', '10 Sep 2026',  4, 'Aluminium sizing',                     'kg',   1000, 'USD 4.05/kg',     null,                           array['aluminiumsizing', 'aluminumsizing', 'sizing']),
      ('PK/26019-1', '10 Sep 2026',  5, 'Ink · Opaque White UV-H4003',          'kg',    600, 'USD 5.70/kg',     'Opaque White UV-H4003',        array['uvh4003', 'h4003']),
      ('PK/26019-1', '10 Sep 2026',  6, 'Ink · Bright Red UV-H9208',            'kg',    100, 'USD 14.30/kg',    'Bright Red UV-H9208',          array['uvh9208', 'h9208']),
      ('PK/26019-1', '10 Sep 2026',  7, 'Ink · Transparent Yellow UV-H1022',    'kg',    120, 'USD 15.10/kg',    'Transparent Yellow UV-H1022',  array['uvh1022', 'h1022']),
      ('PK/26019-1', '10 Sep 2026',  8, 'Ink · White UV-4105',                  'kg',     60, 'USD 11.40/kg',    'White UV-4105',                array['uv4105']),
      ('PK/26019-1', '10 Sep 2026',  9, 'Adhesive remover UV-4011',             'kg',     60, 'USD 10.30/kg',    null,                           array['adhesiveremoveruv4011', 'adhesiveremover']),
      ('PK/26019-1', '10 Sep 2026', 10, 'Ink adjuster UV-905',                  'kg',     30, 'USD 10.00/kg',    null,                           array['inkadjusteruv905', 'inkadjuster']),
      ('PK/26019-1', '10 Sep 2026', 11, 'Fountain solution (alcohol-free)',     'L',    1000, 'USD 2.90/L',      null,                           array['fountainsolutionalcoholfree', 'anticalcificationalcoholfreefountainsolution', 'fountainsolution']),
      ('PK/26019-1', '10 Sep 2026', 12, 'Multifunctional washing water',        'L',     340, 'USD 3.95/L',      null,                           array['multifunctionalwashingwater', 'washingwater']),
      ('PK/26019-1', '10 Sep 2026', 13, 'CTP plate developer',                  'L',     700, 'USD 3.60/L',      null,                           array['ctpplatedeveloper', 'platedeveloper', 'ctpdeveloper']),
      ('PK/26019-1', '10 Sep 2026', 14, 'CTP plate developer',                  'L',     260, 'USD 4.50/L',      null,                           array['ctpplatedeveloper', 'platedeveloper', 'ctpdeveloper']),
      ('PK/26019-1', '10 Sep 2026', 15, 'Baking gum',                           'L',      30, 'USD 2.00/L',      null,                           array['bakinggum']),
      ('PK/26019-1', '10 Sep 2026', 16, 'Specific car wash water',              'L',     540, 'USD 1.65/L',      null,                           array['specificcarwashwater', 'carwashwater']),
      ('PK/26019-1', '10 Sep 2026', 17, 'Plate gum',                            'L',      50, 'USD 2.15/L',      null,                           array['plategum']),
      ('PK/26019-1', '10 Sep 2026', 18, 'Printing machine pusher',              'sets',    4, 'USD 180.00/set',  null,                           array['printingmachinepusher', 'pusher']),
      ('PK/26019-1', '10 Sep 2026', 19, 'Printing blanket',                     'pcs',    30, 'USD 123.00/pc',   null,                           array['printingblanket', 'printingblankets', 'blanket', 'blankets']),
      ('PK/26019-1', '10 Sep 2026', 20, 'Printing blanket',                     'pcs',    20, 'USD 84.00/pc',    null,                           array['printingblanket', 'printingblankets', 'blanket', 'blankets']),
      ('PK/26019-2', '15 Sep 2026',  1, 'Adhesive lacquer',                     'kg',   6000, 'USD 4.45/kg',     null,                           array['adhesivelacquer', 'lacqueradhesive', 'lacquer']),
      ('PK/26019-2', '15 Sep 2026',  2, 'Over print varnish',                   'kg',   6000, 'USD 3.30/kg',     null,                           array['overprintvarnish', 'opv', 'varnish']),
      ('PK/26019-2', '15 Sep 2026',  3, 'White base coat',                      'kg',   5000, 'USD 3.15/kg',     null,                           array['whitebasecoat', 'basecoatwhite', 'whitebase', 'whitecoat'])
    ) as t(invoice, inv_date, line, name, unit, qty, price, ink_name, aliases)
  loop
    v_reason := format('Received: invoice %s of %s, line %s (%s)', l.invoice, l.inv_date, l.line, l.price);
    continue when exists (select 1 from public.raw_material_movements mv where mv.reason = v_reason);

    v_key := case
      when lower(l.unit) = 'kg' then 'kg'
      when lower(l.unit) = 'l' then 'l'
      when lower(l.unit) in ('pcs', 'boxes') then 'pcs'
      else lower(l.unit) end;

    -- Candidates: inks by their code, other materials by name. Prefer the
    -- same unit, then on the list, then the invoice's own name, then the
    -- earlier name in the list of other names.
    select x.id, x.name, x.unit, x.same_unit, x.untouched into m
    from (
      select rm.id, rm.name, rm.unit, rm.active,
        case
          when regexp_replace(lower(rm.unit), '[^a-z]', '', 'g') in ('kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms') then 'kg'
          when regexp_replace(lower(rm.unit), '[^a-z]', '', 'g') in ('l', 'lt', 'lts', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters') then 'l'
          when regexp_replace(lower(rm.unit), '[^a-z]', '', 'g') in ('pc', 'pcs', 'piece', 'pieces', 'box', 'boxes', 'carton', 'cartons') then 'pcs'
          when regexp_replace(lower(rm.unit), '[^a-z]', '', 'g') in ('set', 'sets') then 'sets'
          else lower(rm.unit) end = v_key as same_unit,
        (rm.use_rate is null or rm.use_rate = 0)
          and not exists (select 1 from public.raw_material_movements mv where mv.material_id = rm.id) as untouched,
        case
          when l.ink_name is not null then 0
          when lower(rm.name) = lower(l.name) then 0
          else array_position(l.aliases, regexp_replace(lower(rm.name), '[^a-z0-9]', '', 'g')) end as rank
      from public.raw_materials rm
      where case
        when l.ink_name is not null then rm.ink_name is not null and exists (
          select 1 from unnest(l.aliases) a
          where position(a in regexp_replace(lower(rm.ink_name), '[^a-z0-9]', '', 'g')) > 0)
        else rm.ink_name is null and (
          lower(rm.name) = lower(l.name)
          or regexp_replace(lower(rm.name), '[^a-z0-9]', '', 'g') = any (l.aliases))
        end
    ) x
    where x.same_unit or x.untouched
    order by x.same_unit desc, x.active desc, x.rank nulls last, x.name
    limit 1;

    if found then
      v_id := m.id;
      update public.raw_materials
      set active = true,
          unit = case when m.same_unit then unit else l.unit end
      where id = v_id;
      if not m.same_unit then
        raise notice '% was kept in % and never used: now kept in %.', m.name, m.unit, l.unit;
      end if;
    else
      -- A new material. If its name is taken by one in another unit, add the unit.
      v_name := l.name;
      if exists (select 1 from public.raw_materials rm where lower(rm.name) = lower(v_name)) then
        v_name := l.name || ' (' || l.unit || ')';
        raise notice '% is kept in another unit and has history: the delivery goes to a new material, %.', l.name, v_name;
      end if;
      select rm.id into v_id from public.raw_materials rm where lower(rm.name) = lower(v_name);
      if v_id is null then
        insert into public.raw_materials (name, unit, on_hand, ink_name)
        values (v_name, l.unit, 0, l.ink_name)
        returning id into v_id;
      end if;
    end if;

    -- The trigger adds it to the stock on hand.
    insert into public.raw_material_movements (material_id, quantity, reason)
    values (v_id, l.qty, v_reason);
  end loop;
end $$;
