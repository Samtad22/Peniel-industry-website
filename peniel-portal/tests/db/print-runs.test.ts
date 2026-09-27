// Printed sheets are internal and their own process: one row per finished
// stillage, printed with a brand's design, tied to no order or batch.
// Production and admin record them, other staff read them, customers never
// see them.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, errorCode, HAB, HAB_BRAND_FETA, HAB_BRAND_HABESHA, HAB_ORDER_HABESHA, pool } from "./helpers.ts";

let production: string;
let sales: string;
let habesha: string;

const run = (db: { query: typeof pool.query }, extra: Record<string, unknown> = {}) => {
  const r = {
    brand_id: HAB_BRAND_HABESHA as string | null,
    run_date: "2026-09-26",
    shift: "A",
    stillage_no: "ST-014",
    colours: ["PANTONE 485 C #DA291C", "PANTONE 116 C"],
    sheets_printed: 1_410,
    sheets_spoiled: 12,
    varnish: "Gold varnish",
    lacquer: "Food-grade inside lacquer",
    oven_temp_c: 185,
    coil_lot: "TP-2291",
    ...extra,
  };
  return db.query(
    `insert into public.print_runs (brand_id, run_date, shift, stillage_no, colours, sheets_printed, sheets_spoiled, varnish, lacquer, oven_temp_c, coil_lot)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id, order_id, crowns_per_sheet`,
    [r.brand_id, r.run_date, r.shift, r.stillage_no, r.colours, r.sheets_printed, r.sheets_spoiled, r.varnish, r.lacquer, r.oven_temp_c, r.coil_lot],
  );
};

before(async () => {
  production = await createUser({ email: "print@sheets.test", role: "production" });
  sales = await createUser({ email: "sales@sheets.test", role: "sales" });
  habesha = await createUser({ email: "buyer@sheets-habesha.test", role: "customer_user", companyId: HAB });
});

after(() => pool.end());

