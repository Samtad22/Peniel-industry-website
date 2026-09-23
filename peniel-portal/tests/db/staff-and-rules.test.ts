// Staff role permissions and the business rules enforced in the database:
// customer_reason on holds / date changes, the customer timeline,
// order numbering, and the audit log (CLAUDE.md rules 4 and 7).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  as,
  createUser,
  DSH_ORDER,
  errorCode,
  HAB,
  HAB_BRAND_HABESHA,
  HAB_ORDER_FETA,
  HAB_ORDER_HABESHA,
  pool,
} from "./helpers.ts";

const staff: Record<string, string> = {};
let habesha: string;

before(async () => {
  for (const role of ["admin", "sales", "production", "quality", "warehouse"] as const) {
    staff[role] = await createUser({ email: `${role}@peniel.test`, role });
  }
  habesha = await createUser({ email: "buyer2@habesha.test", role: "customer_user", companyId: HAB });
});

after(() => pool.end());

describe("staff roles", () => {
  test("every staff role can read orders across all companies", async () => {
    for (const id of Object.values(staff)) {
      await as(id, async (db) => {
        const { rows } = await db.query("select count(distinct company_id)::int as n from public.orders");
        assert.equal(rows[0].n, 3);
      });
    }
  });

  test("staff see nothing through customer views (no company)", async () => {
    await as(staff.admin, async (db) => {
      const { rows } = await db.query("select * from public.customer_orders");
      assert.equal(rows.length, 0);
    });
  });

  test("only admin and sales can change orders", async () => {
    for (const role of ["production", "quality", "warehouse"]) {
      await as(staff[role], async (db) => {
        const r = await db.query("update public.orders set po_number = 'X' where id = $1", [DSH_ORDER]);
        assert.equal(r.rowCount, 0, `${role} updated an order`);
      });
    }
    for (const role of ["admin", "sales"]) {
      await as(staff[role], async (db) => {
        const r = await db.query("update public.orders set po_number = 'X' where id = $1", [DSH_ORDER]);
        assert.equal(r.rowCount, 1, `${role} could not update an order`);
      });
    }
  });

  test("only admin and quality can release or hold QC batches", async () => {
    for (const role of ["sales", "production", "warehouse"]) {
      await as(staff[role], async (db) => {
        const r = await db.query("update public.qc_inspections set result = 'released' where batch_no = 'B-26-0435'");
        assert.equal(r.rowCount, 0, `${role} released a batch`);
      });
    }
    await as(staff.quality, async (db) => {
      const r = await db.query("update public.qc_inspections set result = 'released' where batch_no = 'B-26-0435'");
      assert.equal(r.rowCount, 1);
    });
  });

  test("only admin and production can enter production", async () => {
    const insert = (db: import("pg").PoolClient) =>
      db.query(
        `insert into public.production_entries (order_id, entry_date, shift, line_id, produced_qty)
         values ($1, '2026-09-23', 'A', 'b0000000-0000-4000-8000-000000000001', 1000)`,
        [HAB_ORDER_HABESHA],
      );
    assert.equal(await errorCode(as(staff.sales, insert)), "42501");
    assert.equal(await errorCode(as(staff.production, insert)), null);
  });

  test("only admins can change profiles or read the audit log", async () => {
    await as(staff.sales, async (db) => {
      const r = await db.query("update public.profiles set role = 'admin' where user_id = $1", [staff.sales]);
      assert.equal(r.rowCount, 0);
      const log = await db.query("select * from public.audit_log");
      assert.equal(log.rows.length, 0);
    });
    await as(staff.admin, async (db) => {
      const log = await db.query("select count(*)::int as n from public.audit_log");
      assert.ok(log.rows[0].n > 0);
    });
  });
});

