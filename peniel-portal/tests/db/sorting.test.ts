// Sorting of held batches is internal: quality records it, other staff can
// read it, customers can't see it at all. Batch numbers restart per brand,
// so they only have to be unique within an order.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, DSH_ORDER, errorCode, HAB, HAB_ORDER_FETA, HAB_ORDER_HABESHA, pool } from "./helpers.ts";

let quality: string;
let sales: string;
let habesha: string;
let heldId: string;

async function inspect(user: string, batch: string, orderId: string, result: string | null = "on_hold") {
  return as(user, async (db) => {
    const { rows } = await db.query("select public.qc_save_inspection($1) as id", [
      JSON.stringify({
        batch_no: batch,
        order_id: orderId,
        sample_size: 100,
        defects: {},
        result,
        customer_reason: result === "on_hold" ? "Held for sorting before release." : "",
        published: true,
      }),
    ]);
    await db.query("commit");
    return rows[0].id as string;
  });
}

before(async () => {
  quality = await createUser({ email: "tsegaw@sorting.test", role: "quality" });
  sales = await createUser({ email: "sales@sorting.test", role: "sales" });
  habesha = await createUser({ email: "buyer@sorting-habesha.test", role: "customer_user", companyId: HAB });
  heldId = await inspect(quality, "015", HAB_ORDER_HABESHA);
});

after(() => pool.end());

test("the same batch number can be used on another order (per-brand numbering), but not twice on one order", async () => {
  const other = await inspect(quality, "015", DSH_ORDER);
  assert.ok(other && other !== heldId);
  assert.equal(await errorCode(inspect(quality, "015", HAB_ORDER_HABESHA)), "23505");
  // Other batches on the same customer's other order are fine too.
  assert.ok(await inspect(quality, "015", HAB_ORDER_FETA, "released"));
});

test("quality records sorting reports; other staff read them; the audit log keeps them", async () => {
  await as(quality, async (db) => {
    await db.query(
      `insert into public.sorting_records (inspection_id, sorted_on, passed_cartons, waste_cartons, reported_by)
       values ($1, '2026-09-09', 15, 1, 'Garedew'), ($1, '2026-09-16', 16, 0, 'Garedew')`,
      [heldId],
    );
    const { rows } = await db.query("select sum(passed_cartons)::int as passed, sum(waste_cartons)::int as waste from public.sorting_records where inspection_id = $1", [heldId]);
    assert.deepEqual(rows[0], { passed: 31, waste: 1 });
    await db.query("commit");
  });
  const log = await pool.query("select count(*)::int as n from public.audit_log where entity = 'sorting_records' and actor = $1", [quality]);
  assert.equal(log.rows[0].n, 2);
  await as(sales, async (db) => {
    const { rows } = await db.query("select count(*)::int as n from public.sorting_records");
    assert.equal(rows[0].n, 2);
    assert.equal(
      await errorCode(db.query("insert into public.sorting_records (inspection_id, passed_cartons, waste_cartons) values ($1, 1, 0)", [heldId])),
      "42501",
    );
  });
});

test("the old column name is gone: the report's Quantity is stored as passed_cartons", async () => {
  const { rows } = await pool.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'sorting_records' and column_name like '%cartons' order by 1",
  );
  assert.deepEqual(rows.map((r) => r.column_name), ["passed_cartons", "waste_cartons"]);
});

test("a report needs cartons, and whole non-negative numbers", async () => {
  await as(quality, async (db) => {
    assert.equal(
      await errorCode(db.query("insert into public.sorting_records (inspection_id, passed_cartons, waste_cartons) values ($1, 0, 0)", [heldId])),
      "23514",
    );
  });
  await as(quality, async (db) => {
    assert.equal(
      await errorCode(db.query("insert into public.sorting_records (inspection_id, passed_cartons, waste_cartons) values ($1, -3, 0)", [heldId])),
      "23514",
    );
  });
});

test("customers can't read or write sorting, and still see the batch only as on hold", async () => {
  await as(habesha, async (db) => {
    const { rows } = await db.query("select * from public.sorting_records");
    assert.equal(rows.length, 0);
    const batch = await db.query("select * from public.customer_quality_batches where id = $1", [heldId]);
    assert.equal(batch.rows.length, 1);
    assert.equal(batch.rows[0].result, "on_hold");
    for (const col of Object.keys(batch.rows[0])) assert.ok(!/sort|carton|waste/i.test(col), `customer column ${col}`);
    assert.equal(
      await errorCode(db.query("insert into public.sorting_records (inspection_id, passed_cartons, waste_cartons) values ($1, 1, 0)", [heldId])),
      "42501",
    );
  });
  await as(null, async (db) => {
    assert.equal(await errorCode(db.query("select * from public.sorting_records")), "42501");
  });
});
