-- ============================================================================
-- Tinplate of invoice PK/26017: the exact sheet count
--
-- 20261109000002 first recorded PK/26017 line 1 (non-printed tin free steel
-- sheet, 144 pallets, 299.989 t) at 1,390 sheets a pallet = 200,160 sheets.
-- The mill's inspection certificate (JIS G3315, 0.21 x 894 x 1000.5 mm,
-- delivered 16 Jul 2026) counts every pallet:
--   117 pallets x 1,390 = 162,630
--    19 pallets x 1,380 =  26,220
--     7 pallets x 1,400 =   9,800
--     1 pallet  x   528 =     528
--   144 pallets          = 199,178 sheets (982 fewer)
--
-- The delivery line is replaced by the exact one (same material, same date):
-- the stock on hand goes down by the difference. Nothing happens where the
-- delivery isn't recorded yet (20261109000002 then records the exact count
-- itself) or is already exact. Safe to run more than once.
-- ============================================================================

do $$
declare
  v_base constant text := 'Received: invoice PK/26017 of 08 Jul 2026, line 1 (';
  v_reason constant text := v_base || 'USD 750.00/t, 299.989 t, 144 pallets: 117 x 1,390, 19 x 1,380, 7 x 1,400, 1 x 528 sheets)';
  v_sheets constant numeric := 199178;
  mv record;
begin
  select * into mv from public.raw_material_movements
  where left(reason, length(v_base)) = v_base
  order by created_at
  limit 1;
  if not found or (mv.quantity = v_sheets and mv.reason = v_reason) then
    return;
  end if;
  -- The triggers keep the stock on hand in step: minus the old line, plus the exact one.
  delete from public.raw_material_movements where id = mv.id;
  insert into public.raw_material_movements (material_id, quantity, reason, created_by, created_at)
  values (mv.material_id, v_sheets, v_reason, mv.created_by, mv.created_at);
  raise notice 'PK/26017 tinplate: % sheets recorded, now % (the mill certificate''s count).', mv.quantity, v_sheets;
end $$;
