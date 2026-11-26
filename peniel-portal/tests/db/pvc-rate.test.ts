// PVC-free compound at production's figure (20261126000001): 625 kg for about
// 275 boxes of 10,000 crowns (257.5 past the camera + sorted rejects) = 0.2273 kg per 1,000.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pool } from "./helpers.ts";

after(() => pool.end());

const MIGRATION = new URL("../../supabase/migrations/20261126000001_pvc_rate_from_production.sql", import.meta.url);
const rate = async () => (await pool.query("select use_basis, use_rate::float as r from public.raw_materials where name = 'PVC-free liner compound'")).rows[0];

test("PVC-free goes by production's figure; a rate set by hand stays", async () => {
  assert.deepEqual(await rate(), { use_basis: "thousand_crowns", r: 0.2273 });
  // 625 kg makes about 2.75 million crowns.
  assert.ok(Math.abs((625 / 0.2273) * 1000 - 2_750_000) < 1000);
  await pool.query("update public.raw_materials set use_rate = 0.25 where name = 'PVC-free liner compound'");
  await pool.query(readFileSync(MIGRATION, "utf8"));
  assert.equal((await rate()).r, 0.25);
  // The earlier rate is brought up to date.
  await pool.query("update public.raw_materials set use_rate = 0.1818 where name = 'PVC-free liner compound'");
  await pool.query(readFileSync(MIGRATION, "utf8"));
  assert.equal((await rate()).r, 0.2273);
});
