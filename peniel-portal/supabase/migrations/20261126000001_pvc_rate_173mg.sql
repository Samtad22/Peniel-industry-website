-- ============================================================================
-- PVC-free liner compound: 0.173 kg per 1,000 crowns (173 mg a crown)
--
-- Peniel (26 Nov 2026): go by what a crown takes, 173 mg of compound, and
-- hold the wastage expected when ordering (the Calculator's Next shipment:
-- "Wastage to hold", 10% to start, worked down or up as the real figure
-- comes in; production saw 625 kg for about 257 to 258 boxes past the
-- camera, 270 to 280 after sorting the rejects).
--
-- Replaces the 0.1818 set by migration 20261117000008, only where the rate
-- is still that (or 0.2, or not set): a rate changed by hand in Inventory
-- stays. Applies to production entries from now on. Safe to run more than
-- once.
-- ============================================================================

update public.raw_materials
set use_basis = 'thousand_crowns', use_rate = 0.173
where ink_name is null
  and regexp_replace(lower(name), '[^a-z]', '', 'g') in ('pvcfreelinercompound', 'pvcfreecompound', 'pvcfree', 'linercompound')
  and (use_rate is null or use_rate in (0.1818, 0.2))
  and (use_basis is null or use_basis = 'thousand_crowns');

select name, use_basis, use_rate from public.raw_materials
where regexp_replace(lower(name), '[^a-z]', '', 'g') in ('pvcfreelinercompound', 'pvcfreecompound', 'pvcfree', 'linercompound');
