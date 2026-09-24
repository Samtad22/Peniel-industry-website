// Phase 3: production entries, publishing, QC inspections — and that none of
// it leaks lines, measurements or internal notes to customers.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, DSH, errorCode, HAB, HAB_ORDER_HABESHA, INTERNAL_TEXT, pool } from "./helpers.ts";

const LINE_2 = "b0000000-0000-4000-8000-000000000002";
const staff: Record<string, string> = {};
let habesha: string;
let dashen: string;

before(async () => {
  for (const role of ["admin", "sales", "production", "quality", "warehouse"] as const) {
    staff[role] = await createUser({ email: `${role}@peniel.test`, role });
  }
  habesha = await createUser({ email: "buyer3@habesha.test", role: "customer_user", companyId: HAB });
  dashen = await createUser({ email: "buyer3@dashen.test", role: "customer_user", companyId: DSH });
});

after(() => pool.end());

const entry = (db: { query: typeof pool.query }, produced: number, rejects: number, published = false) =>
  db.query(
    `insert into public.production_entries (order_id, entry_date, shift, line_id, produced_qty, reject_qty, entered_by, published)
     values ($1, '2026-09-23', 'B', $2, $3, $4, auth.uid(), $5) returning id, published_at, published_by`,
    [HAB_ORDER_HABESHA, LINE_2, produced, rejects, published],
  );

describe("production entries", () => {
  test("only admin and production can enter production", async () => {
    for (const role of ["sales", "quality", "warehouse"]) {
      assert.equal(await errorCode(as(staff[role], (db) => entry(db, 1000, 1))), "42501", role);
    }
    await as(staff.production, (db) => entry(db, 1000, 1));
  });

  test("rejects can't exceed the crowns produced", async () => {
    await as(staff.production, async (db) => {
      await assert.rejects(entry(db, 100, 101), /rejects_le_produced/);
    });
  });

  test("publishing stamps who and when; unpublishing clears it", async () => {
    await as(staff.production, async (db) => {
      const { rows } = await entry(db, 1000, 5);
      assert.equal(rows[0].published_at, null);
      const pub = await db.query(
        "update public.production_entries set published = true where id = $1 returning published_at, published_by",
        [rows[0].id],
      );
      assert.ok(pub.rows[0].published_at);
      assert.equal(pub.rows[0].published_by, staff.production);
      const un = await db.query(
        "update public.production_entries set published = false where id = $1 returning published_at",
        [rows[0].id],
      );
      assert.equal(un.rows[0].published_at, null);
      await db.query("reset role"); // the audit log is admin-only; read it as the owner
      const log = await db.query("select action from public.audit_log where entity = 'production_entries' and entity_id = $1::text order by id", [
        rows[0].id,
      ]);
      assert.deepEqual(
        log.rows.map((r) => r.action),
        ["created", "publish", "unpublish"],
      );
    });
  });

  test("a published entry can't be changed or deleted until it is unpublished", async () => {
    await as(staff.production, async (db) => {
      const { rows } = await entry(db, 1000, 5, true);
      await db.query("savepoint s");
      await assert.rejects(
        db.query("update public.production_entries set produced_qty = 2000 where id = $1", [rows[0].id]),
        /Unpublish this entry before changing it/,
      );
      await db.query("rollback to savepoint s");
      await assert.rejects(db.query("delete from public.production_entries where id = $1", [rows[0].id]), /Unpublish this entry before deleting it/);
      await db.query("rollback to savepoint s");
      await db.query("update public.production_entries set published = false where id = $1", [rows[0].id]);
      await db.query("delete from public.production_entries where id = $1", [rows[0].id]);
    });
  });

  test("customers see published totals per day with the publish time, never lines or shifts", async () => {
    await as(staff.production, async (db) => {
      await entry(db, 500_000, 1000, true);
      await entry(db, 700_000, 2000, false);
      await db.query("commit");
    });
    await as(habesha, async (db) => {
      const { rows } = await db.query(
        "select * from public.customer_daily_output where order_id = $1 and entry_date = '2026-09-23'",
        [HAB_ORDER_HABESHA],
      );
      assert.equal(rows.length, 1);
      assert.equal(Number(rows[0].produced_qty), 500_000);
      assert.ok(rows[0].published_at);
      assert.deepEqual(Object.keys(rows[0]).sort(), [
        "entry_date",
        "order_id",
        "produced_qty",
        "published_at",
        "reject_pct",
        "reject_qty",
      ]);
    });
    await as(dashen, async (db) => {
      const { rows } = await db.query("select * from public.customer_daily_output where order_id = $1", [HAB_ORDER_HABESHA]);
      assert.equal(rows.length, 0);
    });
  });
});

