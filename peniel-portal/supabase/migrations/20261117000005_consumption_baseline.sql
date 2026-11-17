-- ============================================================================
-- Consumption baseline: per-sheet rates and each brand's ink grams
--
-- From Peniel's "Consumption Summary" (Total Material Consumption Per Sheet,
-- and Brand Specific Ink Consumption). Figures are per sheet (702 crowns).
--
-- 1. Usage rates (in the material's unit; kg and L count the same, a barrel
--    is 200). Each goes on the material the Pengkuo invoices were recorded
--    on (20261109000002), else one of the same name:
--      Varnish 801              15 g     per sheet varnished
--      Adhesive lacquer 606     15 g     per sheet lacquered
--      White base coat          25.15 g  per sheet given the white coat
--      Transparent base coat    7.6 g    per sheet given the transparent coat
--      Fountain solution        0.75 ml  per sheet printed
--      Multifunctional washing water  1.1 ml  per sheet printed
--      Specific car wash water  3.2 ml   per sheet printed
--      CTP plate developer      0.23 ml  per sheet printed
--    These replace any rate set before. Items the list doesn't have (LPG,
--    gasoline, alcohol, plate preservative, rubber rejuvenator, dampening
--    roll cleaner, CTP cleaning solution, UV ink cleaning liquid, rags) are
--    not added: add them in Inventory with their rate if wanted.
-- 2. Inks by supplier code (Red 6614, Yellow 1408, Green UV60...) are inks
--    on the list, added at 0 kg where missing. "Opaque white" is Opaque White
--    UV-H4003, "White" White UV-4105, "Yellow 1022" Transparent Yellow
--    UV-H1022, "Black" Black 5001, "Silver" Silver UV47.
-- 3. Grams per sheet for Coca, Meta, Dashen, Balageru and Heineken (the brand
--    of that name, else every brand whose name starts with it). A line naming
--    several inks ("Red 6614/2401", "Yellow 1022/1408/1401") is split evenly
--    between them. These replace the brand's figure for those inks.
--
-- The SELECT at the end lists what was set and what wasn't found.
-- Internal only. Safe to run more than once.
-- ============================================================================

-- The report (and the inks found) live for this session only.
create temp table if not exists consumption_report (what text, item text, result text);
truncate consumption_report;
create temp table if not exists consumption_inks (key text primary key, id uuid, ink_name text);
truncate consumption_inks;

do $$
declare
  r record;
  v_id uuid;
  v_unit text;
  v_kind text;
  v_rate numeric;
  b record;
  v_found int;
