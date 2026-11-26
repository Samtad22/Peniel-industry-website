-- ============================================================================
-- PVC-free liner compound: 0.2273 kg per 1,000 crowns
--
-- From production (26 Nov 2026): 625 kg of PVC-free compound gives 257 to
-- 258 boxes of 10,000 crowns that pass the camera, and sorting the camera
-- rejects brings back another 12 to 22: about 270 to 280 boxes in all.
-- 625 kg / 2,750,000 crowns (275 boxes) = 0.2273 kg per 1,000 crowns.
-- A production entry takes PVC for every crown pressed (produced + camera
-- rejects), so this is the rate per crown pressed; it is also close to
-- what a good crown takes after sorting. A crown holds about 0.173 g (the
-- 0.1818 set by migration 20261117000008); the rest is purging, start-up
-- and the scrap after sorting.
--
-- Only where the rate is still an earlier one (0.1818, 0.2, 0.2427) or not set: a
-- rate changed by hand in Inventory is left alone. Applies to production
-- entries from now on (earlier ones keep what they took). Safe to run more
-- than once.
-- ============================================================================

update public.raw_materials
set use_basis = 'thousand_crowns', use_rate = 0.2273
where ink_name is null
  and regexp_replace(lower(name), '[^a-z]', '', 'g') in ('pvcfreelinercompound', 'pvcfreecompound', 'pvcfree', 'linercompound')
  and (use_rate is null or use_rate in (0.1818, 0.2, 0.2427))
  and (use_basis is null or use_basis = 'thousand_crowns');

select name, use_basis, use_rate from public.raw_materials
where regexp_replace(lower(name), '[^a-z]', '', 'g') in ('pvcfreelinercompound', 'pvcfreecompound', 'pvcfree', 'linercompound');
