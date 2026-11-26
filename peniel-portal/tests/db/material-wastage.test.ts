// Wastage allowance on top of a material's rate (20261126000001): used =
// rate x (1 + wastage %). PVC-free: 173 mg a crown + 10%.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pool } from "./helpers.ts";

after(() => pool.end());

const MIGRATION = new URL("../../supabase/migrations/20261126000001_material_wastage.sql", import.meta.url);
const pvc = async () => (await pool.query("select use_basis, use_rate::float as r, waste_pct::float as w from public.raw_materials where name = 'PVC-free liner compound'")).rows[0];

test("PVC-free: 0.173 kg per 1,000 crowns + 10% wastage; a rate set by hand stays", async () => {
  assert.deepEqual(await pvc(), { use_basis: "thousand_crowns", r: 0.173, w: 10 });
  await pool.query("update public.raw_materials set use_rate = 0.25, waste_pct = 0 where name = 'PVC-free liner compound'");
  await pool.query(readFileSync(MIGRATION, "utf8"));
  assert.deepEqual(await pvc(), { use_basis: "thousand_crowns", r: 0.25, w: 0 });
  // An earlier rate is brought up to date.
  await pool.query("update public.raw_materials set use_rate = 0.1818 where name = 'PVC-free liner compound'");
  await pool.query(readFileSync(MIGRATION, "utf8"));
  assert.deepEqual(await pvc(), { use_basis: "thousand_crowns", r: 0.173, w: 10 });
});

test("automatic use takes the wastage too", async () => {
  await pool.query("update public.raw_materials set use_basis = 'sheet_in', use_rate = 1, waste_pct = 5 where name = 'Tinplate sheet 0.23 mm'");
  const id = (await pool.query("insert into public.print_runs (brand_id, shift, stillage_no, sheets_printed, sheets_spoiled, colours) select id, 'A', 'ST-W1', 1380, 20, '{}' from public.brands limit 1 returning id")).rows[0].id as string;
  const used = (
    await pool.query("select sum(quantity)::float as q from public.raw_material_movements m join public.raw_materials r on r.id = m.material_id where m.source_id = $1 and r.name = 'Tinplate sheet 0.23 mm'", [id])
  ).rows[0].q;
  assert.equal(used, -1470);
  assert.equal(Number((await pool.query("select count(*) from public.raw_materials where waste_pct < 0 or waste_pct > 100")).rows[0].count), 0);
  await assert.rejects(pool.query("update public.raw_materials set waste_pct = 120 where name = 'Box'"));
});