test("production records stillages per brand, with no order; 702 crowns per sheet; the audit log keeps them", async () => {
  await as(production, async (db) => {
    const { rows: first } = await run(db);
    assert.deepEqual(first[0].order_id, null);
    assert.equal(first[0].crowns_per_sheet, 702);
    await run(db, { shift: "B", stillage_no: " ", sheets_printed: 1_402, sheets_spoiled: 8 });
    const { rows } = await db.query(
      "select count(*)::int as stillages, sum(sheets_printed)::int as good, sum(sheets_spoiled)::int as spoiled, count(stillage_no)::int as numbered from public.print_runs where brand_id = $1",
      [HAB_BRAND_HABESHA],
    );
    assert.deepEqual(rows[0], { stillages: 2, good: 2_812, spoiled: 20, numbered: 1 });
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

test("a run entered against an order (the screen before stillages) takes the order's brand", async () => {
  await as(production, async (db) => {
    const { rows } = await db.query(
      `insert into public.print_runs (order_id, shift, sheets_printed, crowns_per_sheet) values ($1, 'A', 1400, 702) returning brand_id`,
      [HAB_ORDER_HABESHA],
    );
    assert.equal(rows[0].brand_id, HAB_BRAND_HABESHA);
  });
});

test("a stillage needs a brand, sheets, a known shift and a sensible oven temperature", async () => {
  for (const [extra, code] of [
    [{ brand_id: null }, "23502"],
    [{ sheets_printed: 0, sheets_spoiled: 0 }, "23514"],
    [{ sheets_printed: -1 }, "23514"],
    [{ shift: "D" }, "23514"],
    [{ oven_temp_c: 900 }, "23514"],
    [{ brand_id: HAB_BRAND_FETA, stillage_no: "x".repeat(41) }, "23514"],
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

test("each stillage goes through the oven for varnish, then lacquer, once each", async () => {
  let stillage = "";
  await as(production, async (db) => {
    const { rows } = await run(db, { stillage_no: "ST-100" });
    stillage = rows[0].id;
    // Lacquer can't come before the varnish is out of the oven.
    assert.equal(await errorCode(db.query("insert into public.stillage_passes (print_run_id, stage) values ($1, 'lacquer')", [stillage])), "23514");
  });
  await as(production, async (db) => {
    await db.query("insert into public.print_runs (id, brand_id, shift, sheets_printed) values ($1, $2, 'A', 1410)", [stillage, HAB_BRAND_HABESHA]);
    // In the oven: no finish time yet.
    const { rows } = await db.query(
      "insert into public.stillage_passes (print_run_id, stage, material, oven_temp_c, started_at) values ($1, 'varnish', ' Gold varnish ', 185, '2026-09-26T08:00:00Z') returning id, material",
      [stillage],
    );
    assert.equal(rows[0].material, "Gold varnish");
    assert.equal(await errorCode(db.query("insert into public.stillage_passes (print_run_id, stage) values ($1, 'lacquer')", [stillage])), "23514");
  });
  await as(production, async (db) => {
    await db.query("insert into public.print_runs (id, brand_id, shift, sheets_printed) values ($1, $2, 'A', 1410)", [stillage, HAB_BRAND_HABESHA]);
    await db.query("insert into public.stillage_passes (print_run_id, stage, started_at) values ($1, 'varnish', '2026-09-26T08:00:00Z')", [stillage]);
    // Out before in is refused; 30 minutes later is fine.
    assert.equal(
      await errorCode(db.query("update public.stillage_passes set finished_at = '2026-09-26T07:59:00Z' where print_run_id = $1", [stillage])),
      "23514",
    );
  });
  await as(production, async (db) => {
    await db.query("insert into public.print_runs (id, brand_id, shift, sheets_printed) values ($1, $2, 'A', 1410)", [stillage, HAB_BRAND_HABESHA]);
    await db.query(
      "insert into public.stillage_passes (print_run_id, stage, started_at, finished_at, sheets_spoiled) values ($1, 'varnish', '2026-09-26T08:00:00Z', '2026-09-26T08:30:00Z', 3)",
      [stillage],
    );
    await db.query("insert into public.stillage_passes (print_run_id, stage, material, started_at) values ($1, 'lacquer', 'Inside lacquer', '2026-09-26T08:40:00Z')", [stillage]);
    // Once each.
    assert.equal(await errorCode(db.query("insert into public.stillage_passes (print_run_id, stage) values ($1, 'varnish')", [stillage])), "23505");
  });
});

test("oven passes: other staff read, customers see nothing", async () => {
  await as(production, async (db) => {
    const { rows } = await run(db, { stillage_no: "ST-200" });
    await db.query("insert into public.stillage_passes (print_run_id, stage, finished_at) values ($1, 'varnish', now())", [rows[0].id]);
    await db.query("commit");
  });
  await as(sales, async (db) => {
    const { rows } = await db.query("select count(*)::int as n from public.stillage_passes");
    assert.ok(rows[0].n >= 1);
    const del = await db.query("delete from public.stillage_passes");
    assert.equal(del.rowCount, 0);
  });
  await as(habesha, async (db) => {
    const { rows } = await db.query("select * from public.stillage_passes");
    assert.equal(rows.length, 0);
  });
});

/** The error code of one statement, without aborting the surrounding transaction. */
const fails = async (db: { query: typeof pool.query }, q: (() => Promise<unknown>) | string, params?: unknown[]) => {
  await db.query("savepoint t");
  const code = await errorCode(typeof q === "function" ? q() : db.query(q, params));
  await db.query("rollback to savepoint t");
  return code;
};

test("base coat: before printing, in the oven; printed only once it's out; then varnish and lacquer", async () => {
  await as(production, async (db) => {
    // A Habesha stillage waiting for its base coat: not printed, no printed sheets yet.
    const { rows } = await db.query(
      "insert into public.print_runs (brand_id, shift, stillage_no, sheets_printed, printed, base_sheets) values ($1, 'A', 'ST-300', 0, false, 1410) returning id",
      [HAB_BRAND_HABESHA],
    );
    const id = rows[0].id;
    // No varnish before printing.
    assert.equal(await fails(db, "insert into public.stillage_passes (print_run_id, stage) values ($1, 'varnish')", [id]), "23514");
    await db.query("insert into public.stillage_passes (print_run_id, stage, material, started_at) values ($1, 'base_coat', 'White base coat', '2026-09-26T06:00:00Z')", [id]);
    // Not printed while the base coat is in the oven.
    assert.equal(
      await fails(db, "update public.print_runs set printed = true, sheets_printed = 1400, run_date = '2026-09-26' where id = $1", [id]),
      "23514",
    );
    await db.query("update public.stillage_passes set finished_at = '2026-09-26T06:30:00Z', sheets_spoiled = 4 where print_run_id = $1", [id]);
    await db.query("update public.print_runs set printed = true, sheets_printed = 1400, sheets_spoiled = 6 where id = $1", [id]);
    // Once printed, no more base coat; varnish and lacquer follow as usual.
    assert.equal(await fails(db, "insert into public.stillage_passes (print_run_id, stage) values ($1, 'base_coat')", [id]), "23514");
    await db.query("insert into public.stillage_passes (print_run_id, stage, started_at, finished_at) values ($1, 'varnish', '2026-09-26T09:00:00Z', '2026-09-26T09:30:00Z')", [id]);
    await db.query("insert into public.stillage_passes (print_run_id, stage, started_at) values ($1, 'lacquer', '2026-09-26T10:00:00Z')", [id]);
    // Can't be "unprinted" once varnished.
    assert.equal(await fails(db, "update public.print_runs set printed = false where id = $1", [id]), "23514");
  });
  await as(production, async (db) => {
    // A printed stillage can't get a base coat afterwards.
    const { rows } = await run(db, { stillage_no: "ST-301" });
    assert.equal(await fails(db, "insert into public.stillage_passes (print_run_id, stage) values ($1, 'base_coat')", [rows[0].id]), "23514");
    // A printed stillage still needs sheets.
    assert.equal(await fails(db, () => run(db, { stillage_no: "ST-302", sheets_printed: 0, sheets_spoiled: 0 })), "23514");
  });
});

test("brands can need a white or transparent base coat; customers don't see it", async () => {
  await pool.query("update public.brands set base_coat = 'white' where id = $1", [HAB_BRAND_HABESHA]);
  assert.equal(await errorCode(pool.query("update public.brands set base_coat = 'gold' where id = $1", [HAB_BRAND_FETA])), "23514");
  await as(habesha, async (db) => {
    const { rows } = await db.query("select * from public.customer_brands where id = $1", [HAB_BRAND_HABESHA]);
    assert.ok(!("base_coat" in rows[0]));
  });
});
