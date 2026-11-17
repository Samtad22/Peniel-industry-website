-- ============================================================================
-- Customer Artwork Catalogue: each brand's design code, CTP plates and colour
-- separations
--
-- From Peniel's Customer Artwork Catalogue (edition 07 November 2026, 30
-- designs, 7 customers). Each brand gets (internal, prepress):
--   * design_code: the catalogue's code, e.g. HEI-01 (Heineken), CCE-03 (Sprite);
--   * design_note: the catalogue's line about it ("Original lager crown");
--   * plates: the CTP plates the design takes (one per colour as a rule);
--   * separations: each colour in print order, its name and print spec
--     (CMYK, or "White · opaque base"), e.g. Heineken Green C85 M0 Y100 K30.
-- The brand's colours (and so the inks in Inventory) are left as they are:
-- the separations are for prepress and the printer, not ink stock.
--
-- Each design is matched to the brand already on the list by name (without
-- case, spaces or punctuation; Coca-Cola = Coca, Dashen Beer = Dashen,
-- Habesha Kostara Team = Habesha Kostara, Bedele Regular = Bedele). A design
-- not on the list yet is added as a brand under its customer (and a
-- customer not on the list yet, e.g. Komari, Kegna Beverage, is added too),
-- with the base coat by the rule. A brand whose design was changed by hand
-- (another design code) is left alone.
--
-- Customers never read these columns (customer_brands lists its own).
-- On a fresh database (no customers yet) only the columns are added.
-- Ends by listing each design and what was done. Safe to run more than once.
-- ============================================================================

alter table public.brands add column if not exists design_code text;
alter table public.brands add column if not exists design_note text;
alter table public.brands add column if not exists plates int;
alter table public.brands add column if not exists separations jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brands_plates_check') then
    alter table public.brands add constraint brands_plates_check check (plates between 1 and 12);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brands_separations_check') then
    alter table public.brands add constraint brands_separations_check check (jsonb_typeof(separations) = 'array' and jsonb_array_length(separations) <= 12);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brands_design_code_check') then
    alter table public.brands add constraint brands_design_code_check check (length(design_code) <= 20 and length(design_note) <= 120);
  end if;
end $$;

comment on column public.brands.design_code is 'INTERNAL. The Customer Artwork Catalogue code, e.g. HEI-01.';
comment on column public.brands.plates is 'INTERNAL. CTP plates the design takes.';
comment on column public.brands.separations is 'INTERNAL. Colour separations in print order: [{name, spec}], spec = CMYK or "White · opaque base".';

drop table if exists catalogue_customers;
create temp table catalogue_customers (prefix text primary key, pattern text, name text, code text);
insert into catalogue_customers values
  ('HEI', '^heineken', 'Heineken Breweries S.C.', 'HNK'),
  ('BGI', '^bgi', 'BGI Ethiopia', 'BGI'),
  ('CCE', '(^east africa bottling|^coca[- ]?cola)', 'East Africa Bottling S.C.', 'EAB'),
  ('DAS', '^dashen', 'Dashen Brewery S.C.', 'DSH'),
  ('HAB', '^habesha', 'Habesha Breweries S.C.', 'HAB'),
  ('KOM', '^komari', 'Komari', 'KOM'),
  ('KEG', '^kegna', 'Kegna Beverage', 'KEG');

