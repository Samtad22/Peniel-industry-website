-- ============================================================================
-- One-off: stock count of 20 Nov 2026 from Peniel's control sheets
--
-- Sets every raw material and ink to the balance on the Daily Raw Material
-- control and Ink finance sheets (20 Nov 2026), with each delivery's
-- production and expiry dates as lots (migration 20261121000001 first).
--   * Each item is matched to the material on the list by its name, its
--     ink name or a known other name (Yellow 1408 = High Temperature Yellow
--     UV-H1408, White 601 = White base coat, ...); a missing one is added.
--     Inks get the sheet's name and part number.
--   * The stock is set by a "Stock count 20 Nov 2026 (control sheets)"
--     movement (the difference), as Inventory → Edit stock does. Run again,
--     an item already counted this way is left as it is.
--   * Lots: each delivery with its quantity, production and expiry dates
--     (added once). Dates Excel had read month-first were put back.
--   * PVC-free liner compound: 151 units of about 600 kg = 90,600 kg.
--   * Blankets: the 26 older ones are Chinese (Japanese 30, Chinese 46).
--   * Tinplate (N.T.F.S.S) is NOT changed: its count (pallets) is being
--     checked.
--   * Inks made by the brands' colours that were never stocked or used (no
--     stock, no movement, no grams per sheet) are taken off the list.
-- Ends with what was done, item by item.
-- ============================================================================

