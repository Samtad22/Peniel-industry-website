-- ============================================================================
-- Base coat usage rates from Peniel's own figures
--
--   Transparent base coat: one barrel of 250 kg covers about 25 stillages of
--   1,400 sheets = 35,000 sheets: 250 / 35,000 = 0.00714 kg (7.14 g) a sheet.
--   White base coat: one barrel of 250 kg covers 6 to 7 stillages of 1,400
--   sheets, about 9,100 sheets (6.5 stillages): 0.0275 kg (27.5 g) a sheet.
-- These replace the Consumption Summary's 7.6 g and 25.15 g. Each stays per
-- sheet given that coat. Change them in Inventory → the base coat → Settings.
-- Safe to run more than once.
-- ============================================================================

update public.raw_materials
set use_basis = 'transparent_base_coat_sheet', use_rate = 0.00714
where ink_name is null
  and regexp_replace(lower(name), '[^a-z]', '', 'g') in ('transparentbasecoat', 'basecoattransparent');

update public.raw_materials
set use_basis = 'white_base_coat_sheet', use_rate = 0.0275
where ink_name is null
  and regexp_replace(lower(name), '[^a-z]', '', 'g') in ('whitebasecoat', 'basecoatwhite');
