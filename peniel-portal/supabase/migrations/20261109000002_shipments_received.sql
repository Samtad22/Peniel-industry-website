-- ============================================================================
-- Shipments received: Lianyungang Pengkuo New Material Technology Co., Ltd.
--   Invoice PK/26017   of 08 Jul 2026 (P.I. YJ/161227-499, L/C 102ILSL261390504)
--   Invoice PK/26020-1 of 20 Jul 2026 (P.I. PK/260530, L/C TF2615736589)
--   Invoice PK/26019-1 of 10 Sep 2026 (P.I. PK/260527, L/C 102ILSL261820003)
--   Invoice PK/26019-2 of 15 Sep 2026 (P.I. PK/260527, L/C 102ILSL261820003)
--
-- Every invoice line is recorded as a delivery in (+) on the raw-material
-- list, on top of the stock already there (nothing is reset). Each movement
-- names its invoice and line, e.g. "Received: invoice PK/26019-1 of
-- 10 Sep 2026, line 1 (USD 3.15/kg)".
--
-- Units:
--   * kg and L are the same for these: coatings, lacquer, varnish and the
--     rest come in barrels of 200 kg = 200 L. A material kept in L takes the
--     kg as they are (the movement says "1 kg = 1 L"); one kept in barrels
--     or drums takes kg / 200.
--   * Tinplate is kept in sheets: one pallet holds 1,390 sheets (v_per_pallet;
--     pallets from the packing lists: PK/26017 144 pallets, 299.989 t;
--     PK/26020-1 147 pallets, 304.074 t). A stock count corrects the rest.
--   * Liner compound in tonnes is kg (52 t = 52,000 kg). Cartons and
--     corrugated boxes are the Box (one box of 10,000 crowns).
--
-- Which material each line goes to:
--   * one already on the list under the same name (or a usual other name:
--     "Lacquer" for adhesive lacquer, "Varnish" for over print varnish...),
--     in the same unit. One taken off the list is brought back.
--   * the same, kept in another unit but never used and with no usage rate:
--     kept in the invoice's unit from now on.
--   * otherwise a new material with the invoice's name and unit (a material
--     with history in an unrelated unit is left as it is; a NOTICE names it).
--   * UV inks are inks (raw_materials.ink_name), listed with the brand inks
--     and choosable on the print and sample forms.
--   * The two blankets are two materials: Japanese (30 pcs) and Chinese
--     (20 pcs). The two CTP plate developer lines are one.
--   * White base coat is used per sheet given the white coat, transparent
--     per sheet given the transparent coat (20261109000001); the usage basis
--     is set when the material has none. Rates: Peniel sets them in Inventory.
--
-- Internal only: customers read none of it. Safe to run more than once (a
-- line already recorded is skipped).
-- ============================================================================