const inspection = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    batch_no: "B-26-0500",
    order_id: HAB_ORDER_HABESHA,
    sample_size: 2000,
    measurements: { crown_height_mm: 6.12, removal_torque: 12.9 },
    defects: { liner_voids: 9, print_misregister: 2, scratches: 0 },
    result: "on_hold",
    customer_reason: "Held for a second inspection before release.",
    internal_notes: "Line 2 die worn — check Press B.",
    published: true,
    ...extra,
  });

describe("QC inspections", () => {
  test("only admin and quality can save inspections; customers can't at all", async () => {
    for (const who of [staff.sales, staff.production, staff.warehouse, habesha]) {
      assert.equal(await errorCode(as(who, (db) => db.query("select public.qc_save_inspection($1)", [inspection()]))), "42501");
    }
    assert.equal(
      await errorCode(as(null, (db) => db.query("select public.qc_save_inspection($1)", [inspection()]))),
      "42501",
    );
  });

  test("saving works out the reject rate and keeps defect counts", async () => {
    await as(staff.quality, async (db) => {
      const { rows } = await db.query("select public.qc_save_inspection($1) as id", [inspection()]);
      const i = await db.query("select reject_pct, result, published_by from public.qc_inspections where id = $1", [rows[0].id]);
      assert.equal(Number(i.rows[0].reject_pct), 0.55);
      assert.equal(i.rows[0].published_by, staff.quality);
      const d = await db.query("select defect_type, count from public.qc_defects where inspection_id = $1 order by 1", [rows[0].id]);
      assert.deepEqual(d.rows, [
        { defect_type: "liner_voids", count: 9 },
        { defect_type: "print_misregister", count: 2 },
      ]);
      // edit: release it, counts replaced
      await db.query("select public.qc_save_inspection($1)", [
        inspection({ id: rows[0].id, result: "released", customer_reason: "", defects: { scratches: 1 } }),
      ]);
      const after = await db.query("select reject_pct, result from public.qc_inspections where id = $1", [rows[0].id]);
      assert.deepEqual(
        { pct: Number(after.rows[0].reject_pct), result: after.rows[0].result },
        { pct: 0.05, result: "released" },
      );
    });
  });

  test("a hold needs a customer reason; defects can't outnumber the sample", async () => {
    await as(staff.quality, async (db) => {
      await assert.rejects(db.query("select public.qc_save_inspection($1)", [inspection({ customer_reason: " " })]), /qc_hold_needs_customer_reason/);
    });
    await as(staff.quality, async (db) => {
      await assert.rejects(
        db.query("select public.qc_save_inspection($1)", [inspection({ sample_size: 5 })]),
        /More defects than crowns/,
      );
    });
  });

  test("customers see the published result and reason — not measurements or notes", async () => {
    await as(staff.quality, async (db) => {
      await db.query("select public.qc_save_inspection($1)", [inspection()]);
      await db.query("commit");
    });
    await as(habesha, async (db) => {
      const { rows } = await db.query("select * from public.customer_quality_batches where batch_no = 'B-26-0500'");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].customer_reason, "Held for a second inspection before release.");
      assert.ok(rows[0].published_at);
      const json = JSON.stringify(rows);
      assert.ok(!/measurements|crown_height|torque|internal_notes/.test(json));
      assert.ok(!INTERNAL_TEXT.test(json));
      const defects = await db.query("select customer_label, count from public.customer_defects_by_type where batch_no = 'B-26-0500' order by 1");
      assert.deepEqual(defects.rows, [
        { customer_label: "Liner voids", count: 9 },
        { customer_label: "Print misregister", count: 2 },
      ]);
    });
    await as(dashen, async (db) => {
      const { rows } = await db.query("select * from public.customer_quality_batches where batch_no = 'B-26-0500'");
      assert.equal(rows.length, 0);
    });
  });
});