drop table if exists count_items;
create temp table count_items (key text primary key, name text, unit text, ink_name text, part_no text, count numeric, aliases text[], note text, lots jsonb);
insert into count_items values
  ('orange_h28', 'Ink · Orange UV-H28', 'kg', 'Orange UV-H28', 'UV-H28', 44, array['orangeuvh28', 'orangeuv28']::text[], '22 cans of 2 kg', '[{"q": 60, "received": "2025-10-24", "produced": "2025-03-20", "expires": "2026-03-20", "note": null}]'::jsonb),
  ('tyellow_h1022', 'Ink · Transparent Yellow UV-H1022', 'kg', 'Transparent Yellow UV-H1022', 'UV-H1022', 120, array['transparentyellowuvh1022']::text[], '60 cans of 2 kg', '[{"q": 120, "received": "2026-11-11", "produced": "2026-07-13", "expires": "2027-07-13", "note": null}]'::jsonb),
  ('htyellow_h1408', 'Ink · High Temperature Yellow UV-H1408', 'kg', 'High Temperature Yellow UV-H1408', 'UV-H1408', 70, array['yellow1408', 'hightemperatureyellowuvh1408']::text[], '35 cans of 2 kg', '[{"q": 120, "received": "2025-10-24", "produced": "2025-04-12", "expires": "2026-04-12", "note": null}]'::jsonb),
  ('yellow_h1401', 'Ink · Four-colour Yellow UV-H1401', 'kg', 'Four-colour Yellow UV-H1401', 'UV-H1401', 22, array['yellow1401', 'fourcolouryellowuvh1401']::text[], '11 cans of 2 kg', '[{"q": 120, "received": "2025-10-24", "produced": "2025-04-14", "expires": "2026-04-14", "note": null}]'::jsonb),
  ('black_h5001', 'Ink · Four-colour Black UV-H5001', 'kg', 'Four-colour Black UV-H5001', 'UV-H5001', 44, array['black5001', 'fourcolourblackuvh5001']::text[], '22 cans of 2 kg', '[{"q": 120, "received": "2025-10-24", "produced": "2025-04-14", "expires": "2026-04-14", "note": null}]'::jsonb),
  ('white_4105', 'Ink · White UV-4105', 'kg', 'White UV-4105', 'UV-4105', 45, array['whiteuv4105']::text[], '15 cans of 3 kg', '[{"q": 60, "received": "2026-11-11", "produced": "2026-07-13", "expires": "2027-07-13", "note": null}]'::jsonb),
  ('green_60', 'Ink · Green UV-60', 'kg', 'Green UV-60', 'UV-60', 8, array['greenuv60']::text[], '4 cans of 2 kg', '[{"q": 60, "received": "2025-10-24", "produced": "2025-04-14", "expires": "2026-04-14", "note": null}]'::jsonb),
  ('blue_h3401', 'Ink · Four-colour Blue UV-H3401', 'kg', 'Four-colour Blue UV-H3401', 'UV-H3401', 88, array['blue3401', 'fourcolourblueuvh3401']::text[], '44 cans of 2 kg', '[{"q": 120, "received": "2025-10-24", "produced": "2025-04-14", "expires": "2026-04-14", "note": null}]'::jsonb),
  ('purple_h7001', 'Ink · Purple UV-H7001', 'kg', 'Purple UV-H7001', 'UV-H7001', 50, array['purpleuvh7001']::text[], '25 cans of 2 kg', '[{"q": 60, "received": "2025-10-24", "produced": "2025-04-14", "expires": "2026-04-14", "note": null}]'::jsonb),
  ('red_h2401', 'Ink · Four-colour Red UV-H2401', 'kg', 'Four-colour Red UV-H2401', 'UV-H2401', 68, array['red2401', 'fourcolourreduvh2401']::text[], '34 cans of 2 kg', '[{"q": 120, "received": "2025-10-24", "produced": "2025-04-14", "expires": "2026-04-14", "note": null}]'::jsonb),
  ('goldenred_h2101', 'Ink · Golden Red UV-H2101', 'kg', 'Golden Red UV-H2101', 'UV-H2101', 22, array['goldenreduvh2101']::text[], '11 cans of 2 kg', '[{"q": 60, "received": "2025-10-24", "produced": "2025-04-01", "expires": "2026-04-01", "note": null}]'::jsonb),
  ('brightred_h9208', 'Ink · Bright Red UV-H9208', 'kg', 'Bright Red UV-H9208', 'UV-H9208', 100, array['brightreduvh9208']::text[], '50 cans of 2 kg', '[{"q": 100, "received": "2026-11-11", "produced": "2026-07-13", "expires": "2027-07-13", "note": null}]'::jsonb),
  ('red_6614', 'Ink · Bright Red UV-6614', 'kg', 'Bright Red UV-6614', 'UV-6614', 0, array['red6614', 'brightreduv6614']::text[], 'used up', '[]'::jsonb),
  ('silver_47', 'Ink · Silver Paste UV-47', 'kg', 'Silver Paste UV-47', 'UV-47', 5, array['silveruv47', 'silverpasteuv47']::text[], '5 cans of 1 kg', '[{"q": 12, "received": "2025-10-24", "produced": "2025-03-28", "expires": "2026-03-28", "note": null}]'::jsonb),
  ('silverconn_0003', 'Ink · Silver Connecting UV/PU 0003', 'kg', 'Silver Connecting UV/PU 0003', 'UV/PU 0003', 27.2, array['silverconnectingmaterial', 'silverconnectinguvpu0003']::text[], '17 cans of 1.6 kg', '[{"q": 38.4, "received": "2025-10-24", "produced": "2025-03-11", "expires": "2026-03-11", "note": null}]'::jsonb),
  ('opaquewhite_h4003', 'Ink · UV Poly Opaque White H4003', 'kg', 'Opaque White UV-H4003', 'UV-H4003', 587, array['opaquewhiteuvh4003', 'uvpolyopaquewhiteh4003']::text[], '181 cans', '[{"q": 600, "received": "2026-11-11", "produced": "2026-07-13", "expires": "2027-07-13", "note": null}]'::jsonb),
  ('transparent_white', 'Ink · UV Poly Transparent White', 'kg', 'Transparent White', null, 0, array['transparentwhite', 'uvpolytransparentwhite']::text[], 'used up', '[]'::jsonb),
  ('pms116', 'Ink · PANTONE 116 C (UV)', 'kg', 'PANTONE 116 C', 'PANTONE 116 C', 2.5, array['pantone116c']::text[], '1 can', '[{"q": 6, "received": "2026-02-13", "produced": "2026-02-11", "expires": "2027-02-11", "note": null}]'::jsonb),
  ('pms8365', 'Ink · PANTONE 8365 C metallic (UV)', 'kg', 'PANTONE 8365 C', 'PANTONE 8365 C', 3, array['pantone8365c']::text[], '1 can', '[{"q": 3, "received": "2026-02-13", "produced": "2026-02-11", "expires": "2027-02-11", "note": null}]'::jsonb),
  ('black_131199', 'Ink · Black 131199', 'kg', 'Black 131199', '131199', 1, array['black131199']::text[], '1 can', '[{"q": 1, "received": "2026-07-08", "produced": "2025-07-01", "expires": "2025-12-31", "note": null}]'::jsonb),
  ('polyblue_153', 'Ink · UV Poly Base Blue 15.3', 'kg', 'UV Poly Base Blue 15.3', '15.3', 10, array['uvpolybaseblue153']::text[], '2 cans', '[{"q": 10, "received": "2026-05-27", "produced": "2026-03-12", "expires": "2027-03-12", "note": null}]'::jsonb),
  ('polyred_531', 'Ink · UV Poly Base Red 53.1', 'kg', 'UV Poly Base Red 53.1', '53.1', 30, array['uvpolybasered531']::text[], '3 cans', '[{"q": 10, "received": "2026-05-27", "produced": "2026-03-20", "expires": "2027-03-20", "note": null}, {"q": 20, "received": null, "produced": "2026-03-20", "expires": "2027-03-20", "note": null}]'::jsonb),
  ('polyred_571', 'Ink · UV Poly Base Red 57.1', 'kg', 'UV Poly Base Red 57.1', '57.1', 26, array['uvpolybasered571']::text[], '2 cans', '[{"q": 12, "received": "2026-05-27", "produced": "2026-03-08", "expires": "2027-03-08", "note": null}, {"q": 20, "received": null, "produced": "2026-03-08", "expires": "2027-03-08", "note": null}]'::jsonb),
  ('polyorange_34', 'Ink · UV Poly Base Orange 34', 'kg', 'UV Poly Base Orange 34', '34', 10, array['uvpolybaseorange34']::text[], '2 cans', '[{"q": 10, "received": "2026-05-27", "produced": "2026-03-23", "expires": "2027-03-23", "note": null}]'::jsonb),
  ('polyyellow_174', 'Ink · UV Poly Base Yellow 174', 'kg', 'UV Poly Base Yellow 174', '174', 40, array['uvpolybaseyellow174']::text[], '2 cans', '[{"q": 60, "received": "2026-05-27", "produced": "2026-02-27", "expires": "2027-02-27", "note": null}]'::jsonb),
  ('polyblack_7', 'Ink · UV Poly Base Black 7', 'kg', 'UV Poly Base Black 7', '7', 24, array['uvpolybaseblack7']::text[], '2 cans', '[{"q": 4, "received": null, "produced": "2026-02-27", "expires": "2027-02-27", "note": null}, {"q": 20, "received": null, "produced": "2026-02-27", "expires": "2027-02-27", "note": null}]'::jsonb),
  ('polyblack', 'Ink · UV Poly Black', 'kg', 'UV Poly Black', null, 3, array['uvpolyblack']::text[], '3 cans of 1 kg', '[{"q": 4, "received": "2026-05-27", "produced": "2026-03-22", "expires": "2027-03-22", "note": null}]'::jsonb),
  ('polygreen_7', 'Ink · UV Poly Green 7', 'kg', 'UV Poly Green 7', '7', 20, array['uvpolygreen7']::text[], '1 can', '[{"q": 60, "received": null, "produced": "2026-03-03", "expires": "2027-03-03", "note": null}]'::jsonb),
  ('varnish_540w', 'Printing varnish UV-540W', 'kg', null, 'UV-540W', 6, array['printingvarnishuv540w']::text[], '3 cans of 2 kg', '[{"q": 12, "received": "2025-10-24", "produced": "2025-03-21", "expires": "2026-03-21", "note": null}]'::jsonb),
  ('diluent_903', 'Diluent UV-903', 'kg', null, 'UV-903', 2, array['diluentuv903']::text[], '1 can', '[{"q": 60, "received": "2025-10-24", "produced": "2025-04-03", "expires": "2026-04-03", "note": null}]'::jsonb),
  ('adhremover_4011', 'Adhesive remover UV-4011', 'kg', null, 'UV-4011', 98, array['adhesiveremoveruv4011']::text[], '49 cans of 2 kg', '[{"q": 60, "received": "2025-10-24", "produced": "2025-04-01", "expires": "2026-04-01", "note": null}, {"q": 60, "received": "2026-11-11", "produced": "2026-07-13", "expires": "2027-07-13", "note": null}]'::jsonb),
  ('adjuster_905', 'Ink adjuster UV-905', 'kg', null, 'UV-905', 43, array['inkadjusteruv905']::text[], '43 cans of 1 kg', '[{"q": 60, "received": "2025-10-24", "produced": "2025-03-11", "expires": "2026-03-11", "note": null}, {"q": 30, "received": "2026-11-11", "produced": "2026-07-13", "expires": "2027-07-13", "note": null}]'::jsonb),
  ('carwash', 'Specific car wash water', 'L', null, null, 522, array['specificcarwashwater', 'carwashwater']::text[], '29 cans of 18 L', '[]'::jsonb),
  ('washwater', 'Multifunctional washing water', 'L', null, null, 428, array['multifunctionalwashingwater', 'washingwater']::text[], '27 cans', '[]'::jsonb),
  ('platedev', 'Plate developer', 'L', null, null, 160, array['platedeveloper']::text[], '32 cans of 5 L', '[]'::jsonb),
  ('ctpdev', 'CTP plate developer', 'L', null, null, 980, array['ctpplatedeveloper', 'ctpdeveloper']::text[], '49 cans of 20 L', '[]'::jsonb),
  ('replenisher', 'Replenisher', 'L', null, null, 20, array['replenisher']::text[], '1 can of 20 L', '[]'::jsonb),
  ('rejuvenator', 'Rubber rejuvenator', 'L', null, null, 49, array['rubberrejuvenator']::text[], '49 bottles of 1 L', '[]'::jsonb),
  ('dampclean', 'Dampening roll cleaner', 'L', null, null, 41, array['dampeningrollcleaner']::text[], '41 bottles of 1 L', '[]'::jsonb),
  ('yd701', 'YD 701 CTP developer concentrated cleaning solution', 'L', null, 'YD 701', 115, array['yd701ctpdeveloperconcentratedcleaningsolution']::text[], '115 bottles of 1 L', '[{"q": 120, "received": "2025-10-24", "produced": "2024-06-12", "expires": null, "note": null}]'::jsonb),
  ('yduvclean', 'YD UV ink cleaning liquid', 'L', null, null, 49, array['yduvinkcleaningliquid']::text[], '49 bottles of 1 L', '[{"q": 120, "received": "2025-10-24", "produced": "2025-02-26", "expires": null, "note": null}]'::jsonb),
  ('platepres', 'Plate preservative', 'L', null, null, 58, array['platepreservative']::text[], '58 bottles of 1 L', '[]'::jsonb),
  ('imgremover', 'Image remover', 'pcs', null, null, 12, array['imageremover']::text[], null, '[]'::jsonb),
  ('imgpen', 'Image remover pen', 'pcs', null, null, 24, array['imageremoverpen']::text[], null, '[]'::jsonb),
  ('fountain', 'Fountain solution (alcohol-free)', 'L', null, null, 1080, array['fountainsolutionalcoholfree', 'fountainsolution']::text[], '66 cans', '[{"q": 100, "received": "2026-09-03", "produced": "2025-09-12", "expires": "2026-09-12", "note": null}, {"q": 1000, "received": "2026-11-11", "produced": "2026-07-13", "expires": "2028-07-13", "note": null}]'::jsonb),
  ('plate40', 'Printing plate', 'pcs', null, null, 1440, array['printingplate', 'plate']::text[], '36 cartons of 40', '[]'::jsonb),
  ('ctpplate', 'CTP plate', 'pcs', null, null, 390, array['ctpplate']::text[], '13 cartons of 30', '[{"q": 510, "received": "2026-08-11", "produced": "2026-04-24", "expires": null, "note": null}]'::jsonb),
  ('blanket_jp', 'Printing blanket (Japanese)', 'pcs', null, null, 30, array['printingblanketjapanese']::text[], null, '[]'::jsonb),
  ('blanket_cn', 'Printing blanket (Chinese)', 'pcs', null, null, 46, array['printingblanketchinese']::text[], null, '[]'::jsonb),
  ('bakinggum', 'Baking gum', 'L', null, null, 30, array['bakinggum', 'thermobakinggum']::text[], '6 cans of 5 L', '[]'::jsonb),
  ('plategum', 'Plate gum', 'L', null, null, 49, array['plategum', 'ctpplatecleaner']::text[], 'CTP plate cleaner, 49 bottles of 1 L', '[]'::jsonb),
  ('combowash', 'Combo UV wash', 'L', null, null, 75, array['combouvwash']::text[], '3 cans of 25 L', '[{"q": 100, "received": "2026-09-17", "produced": "2026-06-16", "expires": "2027-06-16", "note": null}]'::jsonb),
  ('alcohol', 'Alcohol', 'L', null, null, 50, array['alcohol']::text[], null, '[]'::jsonb),
  ('benzene', 'Benzene', 'L', null, null, 155, array['benzene']::text[], null, '[]'::jsonb),
  ('thinner', 'Thinner', 'kg', null, null, 2540, array['thinner', 'thinnerkg']::text[], 'counted in L; kg and L taken as the same', '[{"q": 1800, "received": "2026-11-08", "produced": "2026-07-06", "expires": null, "note": null}]'::jsonb),
  ('htoil', 'High temperature oil', 'L', null, null, 186, array['hightemperatureoil']::text[], null, '[]'::jsonb),
  ('naphtha', 'Naphtha', 'L', null, null, 220, array['naphtha']::text[], 'fuel: forklift, pickup, generator', '[]'::jsonb),
  ('white601', 'White base coat', 'kg', null, '601', 7000, array['whitebasecoat', 'basecoatwhite']::text[], '28 barrels of 250 kg', '[{"q": 5000, "received": "2026-11-05", "produced": "2026-06-27", "expires": null, "note": null}, {"q": 2500, "received": "2026-11-08", "produced": null, "expires": null, "note": null}]'::jsonb),
  ('tbase', 'Transparent base coat', 'kg', null, null, 1800, array['transparentbasecoat', 'basecoattransparent']::text[], '9 barrels of 200 kg (primer transparent base coat)', '[{"q": 1800, "received": "2026-11-08", "produced": "2026-06-27", "expires": "2027-06-27", "note": null}]'::jsonb),
  ('lacq901', 'Base coat lacquer 901', 'kg', null, '901', 1000, array['basecoatlacquer901']::text[], '5 barrels of 200 kg', '[]'::jsonb),
  ('silverprimer', 'Silver primer base coat', 'kg', null, null, 1000, array['silverprimerbasecoat']::text[], '5 barrels of 200 kg', '[{"q": 1000, "received": "2026-11-08", "produced": "2026-07-02", "expires": "2027-07-01", "note": null}]'::jsonb),
  ('varnish801', 'Varnish', 'L', null, '801', 5800, array['varnish', 'varnish801']::text[], '29 barrels of 200 kg', '[{"q": 6000, "received": "2026-11-05", "produced": "2026-07-06", "expires": null, "note": null}]'::jsonb),
  ('lacq606', 'Adhesive lacquer', 'kg', null, '606', 8400, array['adhesivelacquer', 'adhesivelacquer606']::text[], '42 barrels of 200 kg', '[{"q": 8000, "received": "2025-01-24", "produced": "2025-04-14", "expires": "2026-04-14", "note": "9 barrels marked expired"}, {"q": 6000, "received": "2026-11-05", "produced": "2026-06-27", "expires": "2027-06-27", "note": null}]'::jsonb),
  ('pvc', 'PVC-free liner compound', 'kg', null, null, 90600, array['pvcfreelinercompound', 'pvcfreecompound', 'pvc']::text[], '151 units of about 600 kg', '[{"q": 54600, "received": "2026-07-08", "produced": "2025-12-27", "expires": "2026-12-27", "note": null}, {"q": 52200, "received": "2026-10-24", "produced": "2026-07-16", "expires": "2027-07-16", "note": null}]'::jsonb),
  ('plaster', 'Plaster', 'pcs', null, null, 150, array['plaster']::text[], null, '[{"q": 210, "received": "2026-10-24", "produced": "2026-07-16", "expires": "2027-07-16", "note": null}]'::jsonb),
  ('polybag', 'Polybag', 'polybags', null, null, 605500, array['polybag', 'polybags']::text[], null, '[{"q": 261800, "received": "2026-07-08", "produced": "2021-11-25", "expires": null, "note": null}, {"q": 352800, "received": "2026-08-03", "produced": "2022-05-22", "expires": null, "note": null}]'::jsonb),
  ('box', 'Box', 'boxes', null, null, 64105, array['box', 'boxes', 'carton', 'cartons']::text[], 'cartons', '[{"q": 32200, "received": "2026-10-24", "produced": null, "expires": null, "note": null}, {"q": 33350, "received": "2026-11-12", "produced": null, "expires": null, "note": null}]'::jsonb),
  ('sticker', 'Sticker', 'pcs', null, null, 349392, array['sticker', 'stickers']::text[], null, '[{"q": 351232, "received": "2026-11-12", "produced": "2026-07-03", "expires": null, "note": null}]'::jsonb);

