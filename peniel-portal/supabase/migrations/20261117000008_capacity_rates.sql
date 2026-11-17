-- ============================================================================
-- Usage rates for tinplate and liner compound (where none is set)
--
-- The dashboard's "Production from stock" turns each material's stock into
-- the crowns it makes, from its usage rate. Two rates the main materials need:
--   * Tinplate sheet: 1 sheet per sheet into the line (exact).
--   * PVC-free liner compound: 0.1818 kg per 1,000 crowns. Peniel: a crown
--     holds 0.173 g, and 1,000 kg gives about 5.5 million good crowns once
--     the waste (about 300,000) is taken out: 1,000 kg / 5.5M. Change it in
--     Inventory → its Settings.
-- Only where the material has no rate yet (or still has the 0.2 kg first
-- set here): a rate set by hand stays.
-- Rates apply from now on (no back-dating). Safe to run more than once.
-- ============================================================================

update public.raw_materials
set use_basis = 'sheet_in', use_rate = 1
where ink_name is null and active
  and (use_basis is null or use_rate is null or use_rate = 0)
  and regexp_replace(lower(name), '[^a-z]', '', 'g') like 'tinplatesheet%';

update public.raw_materials
set use_basis = 'thousand_crowns', use_rate = 0.1818
where ink_name is null and active
  and (use_basis is null or use_rate is null or use_rate = 0 or (use_basis = 'thousand_crowns' and use_rate = 0.2))
  and regexp_replace(lower(name), '[^a-z]', '', 'g') in ('pvcfreelinercompound', 'pvcfreecompound', 'pvcfree', 'linercompound');
