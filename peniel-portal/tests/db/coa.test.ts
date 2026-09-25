// The Certificate of Analysis (PIC-OF-053) visual checks are the defect
// types QC records; the design's placeholder types are retired.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, DSH, errorCode, HAB, HAB_ORDER_HABESHA, pool } from "./helpers.ts";

let quality: string;
let habesha: string;
let dashen: string;

before(async () => {
  quality = await createUser({ email: "quality@coa.test", role: "quality" });
  habesha = await createUser({ email: "buyer@coa-habesha.test", role: "customer_user", companyId: HAB });
  dashen = await createUser({ email: "buyer@coa-dashen.test", role: "customer_user", companyId: DSH });
});

after(() => pool.end());

test("the active defect types are the 13 CoA visual checks in CoA order, then colour variation", async () => {
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
      "colour_variation",
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
    const { rows: batch } = await db.query("select * from public.customer_quality_batches where batch_no = 'B-COA-1'");
    assert.equal(batch.length, 1);
    // Check keys and values, not the raw JSON: random ids can contain digits like 188.
    assert.ok(!Object.keys(batch[0]).some((k) => /measure|shell|liner/.test(k)), "no measurement columns");
    assert.ok(!Object.values(batch[0]).some((v) => v === 188 || v === 6.02 || (typeof v === "object" && v !== null && !(v instanceof Date))), "no measurement values");
  });
});

test("certificate: the customer gets their released, published batch with CoA results only", async () => {
  const save = (batch: string, result: string, published: boolean) =>
    as(quality, async (db) => {
      const { rows } = await db.query("select public.qc_save_inspection($1) as id", [
        JSON.stringify({
          batch_no: batch,
          order_id: HAB_ORDER_HABESHA,
          sample_size: 100,
          measurements: { shell_height_mm: 6.03, liner_weight_mg: 192, press: "Press B", cpk: 1.2 },
          defects: {},
          result,
          customer_reason: result === "on_hold" ? "Held for a second inspection before release." : "",
          published,
        }),
      ]);
      await db.query("commit");
      return rows[0].id as string;
    });
  const released = await save("B-COA-REL", "released", true);
  const held = await save("B-COA-HELD", "on_hold", true);
  const unpublished = await save("B-COA-DRAFT", "released", false);

  await as(habesha, async (db) => {
    const { rows } = await db.query("select public.certificate_of_analysis($1) as c", [released]);
    const c = rows[0].c;
    assert.equal(c.batch_no, "B-COA-REL");
    assert.equal(c.final, true);
    assert.deepEqual(c.results, { shell_height_mm: 6.03, liner_weight_mg: 192 });
    assert.ok(!/Press B|cpk/.test(JSON.stringify(c)), "no press, SPC or other internal measurement keys");
    assert.equal(c.checks.length, 14);
    for (const id of [held, unpublished]) {
      const { rows: none } = await db.query("select public.certificate_of_analysis($1) as c", [id]);
      assert.equal(none[0].c, null, "held or unpublished batches have no certificate for the customer");
    }
  });
  await as(dashen, async (db) => {
    const { rows } = await db.query("select public.certificate_of_analysis($1) as c", [released]);
    assert.equal(rows[0].c, null, "another company's batch");
  });
  await as(quality, async (db) => {
    const { rows } = await db.query("select public.certificate_of_analysis($1) as c", [held]);
    assert.equal(rows[0].c.final, false, "staff see a draft for any batch");
  });
  assert.equal(
    await errorCode(as(null, (db) => db.query("select public.certificate_of_analysis($1)", [released]))),
    "42501",
  );
});