drop table if exists count_report;
create temp table count_report (step int generated always as identity, item text, material text, unit text, was numeric, now numeric, lots int, done text);

do $$
declare
  it record;
  l jsonb;
  v_id uuid;
  v_unit text;
  v_was numeric;
  v_done text;
  v_lots int;
  v_reason constant text := 'Stock count 20 Nov 2026 (control sheets)';
  v_retired int;
begin
  for it in select * from count_items loop
    -- The material: by name, ink name or another known name (active first, most in stock).
    select m.id, m.unit into v_id, v_unit from public.raw_materials m
    where
      -- Inks with inks, the rest with the rest.
      (m.ink_name is not null) = (it.ink_name is not null)
      and (
        regexp_replace(lower(m.name), '[^a-z0-9]', '', 'g') = any (it.aliases || regexp_replace(lower(it.name), '[^a-z0-9]', '', 'g'))
        or (m.ink_name is not null and (
              regexp_replace(lower(m.ink_name), '[^a-z0-9]', '', 'g') = any (it.aliases || regexp_replace(lower(it.ink_name), '[^a-z0-9]', '', 'g'))
           or regexp_replace(regexp_replace(lower(m.name), '^ink\W*', ''), '[^a-z0-9]', '', 'g') = any (it.aliases)))
      )
    order by m.active desc, m.on_hand desc, m.name
    limit 1;

    if v_id is null then
      insert into public.raw_materials (name, unit, on_hand, ink_name, part_no)
      values (left(it.name, 80), it.unit, 0, it.ink_name, it.part_no)
      returning id, unit into v_id, v_unit;
      v_done := 'added';
    else
      v_done := 'matched';
      update public.raw_materials set active = true, part_no = coalesce(it.part_no, part_no) where id = v_id;
      -- Inks: the sheet's name (when no other material has it).
      if it.ink_name is not null
         and not exists (select 1 from public.raw_materials o where o.id <> v_id and (lower(o.ink_name) = lower(it.ink_name) or lower(o.name) = lower(left(it.name, 80)))) then
        update public.raw_materials set name = left(it.name, 80), ink_name = it.ink_name where id = v_id;
      end if;
    end if;

    select on_hand into v_was from public.raw_materials where id = v_id;
    if exists (select 1 from public.raw_material_movements where material_id = v_id and left(reason, length(v_reason)) = v_reason) then
      v_done := v_done || ', counted before';
    elsif round(it.count - v_was, 3) <> 0 then
      insert into public.raw_material_movements (material_id, quantity, reason)
      values (v_id, round(it.count - v_was, 3),
              left(format('%s: set to %s %s (was %s)%s', v_reason, trim_scale(it.count), v_unit, trim_scale(round(v_was, 3)),
                          case when it.note is not null then '. ' || it.note else '' end), 200));
    end if;

    v_lots := 0;
    for l in select * from jsonb_array_elements(it.lots) loop
      if not exists (
        select 1 from public.raw_material_lots x
        where x.material_id = v_id and x.quantity = (l->>'q')::numeric
          and x.received_on is not distinct from (l->>'received')::date
          and x.produced_on is not distinct from (l->>'produced')::date
          and x.expires_on is not distinct from (l->>'expires')::date
      ) then
        insert into public.raw_material_lots (material_id, quantity, received_on, produced_on, expires_on, notes)
        values (v_id, (l->>'q')::numeric, (l->>'received')::date, (l->>'produced')::date, (l->>'expires')::date,
                coalesce(l->>'note', 'From the control sheets (20 Nov 2026)'));
        v_lots := v_lots + 1;
      end if;
    end loop;

    insert into count_report (item, material, unit, was, now, lots, done)
    select it.key, m.name, m.unit, round(v_was, 3), m.on_hand, v_lots, v_done
    from public.raw_materials m where m.id = v_id;
  end loop;

  -- Inks the brands' colours made that were never stocked or used.
  with gone as (
    update public.raw_materials m set active = false
    where m.active and m.ink_name is not null and m.on_hand = 0
      and not exists (select 1 from public.raw_material_movements mv where mv.material_id = m.id)
      and not exists (select 1 from public.brand_ink_rates r where r.material_id = m.id)
    returning m.ink_name
  )
  select count(*) into v_retired from gone;
  insert into count_report (item, done) values ('unused inks', format('%s ink(s) never stocked or used taken off the list', v_retired));
end $$;

select item, material, unit, was, now, lots, done from count_report order by step;
