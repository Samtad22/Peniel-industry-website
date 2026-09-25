// Sorting is internal: the liner camera pushes crowns out on every run, the
// sorters pass or scrap them, quality records it per order and batch. Other
// staff read it; customers never see it, only the reject rate after sorting
// (the waste). Batch numbers restart per brand, so they only have to be
// unique within an order.
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

const insertSorting = (db: { query: typeof pool.query }, orderId: string, batch: string, passed: number, waste: number, on = "2026-09-24") =>
  db.query(
    `insert into public.sorting_records (order_id, batch_no, sorted_on, passed_cartons, waste_cartons, reported_by)
     values ($1, $2, $3, $4, $5, 'Garedew') returning id, inspection_id`,
    [orderId, batch, on, passed, waste],
  );

test("quality records sorting of camera rejects per order and batch; other staff read it; the audit log keeps it", async () => {
  await as(quality, async (db) => {
    // Batch 016 has no inspection: camera rejects of any run can be sorted.
    const { rows } = await insertSorting(db, HAB_ORDER_HABESHA, " 016 ", 8, 2);
    assert.equal(rows[0].inspection_id, null);
    await insertSorting(db, HAB_ORDER_HABESHA, "016", 3, 0, "2026-09-25");
    const t = await db.query(
      "select batch_no, sum(passed_cartons)::int as passed, sum(waste_cartons)::int as waste from public.sorting_records where order_id = $1 group by 1",
      [HAB_ORDER_HABESHA],
    );
    assert.deepEqual(t.rows, [{ batch_no: "016", passed: 11, waste: 2 }]);
    await db.query("commit");
  });
  const log = await pool.query("select count(*)::int as n from public.audit_log where entity = 'sorting_records' and actor = $1", [quality]);
  assert.equal(log.rows[0].n, 2);
  await as(sales, async (db) => {
    const { rows } = await db.query("select count(*)::int as n from public.sorting_records");
    assert.equal(rows[0].n, 2);
    assert.equal(await errorCode(insertSorting(db, HAB_ORDER_HABESHA, "016", 1, 0)), "42501");
  });
});

test("a report given only the inspection (screens before this change) takes its order and batch from it", async () => {
  await as(quality, async (db) => {
    const { rows } = await db.query(
      "insert into public.sorting_records (inspection_id, sorted_on, passed_cartons, waste_cartons) values ($1, '2026-09-20', 15, 1) returning order_id, batch_no",
      [heldId],
    );
    assert.deepEqual(rows[0], { order_id: HAB_ORDER_HABESHA, batch_no: "015" });
    await db.query("commit");
  });
  // Deleting the inspection keeps the sorting with its order and batch.
  const c = await pool.connect();
  try {
    const copy = await c.query("select id from public.sorting_records where inspection_id = $1", [heldId]);
    await c.query("begin");
    await c.query("delete from public.qc_inspections where id = $1", [heldId]);
    const { rows } = await c.query("select inspection_id, order_id, batch_no from public.sorting_records where id = $1", [copy.rows[0].id]);
    assert.deepEqual(rows[0], { inspection_id: null, order_id: HAB_ORDER_HABESHA, batch_no: "015" });
  } finally {
    await c.query("rollback");
    c.release();
  }
});

test("the old column name is gone: the report's Quantity is stored as passed_cartons", async () => {
  const { rows } = await pool.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'sorting_records' and column_name like '%cartons' order by 1",
  );
  assert.deepEqual(rows.map((r) => r.column_name), ["passed_cartons", "waste_cartons"]);
});

test("a report needs an order, a batch number, cartons, and whole non-negative numbers", async () => {
  for (const [orderId, batch, passed, waste, code] of [
    [HAB_ORDER_HABESHA, "016", 0, 0, "23514"],
    [HAB_ORDER_HABESHA, "016", -3, 0, "23514"],
    [HAB_ORDER_HABESHA, "  ", 1, 0, "23514"],
    [HAB_ORDER_HABESHA, null, 1, 0, "23502"],
    [null, "016", 1, 0, "23502"],
  ] as const) {
    await as(quality, async (db) => {
      assert.equal(await errorCode(insertSorting(db, orderId as string, batch as string, passed, waste)), code, `${orderId} ${batch} ${passed} ${waste}`);
    });
  }
});

test("customers see the reject rate after sorting (waste only); passed crowns never add to their produced quantity", async () => {
  const totals = await pool.query(
    "select sum(produced_qty)::bigint as produced, sum(produced_qty - reject_qty)::bigint as good from public.production_entries where order_id = $1 and published",
    [HAB_ORDER_HABESHA],
  );
  const produced = Number(totals.rows[0].produced);
  const good = Number(totals.rows[0].good);
  assert.ok(produced > 0);
  await as(habesha, async (db) => {
    const { rows } = await db.query("select completed_qty, reject_pct from public.customer_orders where id = $1", [HAB_ORDER_HABESHA]);
    // Waste so far: 2 + 0 + 1 cartons (batch 016 twice, batch 015 once).
    assert.equal(Number(rows[0].completed_qty), good);
    assert.equal(Number(rows[0].reject_pct), Math.round((100 * 3 * 10_000 * 100) / produced) / 100);
    // An order with nothing sorted has no reject rate yet.
    const feta = await db.query("select reject_pct from public.customer_orders where id = $1", [HAB_ORDER_FETA]);
    assert.equal(feta.rows[0].reject_pct, null);
    // Daily output carries no camera rejects.
    const daily = await db.query("select reject_qty, reject_pct from public.customer_daily_output where order_id = $1", [HAB_ORDER_HABESHA]);
    assert.ok(daily.rows.length > 0);
    for (const r of daily.rows) assert.deepEqual(r, { reject_qty: null, reject_pct: null });
  });
});

test("customers can't read or write sorting, and still see the batch only as on hold", async () => {
  await as(habesha, async (db) => {
    const { rows } = await db.query("select * from public.sorting_records");
    assert.equal(rows.length, 0);
    const batch = await db.query("select * from public.customer_quality_batches where id = $1", [heldId]);
    assert.equal(batch.rows.length, 1);
    assert.equal(batch.rows[0].result, "on_hold");
    for (const view of ["customer_quality_batches", "customer_orders", "customer_daily_output"]) {
      const cols = await db.query(`select * from public.${view} limit 1`);
      for (const f of cols.fields) assert.ok(!/sort|carton|waste|camera/i.test(f.name), `customer column ${view}.${f.name}`);
    }
    assert.equal(await errorCode(insertSorting(db, HAB_ORDER_HABESHA, "016", 1, 0)), "42501");
  });
  await as(null, async (db) => {
    assert.equal(await errorCode(db.query("select * from public.sorting_records")), "42501");
  });
});

test("another company's sorting never reaches this customer's reject rate", async () => {
  await as(quality, async (db) => {
    await insertSorting(db, DSH_ORDER, "015", 1, 50);
    await db.query("commit");
  });
  await as(habesha, async (db) => {
    const { rows } = await db.query("select id from public.customer_orders where id = $1", [DSH_ORDER]);
    assert.equal(rows.length, 0);
  });
});
