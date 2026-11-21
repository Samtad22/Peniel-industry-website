// One-off script supabase/scripts/2026-11-21_ink_cleanup.sql: 6614's brand
// rates move to H9208; colour-made inks with no stock of their own go off the list.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HAB_BRAND_FETA, HAB_BRAND_HABESHA, pool } from "./helpers.ts";

after(() => pool.end());

const run = async (file: string) => {
  const c = await pool.connect();
  try {
    const res = await c.query(readFileSync(new URL(`../../supabase/scripts/${file}`, import.meta.url), "utf8"));
    const last = Array.isArray(res) ? res[res.length - 1] : res;
    return last.rows as { ink: string; done: string }[];
  } finally {
    c.release();
  }
};
const ink = async (inkName: string) =>
  (await pool.query("select id, active, on_hand::float as on_hand from public.raw_materials where ink_name = $1", [inkName])).rows[0] as { id: string; active: boolean; on_hand: number };

test("6614's grams move to H9208; mixed colours with no stock go off the list at 0", async () => {
  await run("2026-11-21_stock_count_from_control_sheets.sql");
  const old = await ink("Bright Red UV-6614");
  const h9208 = await ink("Bright Red UV-H9208");
  // Habesha prints 6614 (to move); Feta already has H9208 (kept as it is).
  await pool.query("insert into public.brand_ink_rates (brand_id, material_id, g_per_sheet) values ($1, $3, 1.2), ($2, $3, 0.9), ($2, $4, 0.5)", [HAB_BRAND_HABESHA, HAB_BRAND_FETA, old.id, h9208.id]);
  await pool.query("update public.raw_materials set active = true where id = $1", [old.id]);
  // Sprite's green, made by its colours and used by printed stillages: below 0.
  await pool.query("update public.brands set colours = array['PANTONE 2252 C #00A651'] where id = $1", [HAB_BRAND_HABESHA]);
  await pool.query("update public.raw_materials set on_hand = -1.51 where ink_name = 'PANTONE 2252 C'");

  const report = await run("2026-11-21_ink_cleanup.sql");
  assert.match(report.find((r) => r.ink === "Bright Red UV-6614")!.done, /off the list; 1 brand rate\(s\) moved/);
  assert.equal(report.find((r) => r.ink === "PANTONE 2252 C")!.done, "set to 0 (was -1.51 kg) and off the list");
  const rates = (await pool.query("select brand_id, material_id, g_per_sheet::float as g from public.brand_ink_rates where material_id in ($1, $2) order by g", [old.id, h9208.id])).rows;
  assert.deepEqual(rates, [
    { brand_id: HAB_BRAND_FETA, material_id: h9208.id, g: 0.5 },
    { brand_id: HAB_BRAND_HABESHA, material_id: h9208.id, g: 1.2 },
  ]);
  assert.equal((await ink("Bright Red UV-6614")).active, false);
  assert.deepEqual(await ink("PANTONE 2252 C").then((i) => [i.active, i.on_hand]), [false, 0]);
  // Inks with their own stock stay.
  assert.equal((await ink("PANTONE 116 C")).active, true);
  assert.equal((await ink("Bright Red UV-H9208")).active, true);
  // Again: nothing more.
  assert.deepEqual((await run("2026-11-21_ink_cleanup.sql")).map((r) => r.done), ["Nothing to do"]);
});