drop table if exists catalogue_designs;
create temp table catalogue_designs (prefix text, code text primary key, brand text, aliases text[], note text, plates int, separations jsonb);
insert into catalogue_designs values
    ('HEI', 'HEI-01', 'Heineken', array[]::text[], 'Original lager crown', 4, '[{"name": "Heineken Green", "spec": "C85 M0 Y100 K30"}, {"name": "Heineken Red", "spec": "C0 M100 Y100 K0"}, {"name": "Heineken Silver (metallic film)", "spec": "C0 M0 Y0 K30"}, {"name": "White (enamel)", "spec": "White · opaque base"}]'::jsonb),
    ('HEI', 'HEI-02', 'Harar', array[]::text[], 'New crown design', 3, '[{"name": "Harar Red (PANTONE 485 C)", "spec": "C6 M98 Y100 K1"}, {"name": "White ×2 (double hit)", "spec": "White · opaque base"}, {"name": "Black", "spec": "C0 M0 Y0 K100"}]'::jsonb),
    ('HEI', 'HEI-03', 'Bedele Regular', array['bedele']::text[], 'Crown cork', 5, '[{"name": "PANTONE 7482 C", "spec": "C95 M0 Y95 K2"}, {"name": "PMS 186 C", "spec": "C8 M100 Y90 K0"}, {"name": "PMS 871 C (gold)", "spec": "C40 M45 Y75 K0"}, {"name": "PANTONE Black C", "spec": "C0 M0 Y0 K100"}, {"name": "White (enamel)", "spec": "White · opaque base"}]'::jsonb),
    ('HEI', 'HEI-04', 'Bedele Special', array[]::text[], 'Crown cork', 3, '[{"name": "Gold", "spec": "C33 M36 Y63 K6"}, {"name": "PMS 286", "spec": "C100 M75 Y0 K0"}, {"name": "White (enamel)", "spec": "White · opaque base"}]'::jsonb),
    ('HEI', 'HEI-05', 'Walia', array[]::text[], 'Ethiopia crown', 3, '[{"name": "Walia Gold", "spec": "C18 M36 Y74 K7"}, {"name": "PANTONE 2935 C", "spec": "C100 M62 Y0 K1"}, {"name": "White (enamel)", "spec": "White · opaque base"}]'::jsonb),
    ('HEI', 'HEI-06', 'Sofi', array[]::text[], 'Harar Breweries crown', 5, '[{"name": "White (enamel)", "spec": "White · opaque base"}, {"name": "Red", "spec": "C0 M72 Y18 K2"}, {"name": "Yellow", "spec": "C6 M1 Y89 K0"}, {"name": "PMS 877 C (silver)", "spec": "C34 M32 Y20 K8"}, {"name": "PMS 2738 C", "spec": "C72 M58 Y5 K29"}]'::jsonb),
    ('HEI', 'HEI-07', 'Desperados', array[]::text[], 'Flavoured beer crown', 2, '[{"name": "PANTONE 123 C (transparent)", "spec": "C4 M25 Y92 K0"}, {"name": "PANTONE 3546 C (opaque)", "spec": "C0 M99 Y93 K9"}]'::jsonb),
    ('BGI', 'BGI-01', 'Castel', array[]::text[], 'Crown cork · 33 cl', 3, '[{"name": "PANTONE Black C", "spec": "C74 M79 Y53 K96"}, {"name": "PANTONE 872 Gold Matt", "spec": "C26 M34 Y79 K2"}, {"name": "Or Clair (light gold)", "spec": "C6 M19 Y53 K0"}]'::jsonb),
    ('BGI', 'BGI-02', 'St. George', array[]::text[], 'Crown cork · 33 cl', 2, '[{"name": "PANTONE 116 C", "spec": "C2 M18 Y96 K3"}, {"name": "Rouge (red)", "spec": "C2 M94 Y94 K0"}]'::jsonb),
    ('BGI', 'BGI-03', 'Meta', array[]::text[], 'Crown · 50 cl', 2, '[{"name": "Neutral Black C", "spec": "C74 M79 Y53 K96"}, {"name": "White 000 C", "spec": "White · opaque base"}]'::jsonb),
    ('BGI', 'BGI-04', 'Sen''q', array['senq']::text[], 'Crown · 33 cl', 5, '[{"name": "P 4-2 C", "spec": "C2 M4 Y34 K0"}, {"name": "P 14-8 C", "spec": "C1 M36 Y95 K3"}, {"name": "Neutral Black C", "spec": "C74 M79 Y53 K96"}, {"name": "420 C", "spec": "C24 M18 Y19 K0"}, {"name": "White (enamel)", "spec": "White · opaque base"}]'::jsonb),
    ('CCE', 'CCE-01', 'Coca-Cola', array['coca']::text[], 'Original Taste crown', 2, '[{"name": "Coke Red", "spec": "C0 M100 Y100 K0"}, {"name": "White (enamel)", "spec": "White · opaque base"}]'::jsonb),
    ('CCE', 'CCE-02', 'Coca-Cola Zero Sugar', array[]::text[], 'Crown', 2, '[{"name": "Coke Black", "spec": "C0 M0 Y0 K100"}, {"name": "White (enamel)", "spec": "White · opaque base"}]'::jsonb),
    ('CCE', 'CCE-03', 'Sprite', array[]::text[], 'Crown · new visual', 3, '[{"name": "PANTONE 2252 C", "spec": "C100 M0 Y100 K0"}, {"name": "Black", "spec": "C0 M0 Y0 K100"}, {"name": "White (enamel)", "spec": "White · opaque base"}]'::jsonb),
    ('CCE', 'CCE-04', 'Sprite Zero', array[]::text[], 'Without sugar · new visual', 3, '[{"name": "Black", "spec": "C0 M0 Y0 K100"}, {"name": "PANTONE 2252 C", "spec": "C100 M0 Y100 K0"}, {"name": "White (enamel)", "spec": "White · opaque base"}]'::jsonb),
    ('CCE', 'CCE-05', 'Fanta Orange', array[]::text[], 'Blue crown', 3, '[{"name": "PANTONE 2728 C", "spec": "C98 M80 Y0 K0"}, {"name": "PANTONE 1655 C", "spec": "C3 M84 Y96 K2"}, {"name": "White (enamel)", "spec": "White · opaque base"}]'::jsonb),
    ('CCE', 'CCE-06', 'Fanta Pineapple', array[]::text[], '300 ml crown', 4, '[{"name": "White (enamel)", "spec": "White · opaque base"}, {"name": "PANTONE 116 C", "spec": "C0 M18 Y100 K0"}, {"name": "PANTONE 2013 C", "spec": "C0 M48 Y100 K0"}, {"name": "PANTONE 2728 C", "spec": "C96 M78 Y0 K0"}]'::jsonb),
    ('CCE', 'CCE-07', 'Fanta Strawberry', array[]::text[], 'Crown · 2026', 3, '[{"name": "PANTONE 185 C", "spec": "C0 M99 Y86 K1"}, {"name": "PANTONE 207 C", "spec": "C0 M100 Y56 K29"}, {"name": "PANTONE 2728 C", "spec": "C97 M76 Y0 K0"}]'::jsonb),
    ('CCE', 'CCE-08', 'Ambo', array[]::text[], 'Sparkling water crown', 2, '[{"name": "PANTONE 2196 C (blue)", "spec": "C98 M73 Y0 K4"}, {"name": "White (enamel)", "spec": "White · opaque base"}]'::jsonb),
    ('DAS', 'DAS-01', 'Dashen Beer', array['dashen']::text[], 'Genuine Ethiopian beer', 3, '[{"name": "PANTONE 485 C", "spec": "C1 M98 Y100 K0"}, {"name": "PANTONE 2300 C (verde)", "spec": "C45 M0 Y100 K0"}, {"name": "White enamel", "spec": "White · opaque base"}]'::jsonb),
    ('DAS', 'DAS-02', 'Balageru', array[]::text[], 'Option C1.1 · blue, gold, white', 3, '[{"name": "White (enamel)", "spec": "White · opaque base"}, {"name": "Balageru Blue (PANTONE P 103-8 C)", "spec": "C99 M81 Y0 K21"}, {"name": "Gold (PANTONE 8365 C, metallic)", "spec": "C36 M40 Y89 K9"}]'::jsonb),
    ('HAB', 'HAB-01', 'Habesha', array[]::text[], 'Crown cork', 4, '[{"name": "PANTONE 871 C (gold)", "spec": "C45 M45 Y74 K17"}, {"name": "PANTONE 464 C", "spec": "C33 M64 Y96 K24"}, {"name": "PANTONE Black C", "spec": "C30 M30 Y30 K100"}, {"name": "White (face)", "spec": "White · opaque base"}]'::jsonb),
    ('HAB', 'HAB-02', 'Habesha Kostara Team', array['habeshakostara', 'kostara']::text[], 'Crown cork design', 4, '[{"name": "PANTONE 871 C (gold)", "spec": "C45 M45 Y74 K17"}, {"name": "PANTONE 464 C", "spec": "C33 M64 Y96 K24"}, {"name": "PANTONE Black C", "spec": "C30 M30 Y30 K100"}, {"name": "White (face)", "spec": "White · opaque base"}]'::jsonb),
    ('HAB', 'HAB-03', 'Kidame', array[]::text[], 'Beer cork artwork', 3, '[{"name": "PANTONE 5473 C · Blue Enchantment", "spec": "C91 M50 Y40 K16"}, {"name": "Light teal", "spec": "C81 M40 Y36 K7"}, {"name": "PANTONE 1245 C · Tawny Olive (gold)", "spec": "C0 M25 Y76 K24"}]'::jsonb),
    ('HAB', 'HAB-04', 'Negus', array[]::text[], 'Malt cork design', 2, '[{"name": "PANTONE Black 4 C · Root Brew", "spec": "C34 M62 Y100 K88"}, {"name": "PANTONE 2005 C · Honda Beige", "spec": "C5 M19 Y55 K0"}]'::jsonb),
    ('HAB', 'HAB-05', 'Feta', array[]::text[], 'Beer cap design', 4, '[{"name": "PANTONE 7621 C", "spec": "C20 M99 Y93 K11"}, {"name": "Black", "spec": "C0 M0 Y0 K100"}, {"name": "Metallic Gold", "spec": "C25 M41 Y93 K15"}, {"name": "Metallic Silver", "spec": "C31 M21 Y22 K0"}]'::jsonb),
    ('KOM', 'KOM-01', 'Masho Giger', array[]::text[], 'Crown cork', 2, '[{"name": "PANTONE 228 C", "spec": "C15 M100 Y1 K42"}, {"name": "PANTONE 7443 C (background)", "spec": "C16 M15 Y6 K0"}]'::jsonb),
    ('KOM', 'KOM-02', 'Masho Juniper', array[]::text[], 'Crown cork', 2, '[{"name": "PANTONE 2597 C", "spec": "C81 M100 Y0 K0"}, {"name": "PANTONE 5455 C (background)", "spec": "C31 M14 Y14 K0"}]'::jsonb),
    ('KEG', 'KEG-01', 'Kegna', array['kegna3colour']::text[], 'Premium lager · 3-colour', 3, '[{"name": "Spot Blue (专兰)", "spec": "C95 M70 Y43 K32"}, {"name": "Spot Red (专红)", "spec": "C20 M99 Y90 K10"}, {"name": "Spot Gold (专金)", "spec": "C24 M40 Y64 K2"}]'::jsonb),
    ('KEG', 'KEG-02', 'Awash Malt', array['awash']::text[], 'Cork logo', 6, '[{"name": "PANTONE 7625 C", "spec": "C0 M86 Y78 K8"}, {"name": "PANTONE 1815 C", "spec": "C7 M93 Y81 K59"}, {"name": "PANTONE 5473 C", "spec": "C90 M37 Y33 K40"}, {"name": "PANTONE 7477 C", "spec": "C95 M35 Y33 K67"}, {"name": "PANTONE Cool Gray 5 C", "spec": "C33 M25 Y26 K2"}, {"name": "White (enamel)", "spec": "White · opaque base"}]'::jsonb);