-- A unit's kind: kg and L are one (barrels of 200 kg = 200 L).
create or replace function pg_temp.unit_kind(p text) returns text
language sql immutable
as $$
  select case
    when x in ('kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms', 'l', 'lt', 'lts', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters') then 'kg_l'
    when x in ('barrel', 'barrels', 'drum', 'drums') then 'barrel'
    when x in ('pc', 'pcs', 'piece', 'pieces', 'box', 'boxes', 'carton', 'cartons') then 'pcs'
    when x in ('set', 'sets') then 'sets'
    when x in ('sheet', 'sheets') then 'sheets'
    else x
  end
  from (select regexp_replace(lower(coalesce(p, '')), '[^a-z]', '', 'g') as x) u
$$;

do $$
declare
  v_per_pallet constant int := 1390;   -- tinplate sheets on one pallet
  l record;
  m record;
  v_base text;         -- "Received: invoice ..., line N (": one per line
  v_reason text;
  v_qty numeric;
  v_name text;
  v_id uuid;
  v_unit text;         -- the unit the material is kept in
begin
  for l in
    select * from (values
      -- invoice,      date,          line, name,                                unit,     qty,  pallets, price,          ink name,                      usage basis,                    other names (lower case, letters and digits only)
      ('PK/26017',   '08 Jul 2026',  1, 'Tinplate sheet 0.23 mm',               'sheets',  null, 144, 'USD 750.00/t, 299.989 t', null,           null,                           array['tinplatesheet023mm', 'tinplatesheet', 'tinplatesheets', 'tinplate', 'nonprintedsheet', 'tinfreesteelsheet']),
      ('PK/26017',   '08 Jul 2026',  2, 'Box',                                  'boxes',  17500, null, 'USD 0.80/pc',    null,                           null,                           array['box', 'boxes', 'carton', 'cartons', 'corrugatedbox', 'corrugatedboxes']),
      ('PK/26020-1', '20 Jul 2026',  1, 'PVC-free liner compound',              'kg',     52000, null, 'USD 2,430/t',    null,                           null,                           array['pvcfreelinercompound', 'pvcfreecompound', 'pvcfree', 'linercompound']),
      ('PK/26020-1', '20 Jul 2026',  2, 'Tinplate sheet 0.23 mm',               'sheets',  null, 147, 'USD 860.00/t, 304.074 t', null,           null,                           array['tinplatesheet023mm', 'tinplatesheet', 'tinplatesheets', 'tinplate', 'nonprintedsheet', 'tinfreesteelsheet']),
      ('PK/26020-1', '20 Jul 2026',  3, 'Box',                                  'boxes',  14700, null, 'USD 0.90/pc',    null,                           null,                           array['box', 'boxes', 'carton', 'cartons', 'corrugatedbox', 'corrugatedboxes']),
      ('PK/26019-1', '10 Sep 2026',  1, 'White base coat',                      'kg',      2500, null, 'USD 3.15/kg',    null,                           'white_base_coat_sheet',        array['whitebasecoat', 'basecoatwhite', 'whitebase', 'whitecoat']),
      ('PK/26019-1', '10 Sep 2026',  2, 'Transparent base coat',                'kg',      1800, null, 'USD 3.60/kg',    null,                           'transparent_base_coat_sheet',  array['transparentbasecoat', 'basecoattransparent', 'transparentbase', 'clearbasecoat']),
      ('PK/26019-1', '10 Sep 2026',  3, 'Thinner',                              'kg',      1800, null, 'USD 2.30/kg',    null,                           null,                           array['thinner', 'thinners']),
      ('PK/26019-1', '10 Sep 2026',  4, 'Aluminium sizing',                     'kg',      1000, null, 'USD 4.05/kg',    null,                           null,                           array['aluminiumsizing', 'aluminumsizing', 'sizing']),
      ('PK/26019-1', '10 Sep 2026',  5, 'Ink · Opaque White UV-H4003',          'kg',       600, null, 'USD 5.70/kg',    'Opaque White UV-H4003',        null,                           array['uvh4003', 'h4003']),
      ('PK/26019-1', '10 Sep 2026',  6, 'Ink · Bright Red UV-H9208',            'kg',       100, null, 'USD 14.30/kg',   'Bright Red UV-H9208',          null,                           array['uvh9208', 'h9208']),
      ('PK/26019-1', '10 Sep 2026',  7, 'Ink · Transparent Yellow UV-H1022',    'kg',       120, null, 'USD 15.10/kg',   'Transparent Yellow UV-H1022',  null,                           array['uvh1022', 'h1022']),
      ('PK/26019-1', '10 Sep 2026',  8, 'Ink · White UV-4105',                  'kg',        60, null, 'USD 11.40/kg',   'White UV-4105',                null,                           array['uv4105']),
      ('PK/26019-1', '10 Sep 2026',  9, 'Adhesive remover UV-4011',             'kg',        60, null, 'USD 10.30/kg',   null,                           null,                           array['adhesiveremoveruv4011', 'adhesiveremover']),
      ('PK/26019-1', '10 Sep 2026', 10, 'Ink adjuster UV-905',                  'kg',        30, null, 'USD 10.00/kg',   null,                           null,                           array['inkadjusteruv905', 'inkadjuster']),
      ('PK/26019-1', '10 Sep 2026', 11, 'Fountain solution (alcohol-free)',     'L',       1000, null, 'USD 2.90/L',     null,                           null,                           array['fountainsolutionalcoholfree', 'anticalcificationalcoholfreefountainsolution', 'fountainsolution']),
      ('PK/26019-1', '10 Sep 2026', 12, 'Multifunctional washing water',        'L',        340, null, 'USD 3.95/L',     null,                           null,                           array['multifunctionalwashingwater', 'washingwater']),
      ('PK/26019-1', '10 Sep 2026', 13, 'CTP plate developer',                  'L',        700, null, 'USD 3.60/L',     null,                           null,                           array['ctpplatedeveloper', 'platedeveloper', 'ctpdeveloper']),
      ('PK/26019-1', '10 Sep 2026', 14, 'CTP plate developer',                  'L',        260, null, 'USD 4.50/L',     null,                           null,                           array['ctpplatedeveloper', 'platedeveloper', 'ctpdeveloper']),
      ('PK/26019-1', '10 Sep 2026', 15, 'Baking gum',                           'L',         30, null, 'USD 2.00/L',     null,                           null,                           array['bakinggum']),
      ('PK/26019-1', '10 Sep 2026', 16, 'Specific car wash water',              'L',        540, null, 'USD 1.65/L',     null,                           null,                           array['specificcarwashwater', 'carwashwater']),
      ('PK/26019-1', '10 Sep 2026', 17, 'Plate gum',                            'L',         50, null, 'USD 2.15/L',     null,                           null,                           array['plategum']),
      ('PK/26019-1', '10 Sep 2026', 18, 'Printing machine pusher',              'sets',       4, null, 'USD 180.00/set', null,                           null,                           array['printingmachinepusher', 'pusher']),
      ('PK/26019-1', '10 Sep 2026', 19, 'Printing blanket (Japanese)',          'pcs',       30, null, 'USD 123.00/pc',  null,                           null,                           array['printingblanketjapanese', 'japaneseprintingblanket', 'japaneseblanket', 'blanketjapanese']),
      ('PK/26019-1', '10 Sep 2026', 20, 'Printing blanket (Chinese)',           'pcs',       20, null, 'USD 84.00/pc',   null,                           null,                           array['printingblanketchinese', 'chineseprintingblanket', 'chineseblanket', 'blanketchinese']),
      ('PK/26019-2', '15 Sep 2026',  1, 'Adhesive lacquer',                     'kg',      6000, null, 'USD 4.45/kg',    null,                           null,                           array['adhesivelacquer', 'lacqueradhesive', 'lacquer']),
      ('PK/26019-2', '15 Sep 2026',  2, 'Over print varnish',                   'kg',      6000, null, 'USD 3.30/kg',    null,                           null,                           array['overprintvarnish', 'opv', 'varnish']),
      ('PK/26019-2', '15 Sep 2026',  3, 'White base coat',                      'kg',      5000, null, 'USD 3.15/kg',    null,                           'white_base_coat_sheet',        array['whitebasecoat', 'basecoatwhite', 'whitebase', 'whitecoat'])
    ) as t(invoice, inv_date, line, name, unit, qty, pallets, price, ink_name, basis, aliases)
  loop
    v_base := format('Received: invoice %s of %s, line %s (', l.invoice, l.inv_date, l.line);
    continue when exists (select 1 from public.raw_material_movements mv where left(mv.reason, length(v_base)) = v_base);

    -- Candidates: inks by their code, other materials by name. Prefer the
    -- same kind of unit, then on the list, then the invoice's own name, then
    -- the earlier name in the list of other names.
    select x.id, x.name, x.unit, x.same_unit, x.untouched into m
    from (
      select rm.id, rm.name, rm.unit, rm.active,
        pg_temp.unit_kind(rm.unit) = pg_temp.unit_kind(l.unit)
          or (pg_temp.unit_kind(rm.unit) = 'barrel' and pg_temp.unit_kind(l.unit) = 'kg_l') as same_unit,
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
      v_unit := case when m.same_unit then m.unit else l.unit end;
      update public.raw_materials
      set active = true, unit = v_unit, use_basis = coalesce(use_basis, l.basis)
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
        insert into public.raw_materials (name, unit, on_hand, ink_name, use_basis)
        values (v_name, l.unit, 0, l.ink_name, l.basis)
        returning id into v_id;
      end if;
      v_unit := (select rm.unit from public.raw_materials rm where rm.id = v_id);
    end if;

    -- The quantity in the material's unit, and how it was counted.
    v_reason := v_base || l.price;
    if l.pallets is not null then
      v_qty := l.pallets * v_per_pallet;
      v_reason := v_reason || format(', %s pallets x %s sheets', l.pallets, to_char(v_per_pallet, 'FM999,999'));
    elsif pg_temp.unit_kind(v_unit) = 'barrel' and pg_temp.unit_kind(l.unit) = 'kg_l' then
      v_qty := round(l.qty / 200.0, 3);
      v_reason := v_reason || format(', %s %s = %s barrels of 200', to_char(l.qty, 'FM999,999'), l.unit, trim_scale(v_qty));
    else
      v_qty := l.qty;
      if lower(v_unit) <> lower(l.unit) and pg_temp.unit_kind(v_unit) = 'kg_l' then
        v_reason := v_reason || format(', %s %s = %s %s', to_char(l.qty, 'FM999,999'), l.unit, to_char(l.qty, 'FM999,999'), v_unit);
      end if;
    end if;
    v_reason := v_reason || ')';

    -- The trigger adds it to the stock on hand.
    insert into public.raw_material_movements (material_id, quantity, reason)
    values (v_id, v_qty, v_reason);
  end loop;
end $$;