describe("order rules", () => {
  test("order numbers are PN-YY-NNNN and sequential", async () => {
    const { rows } = await pool.query("select order_no from public.orders order by order_no");
    const yy = new Intl.DateTimeFormat("en", { year: "2-digit", timeZone: "Africa/Addis_Ababa" }).format(new Date());
    rows.forEach((r, i) => assert.equal(r.order_no, `PN-${yy}-${String(i + 1).padStart(4, "0")}`));
  });

  test("putting an order on hold requires a customer_reason", async () => {
    await as(staff.sales, async (db) => {
      await db.query("update public.orders set customer_reason = null where id = $1", [HAB_ORDER_HABESHA]);
      await assert.rejects(
        db.query("update public.orders set status = 'on_hold' where id = $1", [HAB_ORDER_HABESHA]),
        /customer_reason is required/,
      );
    });
  });

  test("changing the due date requires a customer_reason", async () => {
    await as(staff.sales, async (db) => {
      await db.query("update public.orders set customer_reason = '' where id = $1", [HAB_ORDER_HABESHA]);
      await assert.rejects(
        db.query("update public.orders set revised_due_date = '2026-12-01' where id = $1", [HAB_ORDER_HABESHA]),
        /customer_reason is required/,
      );
    });
  });

  test("a QC hold requires a customer_reason", async () => {
    await as(staff.quality, async (db) => {
      await assert.rejects(
        db.query("update public.qc_inspections set result = 'on_hold' where batch_no = 'B-26-0435'"),
        /qc_hold_needs_customer_reason/,
      );
    });
  });

  test("a hold writes the timeline and the audit log; the customer sees the reason, not the notes", async () => {
    await as(staff.sales, async (db) => {
      await db.query(
        `update public.orders
         set status = 'on_hold',
             customer_reason = 'Waiting for tinplate delivery.',
             internal_notes = 'Line 2 press B bearing replaced'
         where id = $1`,
        [HAB_ORDER_HABESHA],
      );
      await db.query("commit");
    });
    // sales cannot read the audit log (admin only), so check as the owner
    const audit = await pool.query(
      `select actor, action, before ->> 'status' as b, after ->> 'status' as a
       from public.audit_log where entity = 'orders' and entity_id = $1
       order by id desc limit 1`,
      [HAB_ORDER_HABESHA],
    );
    assert.deepEqual(audit.rows[0], { actor: staff.sales, action: "hold", b: "in_production", a: "on_hold" });

    await as(habesha, async (db) => {
      const { rows } = await db.query(
        "select status, customer_reason from public.customer_order_timeline where order_id = $1 order by created_at",
        [HAB_ORDER_HABESHA],
      );
      assert.deepEqual(rows.map((r) => r.status), ["submitted", "confirmed", "scheduled", "in_production", "on_hold"]);
      assert.equal(rows.at(-1).customer_reason, "Waiting for tinplate delivery.");
      assert.ok(!JSON.stringify(rows).includes("bearing"));

      const order = await db.query("select * from public.customer_orders where id = $1", [HAB_ORDER_HABESHA]);
      assert.equal(order.rows[0].status, "on_hold");
      assert.ok(!JSON.stringify(order.rows).includes("bearing"));
    });
  });

  test("release and publish actions are audited", async () => {
    await as(staff.quality, async (db) => {
      await db.query("update public.qc_inspections set result = 'released' where batch_no = 'B-26-0435'");
      await db.query("update public.qc_inspections set published = true where batch_no = 'B-26-0435'");
      const { rows } = await db.query(
        `select action from public.audit_log a
         join public.qc_inspections i on i.id::text = a.entity_id
         where i.batch_no = 'B-26-0435' and a.actor = $1 order by a.id`,
        [staff.quality],
      );
      // quality can't read the audit log through RLS, so check as owner below
      assert.equal(rows.length, 0);
      await db.query("commit");
    });
    const { rows } = await pool.query(
      `select action from public.audit_log a
       join public.qc_inspections i on i.id::text = a.entity_id
       where i.batch_no = 'B-26-0435' and a.actor = $1 order by a.id`,
      [staff.quality],
    );
    assert.deepEqual(rows.map((r) => r.action), ["release", "publish"]);
  });

  test("the Feta hold from the seed shows its customer reason", async () => {
    await as(habesha, async (db) => {
      const { rows } = await db.query(
        "select status, customer_reason, revised_due_date::text from public.customer_orders where id = $1",
        [HAB_ORDER_FETA],
      );
      assert.deepEqual(rows[0], {
        status: "on_hold",
        customer_reason: "Waiting for your approval of the updated Feta artwork.",
        revised_due_date: "2026-10-27",
      });
    });
  });

  test("a customer's brand must match the order's company", async () => {
    assert.equal(
      await errorCode(
        as(staff.sales, (db) =>
          db.query(
            `insert into public.orders (order_no, company_id, brand_id, po_number, quantity)
             values ('x', $1, $2, 'PO', 1)`,
            ["22222222-2222-4222-8222-222222222222", HAB_BRAND_HABESHA],
          ),
        ),
      ),
      "23503",
    );
  });
});
