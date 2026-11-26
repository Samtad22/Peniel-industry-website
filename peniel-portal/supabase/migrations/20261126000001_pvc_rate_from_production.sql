-- ============================================================================
-- PVC-free liner compound: 0.2427 kg per 1,000 good crowns
--
-- From production (26 Nov 2026): 625 kg of PVC-free compound gives 257 to
-- 258 boxes of 10,000 good crowns (about 2.575 million), waste and purging
-- included: 625 / 2,575 = 0.2427 kg per 1,000 crowns. A crown holds about
-- 0.173 g (the 0.1818 set by migration 20261117000008); what the final
-- product takes, waste included, is what stock and orders go by.
--
-- Only where the rate is still the earlier one (0.1818 or 0.2) or not set: a
-- rate changed by hand in Inventory is left alone. Applies to production
-- entries from now on (earlier ones keep what they took). Safe to run more
-- than once.
-- ============================================================================

update public.raw_materials
set use_basis = 'thousand_crowns', use_rate = 0.2427
where ink_name is null
  and regexp_replace(lower(name), '[^a-z]', '', 'g') in ('pvcfreelinercompound', 'pvcfreecompound', 'pvcfree', 'linercompound')
  and (use_rate is null or use_rate in (0.1818, 0.2))
  and (use_basis is null or use_basis = 'thousand_crowns');

select name, use_basis, use_rate from public.raw_materials
where regexp_replace(lower(name), '[^a-z]', '', 'g') in ('pvcfreelinercompound', 'pvcfreecompound', 'pvcfree', 'linercompound');
