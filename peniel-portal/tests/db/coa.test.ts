// The Certificate of Analysis (PIC-OF-053) visual checks are the defect
// types QC records; the design's placeholder types are retired.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, HAB, HAB_ORDER_HABESHA, pool } from "./helpers.ts";

let quality: string;
let habesha: string;

before(async () => {
  quality = await createUser({ email: "quality@coa.test", role: "quality" });
  habesha = await createUser({ email: "buyer@coa-habesha.test", role: "customer_user", companyId: HAB });
});

after(() => pool.end());

test("the active defect types are the 13 CoA visual checks, in CoA order", async () => {
  const { rows } = await pool.query("select code from public.defect_types where active order by sort_order");
  assert.deepEqual(
    rows.map((r) => r.code),
    [
      "corrosion",
      "empty_shell",
      "disc_not_adhering",
      "incomplete_liner",
      "incorrect_size",
      "bent_crowns",
      "liner_splash",
      "scratched_graphics",
      "odor",
      "off_center_graphics",
      "dirty_liner",
      "blurred_graphics",
      "lubricant_migration",
    ],
  );
});

test("an inspection records CoA defects and the customer sees them by label, not the measurements", async () => {
  await as(quality, async (db) => {
    await db.query("select public.qc_save_inspection($1)", [
      JSON.stringify({
        batch_no: "B-COA-1",
        order_id: HAB_ORDER_HABESHA,
        sample_size: 100,
        measurements: { shell_height_mm: 6.02, liner_weight_mg: 188, leaking_pressure_kgcm2: 9.1 },
        defects: { bent_crowns: 1 },
        result: "on_hold",
        customer_reason: "Held for a second inspection before release.",
        published: true,
      }),
    ]);
    await db.query("commit");
  });
  await as(habesha, async (db) => {
    const { rows } = await db.query(
      "select d.customer_label, d.count from public.customer_defects_by_type d join public.customer_quality_batches b on b.id = d.inspection_id where b.batch_no = 'B-COA-1'",
    );
    assert.deepEqual(rows.map((r) => [r.customer_label, Number(r.count)]), [["Bent crowns", 1]]);
    const all = JSON.stringify((await db.query("select * from public.customer_quality_batches where batch_no = 'B-COA-1'")).rows);
    assert.ok(!/shell_height|liner_weight|188|6\.02/.test(all), "measurements stay internal");
  });
});
