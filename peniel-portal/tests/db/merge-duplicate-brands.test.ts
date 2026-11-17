// One-off script supabase/scripts/2026-11-18_merge_duplicate_brands.sql: each
// brand on the list once (Sprite under a hand-added "Coca-Cola" customer and
// again under East Africa Bottling becomes one Sprite).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pool } from "./helpers.ts";

after(() => pool.end());

const SCRIPT = new URL("../../supabase/scripts/2026-11-18_merge_duplicate_brands.sql", import.meta.url);
const run = async () => {
  const c = await pool.connect();
  try {
    const res = await c.query(readFileSync(SCRIPT, "utf8"));
    const last = Array.isArray(res) ? res[res.length - 1] : res;
    return last.rows as { action: string; detail: string }[];
  } finally {
    c.release();
  }
};
const CCB = "44444444-4444-4444-8444-444444444444";
const EAB = "55555555-5555-4555-8555-555555555555";
const OLD_SPRITE = "b4000000-0000-4000-8000-000000000001";
const OLD_COCA = "b4000000-0000-4000-8000-000000000002";
const SPRITE = "b5000000-0000-4000-8000-000000000001";
const COCA = "b5000000-0000-4000-8000-000000000002";

test("duplicates are merged into the brand with the orders; the empty customer goes", async () => {
  await pool.query(`insert into public.companies (id, name, code) values ($1, 'Coca-Cola Bottling', 'CCB'), ($2, 'East Africa Bottling S.C.', 'EAB')`, [CCB, EAB]);
  await pool.query(
    `insert into public.brands (id, company_id, name, colours, crown_image_path) values
       ($1, $5, 'Sprite', '{"PANTONE 355 C #009639"}', 'x/sprite.png'), ($2, $5, 'Coca-Cola', '{"PANTONE 485 C"}', null),
       ($3, $6, 'Sprite', '{}', null), ($4, $6, 'Coca', '{}', null)`,
    [OLD_SPRITE, OLD_COCA, SPRITE, COCA, CCB, EAB],
  );
  await pool.query(`insert into public.orders (company_id, brand_id, po_number, quantity, status) values ($1, $2, 'P1', 35000000, 'in_production'), ($1, $3, 'P1', 44500000, 'in_production')`, [EAB, SPRITE, COCA]);
  await pool.query(`insert into public.print_runs (brand_id, shift, stillage_no, sheets_printed, colours) values ($1, 'A', 'ST-900', 1400, '{}')`, [OLD_SPRITE]);
  // A file in the old customer's artwork library: it stays there (its file is in that customer's folder).
  await pool.query(`insert into public.brand_artwork_files (brand_id, kind, title, file_path, file_name, size_bytes) values ($1, 'design', 'Sprite crown', $2, 'sprite.ai', 1000)`, [OLD_SPRITE, `${CCB}/design/sprite.ai`]);
  await pool.query(`insert into public.brand_ink_rates (brand_id, material_id, g_per_sheet) select $1, id, 2.5 from public.raw_materials where ink_name is not null order by name limit 2`, [OLD_COCA]);

  const report = await run();
  assert.deepEqual(
    report.map((r) => r.action),
    ["Merged", "Merged", "Customer taken off the list"],
  );
  assert.match(report.find((r) => r.detail.startsWith("Sprite"))!.detail, /Left on the old brand, under its customer: 1 artwork library files$/);
  const b = async (id: string) =>
    (
      await pool.query(
        `select active, cardinality(colours) as colours, crown_image_path, (select count(*)::int from public.print_runs r where r.brand_id = b.id) as runs, (select count(*)::int from public.brand_ink_rates r where r.brand_id = b.id) as rates from public.brands b where id = $1`,
        [id],
      )
    ).rows[0];
  // Colours come over; the crown image (in the other customer's folder) doesn't.
  assert.deepEqual(await b(SPRITE), { active: true, colours: 1, crown_image_path: null, runs: 1, rates: 0 });
  assert.deepEqual(await b(COCA), { active: true, colours: 1, crown_image_path: null, runs: 0, rates: 2 });
  assert.equal((await b(OLD_SPRITE)).active, false);
  assert.equal((await b(OLD_COCA)).active, false);
  // The old customer has no brand, order or user left: off the list (its retired brand keeps the file).
  assert.equal((await pool.query("select active from public.companies where id = $1", [CCB])).rows[0].active, false);
  // Again: nothing more.
  assert.deepEqual((await run()).map((r) => r.action), ["Nothing to do"]);
});
