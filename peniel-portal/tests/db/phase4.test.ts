// Phase 4: messages with internal notes, documents, proofs, stock collection
// and raw materials — and that customers only ever see their own, and never
// anything internal.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, DSH, errorCode, HAB, HAB_BRAND_FETA, HAB_ORDER_FETA, pool } from "./helpers.ts";

const NEGUS_ORDER = "c1000000-0000-4000-8000-000000000004"; // ready for pickup in the seed
const staff: Record<string, string> = {};
let habesha: string;
let dashen: string;

before(async () => {
  for (const role of ["admin", "sales", "production", "quality", "warehouse"] as const) {
    staff[role] = await createUser({ email: `${role}@p4.test`, role });
  }
  habesha = await createUser({ email: "buyer@p4-habesha.test", role: "customer_user", companyId: HAB });
  dashen = await createUser({ email: "buyer@p4-dashen.test", role: "customer_user", companyId: DSH });
});

after(() => pool.end());

describe("messages", () => {
  test("internal notes stay internal", async () => {
    const thread = await as(habesha, async (db) => {
      const { rows } = await db.query("select public.customer_send_message('Can we collect Friday?', null, 'Pickup', null) as id");
      await db.query("commit");
      return rows[0].id as string;
    });
    await as(staff.sales, async (db) => {
      await db.query(
        "insert into public.messages (thread_id, author_id, body, internal, read_by_staff) values ($1, $2, 'Bay 3 free Fri — Line 2 busy', true, true)",
        [thread, staff.sales],
      );
      await db.query("insert into public.messages (thread_id, author_id, body, read_by_staff) values ($1, $2, 'Friday 10:00 works.', true)", [
        thread,
        staff.sales,
      ]);
      await db.query("commit");
    });
    await as(habesha, async (db) => {
      const { rows } = await db.query("select body from public.customer_messages where thread_id = $1 order by created_at", [thread]);
      assert.deepEqual(
        rows.map((r) => r.body),
        ["Can we collect Friday?", "Friday 10:00 works."],
      );
    });
  });
});

describe("documents", () => {
  test("quality and warehouse can file documents; production can't", async () => {
    const doc = (db: { query: typeof pool.query }) =>
      db.query(
        `insert into public.documents (company_id, type, title, file_name, file_path, visibility, size_bytes, mime_type)
         values ($1, 'qc_certificate', 'QC B-1', 'qc.pdf', $2, 'customer', 1000, 'application/pdf')`,
        [HAB, `${HAB}/documents/x/qc.pdf`],
      );
    for (const role of ["quality", "warehouse", "sales", "admin"]) await as(staff[role], (db) => doc(db));
    assert.equal(await errorCode(as(staff.production, (db) => doc(db))), "42501");
    assert.equal(await errorCode(as(habesha, (db) => doc(db))), "42501");
  });

  test("a document must live in its company's folder", async () => {
    await as(staff.sales, async (db) => {
      await assert.rejects(
        db.query(
          `insert into public.documents (company_id, type, title, file_name, file_path, visibility)
           values ($1, 'invoice', 'x', 'x.pdf', $2, 'customer')`,
          [HAB, `${DSH}/documents/x.pdf`],
        ),
        /documents_path_in_company_folder/,
      );
    });
  });

  test("customers see their customer-visible documents with size, never internal ones or another company's", async () => {
    await as(habesha, async (db) => {
      const { rows } = await db.query("select title, size_bytes from public.customer_documents");
      assert.ok(rows.every((r) => !/calibration/i.test(r.title)));
      assert.ok(rows.length >= 1);
    });
    await as(dashen, async (db) => {
      const { rows } = await db.query("select title from public.customer_documents");
      assert.ok(rows.every((r) => /B-26-0428/.test(r.title)));
    });
  });
});