begin
  -- ------------------------------------------------------------------------
  -- 1. Usage rates
  -- ------------------------------------------------------------------------
  for r in
    select * from (values
      ('Varnish',                       'Received: invoice PK/26019-2 of 15 Sep 2026, line 2 (',  array['varnish', 'overprintvarnish', 'varnish801'],                     'varnish_sheet',               15.0),
      ('Adhesive lacquer',              'Received: invoice PK/26019-2 of 15 Sep 2026, line 1 (',  array['adhesivelacquer', 'adhesivelacquer606', 'lacquer'],             'lacquer_sheet',               15.0),
      ('White base coat',               'Received: invoice PK/26019-1 of 10 Sep 2026, line 1 (',  array['whitebasecoat', 'basecoatwhite'],                                'white_base_coat_sheet',       25.15),
      ('Transparent base coat',         'Received: invoice PK/26019-1 of 10 Sep 2026, line 2 (',  array['transparentbasecoat', 'basecoattransparent'],                    'transparent_base_coat_sheet', 7.6),
      ('Fountain solution',             'Received: invoice PK/26019-1 of 10 Sep 2026, line 11 (', array['fountainsolutionalcoholfree', 'fountainsolution'],               'sheet_printed',               0.75),
      ('Multifunctional washing water', 'Received: invoice PK/26019-1 of 10 Sep 2026, line 12 (', array['multifunctionalwashingwater', 'ydmultifunctionalwashingwater'],  'sheet_printed',               1.1),
      ('Specific car wash water',       'Received: invoice PK/26019-1 of 10 Sep 2026, line 16 (', array['specificcarwashwater', 'ydspecificcarwashwater'],                'sheet_printed',               3.2),
      ('CTP plate developer',           'Received: invoice PK/26019-1 of 10 Sep 2026, line 13 (', array['ctpplatedeveloper', 'platedeveloper'],                           'sheet_printed',               0.23)
    ) as t(label, delivery, aliases, basis, per_sheet)   -- per_sheet: g or ml
  loop
    -- The material the invoice line went to, else one of that name (on the list first).
    select mv.material_id into v_id
    from public.raw_material_movements mv
    where left(mv.reason, length(r.delivery)) = r.delivery
    order by mv.created_at limit 1;
    if v_id is null then
      select m.id into v_id from public.raw_materials m
      where m.ink_name is null and regexp_replace(lower(m.name), '[^a-z0-9]', '', 'g') = any (r.aliases)
      order by m.active desc, array_position(r.aliases, regexp_replace(lower(m.name), '[^a-z0-9]', '', 'g'))
      limit 1;
    end if;
    if v_id is null then
      insert into consumption_report values ('Usage rate', r.label, 'not on the list: not set');
      continue;
    end if;

    select m.unit into v_unit from public.raw_materials m where m.id = v_id;
    v_kind := regexp_replace(lower(v_unit), '[^a-z]', '', 'g');
    v_rate := case
      when v_kind in ('kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms', 'l', 'lt', 'lts', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters') then r.per_sheet / 1000
      when v_kind in ('g', 'gram', 'grams', 'ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters') then r.per_sheet
      when v_kind in ('barrel', 'barrels', 'drum', 'drums') then r.per_sheet / 200000
    end;
    if v_rate is null then
      insert into consumption_report select 'Usage rate', m.name, format('kept in "%s": not set (set it in Inventory)', m.unit) from public.raw_materials m where m.id = v_id;
      v_id := null;
      continue;
    end if;

    update public.raw_materials set use_basis = r.basis, use_rate = v_rate, active = true where id = v_id;
    insert into consumption_report
      select 'Usage rate', m.name, format('%s %s per %s', trim_scale(v_rate), m.unit, replace(r.basis, '_', ' ')) from public.raw_materials m where m.id = v_id;
    v_id := null;
  end loop;

  -- ------------------------------------------------------------------------
  -- 2. The inks, by supplier code
  -- ------------------------------------------------------------------------
  for r in
    select * from (values
      ('opaque_white',      'Opaque White UV-H4003',      array['uvh4003', 'h4003']),
      ('white',             'White UV-4105',              array['uv4105']),
      ('yellow_1022',       'Transparent Yellow UV-H1022', array['uvh1022', 'h1022', 'yellow1022']),
      ('yellow_1408',       'Yellow 1408',                array['yellow1408']),
      ('yellow_1401',       'Yellow 1401',                array['yellow1401']),
      ('red_6614',          'Red 6614',                   array['red6614']),
      ('red_2401',          'Red 2401',                   array['red2401']),
      ('blue_3401',         'Blue 3401',                  array['blue3401']),
      ('black_5001',        'Black 5001',                 array['black5001']),
      ('green_uv60',        'Green UV60',                 array['greenuv60']),
      ('silver_uv47',       'Silver UV47',                array['silveruv47']),
      ('transparent_white', 'Transparent White',          array['transparentwhite']),
      ('silver_connecting', 'Silver connecting material', array['silverconnectingmaterial'])
    ) as t(key, ink_name, codes)
  loop
    select m.id into v_id from public.raw_materials m
    where m.ink_name is not null
      and exists (select 1 from unnest(r.codes) c where position(c in regexp_replace(lower(m.ink_name), '[^a-z0-9]', '', 'g')) > 0)
    order by m.active desc, m.name
    limit 1;
    if v_id is null then
      insert into public.raw_materials (name, unit, on_hand, ink_name)
      values (left('Ink · ' || r.ink_name, 80), 'kg', 0, r.ink_name)
      on conflict do nothing
      returning id into v_id;
      if v_id is null then
        select m.id into v_id from public.raw_materials m where lower(m.ink_name) = lower(r.ink_name) or m.name = left('Ink · ' || r.ink_name, 80) limit 1;
      end if;
      insert into consumption_report values ('Ink', r.ink_name, 'added to the list at 0 kg');
    end if;
    update public.raw_materials set active = true where id = v_id and not active;
    insert into consumption_inks values (r.key, v_id, r.ink_name) on conflict (key) do update set id = excluded.id;
    v_id := null;
  end loop;

  -- ------------------------------------------------------------------------
  -- 3. Grams per sheet per brand (mixed lines split evenly)
  -- ------------------------------------------------------------------------
  for b in
    select x.brand, array_agg(x.ink order by x.ink) as inks, array_agg(x.g order by x.ink) as grams
    from (values
      ('coca', 'red_6614', 0.425), ('coca', 'red_2401', 0.425),
      ('coca', 'yellow_1022', 0.2767), ('coca', 'yellow_1408', 0.2767), ('coca', 'yellow_1401', 0.2767),
      ('coca', 'opaque_white', 3.63),
      ('meta', 'opaque_white', 5.68), ('meta', 'transparent_white', 2.4), ('meta', 'black_5001', 0.53),
      ('dashen', 'opaque_white', 4.38), ('dashen', 'transparent_white', 2.18),
      ('dashen', 'red_6614', 0.088), ('dashen', 'red_2401', 0.088),
      ('dashen', 'yellow_1408', 1.47), ('dashen', 'green_uv60', 0.06),
      ('balageru', 'white', 3.26), ('balageru', 'yellow_1022', 1.34), ('balageru', 'blue_3401', 0.022),
      ('balageru', 'black_5001', 0.0067), ('balageru', 'silver_uv47', 0.047), ('balageru', 'red_6614', 0.126),
      ('heineken', 'green_uv60', 1.9), ('heineken', 'yellow_1401', 0.78), ('heineken', 'black_5001', 0.024),
      ('heineken', 'silver_uv47', 0.019), ('heineken', 'red_2401', 0.53), ('heineken', 'silver_connecting', 0.04)
    ) as x(brand, ink, g)
    group by x.brand
  loop
    -- The brand of that name; else every brand whose name starts with it.
    v_found := 0;
    for r in
      select br.id, br.name from public.brands br
      where lower(btrim(br.name)) = b.brand
         or (not exists (select 1 from public.brands e where lower(btrim(e.name)) = b.brand)
             and lower(btrim(br.name)) ~ ('^' || b.brand || '\M'))
    loop
      v_found := v_found + 1;
      insert into public.brand_ink_rates (brand_id, material_id, g_per_sheet)
      select r.id, i.id, u.g
      from unnest(b.inks, b.grams) as u(ink, g)
      join consumption_inks i on i.key = u.ink
      on conflict (brand_id, material_id) do update set g_per_sheet = excluded.g_per_sheet;
      insert into consumption_report
        select 'Brand inks', r.name, string_agg(i.ink_name || ' ' || trim_scale(u.g::numeric) || ' g', ', ' order by u.g desc)
        from unnest(b.inks, b.grams) as u(ink, g) join consumption_inks i on i.key = u.ink;
    end loop;
    if v_found = 0 then
      insert into consumption_report values ('Brand inks', initcap(b.brand), 'no brand of that name: not set');
    end if;
  end loop;
end $$;

select what, item, result from consumption_report order by what desc, item;
