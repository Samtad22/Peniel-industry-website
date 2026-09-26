// Printed sheets (coat & print line) are internal: production and admin
// record runs, other staff read them, customers never see them.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, errorCode, HAB, HAB_ORDER_HABESHA, pool } from "./helpers.ts";

let production: string;
let sales: string;
let habesha: string;

const run = (db: { query: typeof pool.query }, extra: Record<string, unknown> = {}) => {
  const r = {
    order_id: HAB_ORDER_HABESHA,
    run_date: "2026-09-26",
    shift: "A",
    colours: ["PANTONE 485 C #DA291C", "PANTONE 116 C"],
    sheets_printed: 12_000,
    sheets_spoiled: 150,
    crowns_per_sheet: 400,
    coating: "Gold base coat",
    lacquer: "Food-grade inside lacquer",
    oven_temp_c: 185,
    coil_lot: "TP-2291",
    ...extra,
  };
  return db.query(
    `insert into public.print_runs (order_id, run_date, shift, colours, sheets_printed, sheets_spoiled, crowns_per_sheet, coating, lacquer, oven_temp_c, coil_lot)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
    [r.order_id, r.run_date, r.shift, r.colours, r.sheets_printed, r.sheets_spoiled, r.crowns_per_sheet, r.coating, r.lacquer, r.oven_temp_c, r.coil_lot],
  );
};

before(async () => {
  production = await createUser({ email: "print@sheets.test", role: "production" });
  sales = await createUser({ email: "sales@sheets.test", role: "sales" });
  habesha = await createUser({ email: "buyer@sheets-habesha.test", role: "customer_user", companyId: HAB });
});

after(() => pool.end());

test("production records print runs; the audit log keeps them; other staff read but can't write", async () => {
  await as(production, async (db) => {
    await run(db);
    await run(db, { shift: "B", sheets_printed: 10_000, sheets_spoiled: 50 });
    const { rows } = await db.query(
      "select sum(sheets_printed)::int as good, sum(sheets_spoiled)::int as spoiled, sum(sheets_printed * crowns_per_sheet)::bigint as crowns from public.print_runs where order_id = $1",
      [HAB_ORDER_HABESHA],
    );
    assert.deepEqual({ ...rows[0], crowns: Number(rows[0].crowns) }, { good: 22_000, spoiled: 200, crowns: 8_800_000 });
    await db.query("commit");
  });
  const log = await pool.query("select count(*)::int as n from public.audit_log where entity = 'print_runs' and actor = $1", [production]);
  assert.equal(log.rows[0].n, 2);
  await as(sales, async (db) => {
    const { rows } = await db.query("select count(*)::int as n from public.print_runs");
    assert.equal(rows[0].n, 2);
    assert.equal(await errorCode(run(db)), "42501");
  });
});

test("a run needs sheets, a known shift, and a sensible crowns-per-sheet and oven temperature", async () => {
  for (const [extra, code] of [
    [{ sheets_printed: 0, sheets_spoiled: 0 }, "23514"],
    [{ sheets_printed: -1 }, "23514"],
    [{ shift: "D" }, "23514"],
    [{ crowns_per_sheet: 0 }, "23514"],
    [{ oven_temp_c: 900 }, "23514"],
  ] as const) {
    await as(production, async (db) => {
      assert.equal(await errorCode(run(db, extra)), code, JSON.stringify(extra));
    });
  }
});

test("customers can't read or write print runs", async () => {
  await as(habesha, async (db) => {
    const { rows } = await db.query("select * from public.print_runs");
    assert.equal(rows.length, 0);
    assert.equal(await errorCode(run(db)), "42501");
  });
  await as(null, async (db) => {
    assert.equal(await errorCode(db.query("select * from public.print_runs")), "42501");
  });
});