describe("proofs", () => {
  test("new proofs are numbered per brand and carry the note for the customer", async () => {
    await as(staff.sales, async (db) => {
      const { rows } = await db.query(
        `insert into public.proofs (brand_id, order_id, file_path, note, approve_by, sent_by)
         values ($1, $2, $3, 'Gold ring now 0.8 mm.', '2026-10-01', $4) returning version, file_name`,
        [HAB_BRAND_FETA, HAB_ORDER_FETA, `${HAB}/proofs/u/feta-v3.pdf`, staff.sales],
      );
      assert.deepEqual(rows[0], { version: 2, file_name: "feta-v3.pdf" });
      await db.query("commit");
    });
    await as(habesha, async (db) => {
      const { rows } = await db.query("select version, note, order_no from public.customer_proofs where version = 2");
      assert.equal(rows[0].note, "Gold ring now 0.8 mm.");
      assert.match(rows[0].order_no, /^PN-\d{2}-\d{4}$/);
    });
    await as(dashen, async (db) => {
      const { rows } = await db.query("select * from public.customer_proofs");
      assert.equal(rows.length, 0);
    });
  });

  test("only admin and sales send proofs", async () => {
    for (const role of ["production", "quality", "warehouse"]) {
      assert.equal(
        await errorCode(
          as(staff[role], (db) =>
            db.query("insert into public.proofs (brand_id, file_path) values ($1, 'x/y.pdf')", [HAB_BRAND_FETA]),
          ),
        ),
        "42501",
        role,
      );
    }
  });
});

describe("pickups and stock", () => {
  test("recording a collection: staff roles only, stock leaves the customer's view, order delivered", async () => {
    const { rows: stock } = await pool.query("select id from public.finished_stock where order_id = $1", [NEGUS_ORDER]);
    const booking = await as(habesha, async (db) => {
      const { rows } = await db.query("select public.customer_request_pickup($1, now() + interval '1 day', 'Truck 9am') as id", [
        stock.map((s) => s.id),
      ]);
      await db.query("commit");
      return rows[0].id as string;
    });
    for (const who of [habesha, staff.production, staff.quality]) {
      assert.equal(
        await errorCode(as(who, (db) => db.query("select public.staff_record_collection($1, 'AA 3-B45127', 'G. Mulu', 'DN-1')", [booking]))),
        "42501",
      );
    }
    await as(staff.warehouse, async (db) => {
      await assert.rejects(db.query("select public.staff_record_collection($1, '', '', ' ')", [booking]), /delivery note number/);
    });
    await as(staff.warehouse, async (db) => {
      await db.query("select public.staff_record_collection($1, 'AA 3-B45127', 'G. Mulu', 'DN-26-0004')", [booking]);
      await db.query("commit");
    });
    await as(habesha, async (db) => {
      const s = await db.query("select * from public.customer_finished_stock where order_id = $1", [NEGUS_ORDER]);
      assert.equal(s.rows.length, 0);
      const b = await db.query("select status, delivery_note_no from public.customer_pickup_bookings where id = $1", [booking]);
      assert.deepEqual(b.rows[0], { status: "collected", delivery_note_no: "DN-26-0004" });
      const o = await db.query("select status from public.customer_orders where id = $1", [NEGUS_ORDER]);
      assert.equal(o.rows[0].status, "delivered");
      // collected stock can't be booked again
      await assert.rejects(
        db.query("select public.customer_request_pickup($1, now() + interval '1 day')", [stock.map((x) => x.id)]),
        /not available for pickup/,
      );
    });
  });

  test("a pickup time must be in the future", async () => {
    const { rows } = await pool.query("select id from public.finished_stock where company_id = $1", [DSH]);
    await as(dashen, async (db) => {
      await assert.rejects(db.query("select public.customer_request_pickup($1, now() - interval '1 day')", [[rows[0].id]]), /in the future/);
    });
  });
});

describe("raw materials", () => {
  test("movements update the stock on hand, which can't go negative", async () => {
    const { rows } = await pool.query("select id, on_hand from public.raw_materials where name = 'Printing ink'");
    await as(staff.warehouse, async (db) => {
      await db.query("insert into public.raw_material_movements (material_id, quantity, reason, created_by) values ($1, 90, 'Received', $2)", [
        rows[0].id,
        staff.warehouse,
      ]);
      const r = await db.query("select on_hand from public.raw_materials where id = $1", [rows[0].id]);
      assert.equal(Number(r.rows[0].on_hand), Number(rows[0].on_hand) + 90);
      await assert.rejects(
        db.query("insert into public.raw_material_movements (material_id, quantity, reason) values ($1, -100000, 'Issued')", [rows[0].id]),
        /on_hand_not_negative/,
      );
    });
    assert.equal(
      await errorCode(
        as(habesha, (db) => db.query("insert into public.raw_material_movements (material_id, quantity, reason) values ($1, 1, 'x')", [rows[0].id])),
      ),
      "42501",
    );
  });
});