drop table if exists catalogue_report;
create temp table catalogue_report (code text, customer text, brand text, plates int, done text);

do $$
declare
  d record;
  v_company uuid;
  v_company_new boolean;
  v_brand uuid;
  v_brand_code text;
  v_done text;
  v_code text;
  v_keys text[];
begin
  -- A fresh database (migrations before any customer): nothing to match yet.
  if not exists (select 1 from public.companies) then
    insert into catalogue_report (done) values ('Nothing loaded: no customers yet. Run this file again once they are in.');
    return;
  end if;
  for d in select x.*, c.pattern, c.name as company_name, c.code as company_code from catalogue_designs x join catalogue_customers c using (prefix) order by x.code loop
    -- The customer: on the list (active first, the one with the most orders), else added.
    select c.id into v_company from public.companies c
    where lower(c.name) ~ d.pattern
    order by c.active desc, (select count(*) from public.orders o where o.company_id = c.id) desc, c.created_at
    limit 1;
    v_company_new := v_company is null;
    if v_company_new then
      v_code := d.company_code;
      if exists (select 1 from public.companies where code = v_code) then
        v_code := d.company_code || '2';
      end if;
      insert into public.companies (name, code) values (d.company_name, v_code) returning id into v_company;
    end if;

    -- The brand: on the list by name or alias (its customer first), else added.
    v_keys := array_append(d.aliases, regexp_replace(lower(d.brand), '[^a-z0-9]', '', 'g'));
    select b.id, b.design_code into v_brand, v_brand_code from public.brands b
    where b.active
      and (case regexp_replace(lower(b.name), '[^a-z0-9]', '', 'g') when 'cocacola' then 'coca' else regexp_replace(lower(b.name), '[^a-z0-9]', '', 'g') end) = any (
            array(select case k when 'cocacola' then 'coca' else k end from unnest(v_keys) k))
    order by (b.company_id = v_company) desc, b.created_at
    limit 1;

    if v_brand is null then
      select b.id, b.design_code into v_brand, v_brand_code from public.brands b where b.company_id = v_company and lower(b.name) = lower(d.brand);
      if v_brand is not null then
        update public.brands set active = true where id = v_brand;
        v_done := 'brand back on the list';
      else
        insert into public.brands (company_id, name) values (v_company, d.brand) returning id into v_brand;
        v_brand_code := null;
        v_done := 'brand added';
      end if;
    else
      v_done := 'matched';
    end if;
    if v_company_new then
      v_done := 'customer and ' || v_done;
    end if;

    if v_brand_code is null or v_brand_code = d.code then
      update public.brands
      set design_code = d.code, design_note = nullif(d.note, ''), plates = d.plates, separations = d.separations
      where id = v_brand;
    else
      v_done := v_done || ', kept its own design ' || v_brand_code;
    end if;

    insert into catalogue_report
    select d.code, c.name, b.name, d.plates, v_done
    from public.brands b join public.companies c on c.id = b.company_id
    where b.id = v_brand;
  end loop;
end $$;

select code, customer, brand, plates, done from catalogue_report order by code;
