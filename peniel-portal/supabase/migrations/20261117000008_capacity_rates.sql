-- ============================================================================
-- Usage rates for tinplate and liner compound (where none is set)
--
-- The dashboard's "Production from stock" turns each material's stock into
-- the crowns it makes, from its usage rate. Two rates the main materials need:
--   * Tinplate sheet: 1 sheet per sheet into the line (exact).
--   * PVC-free liner compound: 0.2 kg per 1,000 crowns (Peniel: 1,000 kg
--     makes about 5 million crowns; the CoA's liner weight is 190 mg a crown,
--     plus a little waste). Change it in Inventory → its Settings.
-- Only where the material has no rate yet: a rate set by hand stays.
-- Rates apply from now on (no back-dating). Safe to run more than once.
-- ============================================================================

update public.raw_materials
set use_basis = 'sheet_in', use_rate = 1
where ink_name is null and active
  and (use_basis is null or use_rate is null or use_rate = 0)
  and regexp_replace(lower(name), '[^a-z]', '', 'g') like 'tinplatesheet%';

update public.raw_materials
set use_basis = 'thousand_crowns', use_rate = 0.2
where ink_name is null and active
  and (use_basis is null or use_rate is null or use_rate = 0)
  and regexp_replace(lower(name), '[^a-z]', '', 'g') in ('pvcfreelinercompound', 'pvcfreecompound', 'pvcfree', 'linercompound');
