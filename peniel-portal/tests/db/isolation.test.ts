// Tenant isolation and internal-data tests (CLAUDE.md rules 1–3, 5).
//
// These run every query the way the Supabase API does — as the
// `authenticated` role with the user's JWT claims — so "can't fetch it here"
// means "can't fetch it through the API either". They enumerate every
// customer_* view and every base table, so new ones are covered automatically.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  as,
  baseTables,
  BGI_ORDER,
  createUser,
  customerViews,
  DSH,
  DSH_BRAND,
  DSH_ORDER,
  errorCode,
  FOREIGN_IDS,
  FORBIDDEN_COLUMNS,
  HAB,
  HAB_BRAND_FETA,
  HAB_BRAND_HABESHA,
  HAB_ORDER_FETA,
  HAB_ORDER_HABESHA,
  HAB_ORDER_NEGUS,
  INTERNAL_TEXT,
  pool,
  viewColumns,
} from "./helpers.ts";

let habesha: string;
let dashen: string;
let habeshaInactive: string;
let views: string[];

before(async () => {
  habesha = await createUser({ email: "buyer@habesha.test", role: "customer_user", companyId: HAB });
  dashen = await createUser({ email: "buyer@dashen.test", role: "customer_user", companyId: DSH });
  habeshaInactive = await createUser({
    email: "former@habesha.test",
    role: "customer_user",
    companyId: HAB,
    active: false,
  });
  views = await customerViews();
});

after(() => pool.end());

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** An attachment entry for customer_submit_order. */
const attachment = (path: string) => ({
  path,
  name: path.split("/").pop(),
  size: 1000,
  mime: "application/pdf",
  type: "purchase_order",
});

describe("customer views", () => {
  test("the spec's customer views all exist", () => {
    for (const v of [
      "customer_orders",
      "customer_order_timeline",
      "customer_order_attachments",
      "customer_daily_output",
      "customer_quality_batches",
      "customer_defects_by_type",
      "customer_finished_stock",
      "customer_proofs",
      "customer_artwork",
      "customer_documents",
    ]) {
      assert.ok(views.includes(v), `missing view ${v}`);
    }
  });

  test("no customer view exposes an internal column", async () => {
    for (const v of views) {
      const cols = (await viewColumns(v)).map((c) => c.name);
      for (const bad of FORBIDDEN_COLUMNS) {
        assert.ok(!cols.includes(bad), `${v} exposes ${bad}`);
      }
    }
  });

  test("a Habesha user cannot fetch another company's row by ID through any view", async () => {
    await as(habesha, async (db) => {
      for (const v of views) {
        const uuidCols = (await viewColumns(v)).filter((c) => c.type === "uuid").map((c) => c.name);
        for (const col of uuidCols) {
          for (const id of FOREIGN_IDS) {
            const { rows } = await db.query(`select 1 from public.${v} where ${col} = $1`, [id]);
            assert.equal(rows.length, 0, `${v}.${col} = ${id} returned a row`);
          }
        }
      }
    });
  });

  test("a Habesha user sees their own data, and none of anyone else's", async () => {
    await as(habesha, async (db) => {
      for (const v of views) {
        const { rows } = await db.query(`select * from public.${v}`);
        const json = JSON.stringify(rows);
        for (const id of FOREIGN_IDS) {
          assert.ok(!json.includes(id), `${v} leaked ${id}`);
        }
        assert.ok(!json.includes("Dashen") && !json.includes("St. George"), `${v} leaked a foreign brand`);
      }
      const { rows: orders } = await db.query("select order_no, brand_name from public.customer_orders");
      assert.equal(orders.length, 4);
    });
  });

  test("no customer view returns internal text (lines, presses, OEE, locations, notes)", async () => {
    for (const user of [habesha, dashen]) {
      await as(user, async (db) => {
        for (const v of views) {
          const { rows } = await db.query(`select * from public.${v}`);
          const json = JSON.stringify(rows);
          assert.ok(!INTERNAL_TEXT.test(json), `${v} returned internal text: ${json.match(INTERNAL_TEXT)?.[0]}`);
        }
      });
    }
  });

  test("unpublished production and QC data stays hidden", async () => {
    await as(habesha, async (db) => {
      const out = await db.query(
        "select entry_date::text from public.customer_daily_output where order_id = $1 order by 1",
        [HAB_ORDER_HABESHA],
      );
      assert.deepEqual(out.rows.map((r) => r.entry_date), ["2026-09-20", "2026-09-21"]);

      const batches = await db.query("select batch_no from public.customer_quality_batches order by 1");
      assert.deepEqual(batches.rows.map((r) => r.batch_no), ["B-26-0412", "B-26-0431"]);

      const defects = await db.query("select distinct batch_no from public.customer_defects_by_type");
      assert.ok(!defects.rows.some((r) => r.batch_no === "B-26-0435"));
    });
  });

  test("daily output is summed across lines and shifts", async () => {
    await as(habesha, async (db) => {
      const { rows } = await db.query(
        `select produced_qty::int, reject_qty::int from public.customer_daily_output
         where order_id = $1 and entry_date = '2026-09-20'`,
        [HAB_ORDER_HABESHA],
      );
      assert.deepEqual(rows, [{ produced_qty: 2830000, reject_qty: 17800 }]);
    });
  });

  test("internal documents are not listed", async () => {
    await as(habesha, async (db) => {
      const { rows } = await db.query("select title from public.customer_documents");
      assert.deepEqual(rows.map((r) => r.title), ["Certificate of analysis — B-26-0412"]);
    });
  });

  test("customer views are read-only", async () => {
    for (const v of views) {
      const { rows } = await pool.query(
        `select privilege_type from information_schema.role_table_grants
         where table_schema = 'public' and table_name = $1 and grantee in ('authenticated', 'anon', 'PUBLIC')`,
        [v],
      );
      assert.deepEqual(rows.map((r) => r.privilege_type), ["SELECT"], `${v} grants ${JSON.stringify(rows)}`);

      const cols = await viewColumns(v);
      const col = (cols.find((c) => c.name === "id") ?? cols[0]).name;
      for (const sql of [
        `update public.${v} set ${col} = ${col}`,
        `delete from public.${v}`,
        `insert into public.${v} default values`,
      ]) {
        assert.notEqual(await errorCode(as(habesha, (db) => db.query(sql))), null, `allowed: ${sql}`);
      }
    }
  });

  test("an inactive customer user sees nothing", async () => {
    await as(habeshaInactive, async (db) => {
      for (const v of views) {
        const { rows } = await db.query(`select * from public.${v}`);
        assert.equal(rows.length, 0, `${v} returned rows to an inactive user`);
      }
    });
  });
});

describe("base tables", () => {
  test("a customer reads nothing from any base table, except their own profile", async () => {
    await as(habesha, async (db) => {
      for (const t of await baseTables()) {
        const { rows } = await db.query(`select * from public.${t}`);
        if (t === "profiles") {
          assert.equal(rows.length, 1);
          assert.equal(rows[0].user_id, habesha);
        } else {
          assert.equal(rows.length, 0, `customer read ${rows.length} rows from ${t}`);
        }
      }
    });
  });

  test("a Habesha user cannot fetch any order by ID directly — theirs or anyone else's", async () => {
    await as(habesha, async (db) => {
      for (const id of [DSH_ORDER, BGI_ORDER, HAB_ORDER_HABESHA]) {
        const { rows } = await db.query("select * from public.orders where id = $1", [id]);
        assert.equal(rows.length, 0);
      }
    });
  });

  test("a customer cannot insert, update or delete base tables", async () => {
    assert.equal(
      await errorCode(
        as(habesha, (db) =>
          db.query(
            `insert into public.orders (order_no, company_id, brand_id, po_number, quantity)
             values ('X', $1, $2, 'PO', 1)`,
            [HAB, HAB_BRAND_HABESHA],
          ),
        ),
      ),
      "42501",
    );
    await as(habesha, async (db) => {
      const upd = await db.query("update public.orders set status = 'delivered' where id = $1", [HAB_ORDER_FETA]);
      assert.equal(upd.rowCount, 0);
      const del = await db.query("delete from public.orders where id = $1", [DSH_ORDER]);
      assert.equal(del.rowCount, 0);
      const prof = await db.query("update public.profiles set role = 'admin' where user_id = $1", [habesha]);
      assert.equal(prof.rowCount, 0);
    });
    const { rows } = await pool.query("select role from public.profiles where user_id = $1", [habesha]);
    assert.equal(rows[0].role, "customer_user");
  });

  test("the audit log is invisible to customers", async () => {
    await as(habesha, async (db) => {
      const { rows } = await db.query("select * from public.audit_log");
      assert.equal(rows.length, 0);
    });
  });
});

describe("signed-out (anon) access", () => {
  test("anon cannot read any view or table", async () => {
    for (const rel of [...views, ...(await baseTables())]) {
      assert.equal(
        await errorCode(as(null, (db) => db.query(`select * from public.${rel} limit 1`))),
        "42501",
        `anon could read ${rel}`,
      );
    }
  });

  test("anon cannot call customer functions", async () => {
    assert.equal(
      await errorCode(
        as(null, (db) =>
          db.query("select * from public.customer_submit_order($1, 'PO', 1, null, 'pickup', null, '[]')", [
            HAB_BRAND_HABESHA,
          ]),
        ),
      ),
      "42501",
    );
  });
});

describe("customer write functions", () => {
  test("no customer function returns an internal column", async () => {
    const { rows } = await pool.query<{ proname: string; args: string | null }>(
      `select proname, array_to_string(proargnames, ',') as args
       from pg_proc where pronamespace = 'public'::regnamespace and proname like 'customer\\_%'`,
    );
    assert.ok(rows.length >= 5);
    for (const r of rows) {
      for (const bad of FORBIDDEN_COLUMNS) {
        assert.ok(!(r.args ?? "").split(",").includes(bad), `${r.proname} returns ${bad}`);
      }
    }
  });

  test("submit order: own brand with an uploaded PO works and is always `submitted`", async () => {
    const po = `${HAB}/uploads/u1/HB-PO-9.pdf`;
    await as(habesha, async (db) => {
      await db.query("insert into storage.objects (bucket_id, name) values ('order-attachments', $1)", [po]);
      const { rows } = await db.query(
        "select * from public.customer_submit_order($1, ' HB-PO-9 ', 1000000, null, 'pickup', null, $2)",
        [HAB_BRAND_FETA, JSON.stringify([attachment(po)])],
      );
      assert.match(rows[0].order_no, /^PN-\d{2}-\d{4}$/);
      const mine = await db.query("select status, po_number from public.customer_orders where id = $1", [rows[0].id]);
      assert.deepEqual(mine.rows[0], { status: "submitted", po_number: "HB-PO-9" });
      const files = await db.query("select file_name, type from public.customer_order_attachments where order_id = $1", [
        rows[0].id,
      ]);
      assert.deepEqual(files.rows, [{ file_name: "HB-PO-9.pdf", type: "purchase_order" }]);
    });
  });

  test("submit order: another company's brand is refused", async () => {
    const po = `${HAB}/uploads/u2/po.pdf`;
    for (const brand of [DSH_BRAND, "00000000-0000-4000-8000-000000000000"]) {
      assert.equal(
        await errorCode(
          as(habesha, async (db) => {
            await db.query("insert into storage.objects (bucket_id, name) values ('order-attachments', $1)", [po]);
            return db.query("select * from public.customer_submit_order($1, 'PO', 1, null, 'pickup', null, $2)", [
              brand,
              JSON.stringify([attachment(po)]),
            ]);
          }),
        ),
        "42501",
      );
    }
  });

  test("submit order: a purchase order file is required", async () => {
    const spec = `${HAB}/uploads/u3/spec.xlsx`;
    await as(habesha, async (db) => {
      await db.query("insert into storage.objects (bucket_id, name) values ('order-attachments', $1)", [spec]);
      await assert.rejects(
        db.query("select * from public.customer_submit_order($1, 'PO', 1, null, 'pickup', null, $2)", [
          HAB_BRAND_FETA,
          JSON.stringify([{ ...attachment(spec), type: "specification", mime: XLSX }]),
        ]),
        /Attach your purchase order/,
      );
    });
    await as(habesha, async (db) => {
      await assert.rejects(
        db.query("select * from public.customer_submit_order($1, 'PO', 1, null, 'pickup', null, '[]')", [HAB_BRAND_FETA]),
        /Attach your purchase order/,
      );
    });
  });

  test("submit order: files must be in your own company folder and really uploaded", async () => {
    // Dashen's file exists, but is not Habesha's to attach.
    const dashenFile = `${DSH}/uploads/d1/po.pdf`;
    await pool.query("insert into storage.objects (bucket_id, name) values ('order-attachments', $1)", [dashenFile]);
    for (const path of [dashenFile, `${HAB}/uploads/never-uploaded/po.pdf`, `${HAB}/uploads/../${DSH}/uploads/d1/po.pdf`]) {
      assert.equal(
        await errorCode(
          as(habesha, (db) =>
            db.query("select * from public.customer_submit_order($1, 'PO', 1, null, 'pickup', null, $2)", [
              HAB_BRAND_FETA,
              JSON.stringify([attachment(path)]),
            ]),
          ),
        ),
        "42501",
        `could attach ${path}`,
      );
    }
  });

  test("submit order: one PO file can go on several orders", async () => {
    const po = `${HAB}/uploads/u4/shared-po.pdf`;
    await as(habesha, async (db) => {
      await db.query("insert into storage.objects (bucket_id, name) values ('order-attachments', $1)", [po]);
      for (const brand of [HAB_BRAND_FETA, HAB_BRAND_HABESHA]) {
        await db.query("select * from public.customer_submit_order($1, 'HB-PO-10', 500000, null, 'pickup', null, $2)", [
          brand,
          JSON.stringify([attachment(po)]),
        ]);
      }
      const { rows } = await db.query("select count(*)::int as n from public.customer_order_attachments where file_path = $1", [
        po,
      ]);
      assert.equal(rows[0].n, 2);
    });
  });

  test("submit order: delivery needs an address, and dates cannot be in the past", async () => {
    const po = `${HAB}/uploads/u5/po.pdf`;
    await as(habesha, async (db) => {
      await db.query("insert into storage.objects (bucket_id, name) values ('order-attachments', $1)", [po]);
      await assert.rejects(
        db.query("select * from public.customer_submit_order($1, 'PO', 1, null, 'delivery', ' ', $2)", [
          HAB_BRAND_FETA,
          JSON.stringify([attachment(po)]),
        ]),
        /delivery address is required/,
      );
    });
    await as(habesha, async (db) => {
      await db.query("insert into storage.objects (bucket_id, name) values ('order-attachments', $1)", [po]);
      await assert.rejects(
        db.query("select * from public.customer_submit_order($1, 'PO', 1, '2020-01-01', 'pickup', null, $2)", [
          HAB_BRAND_FETA,
          JSON.stringify([attachment(po)]),
        ]),
        /in the past/,
      );
    });
  });

  test("attachments: only into your own company and order folder", async () => {
    const own = `${HAB}/${HAB_ORDER_FETA}/po.pdf`;
    await as(habesha, async (db) => {
      await db.query("insert into storage.objects (bucket_id, name) values ('order-attachments', $1)", [own]);
      const { rows } = await db.query(
        "select public.customer_add_order_attachment($1, $2, 'po.pdf', 1000, 'application/pdf') as id",
        [HAB_ORDER_FETA, own],
      );
      assert.ok(rows[0].id);
      const listed = await db.query("select file_name from public.customer_order_attachments");
      assert.deepEqual(listed.rows, [{ file_name: "po.pdf" }]);
    });

    // upload into Dashen's folder, or into own folder under Dashen's order
    for (const path of [`${DSH}/${DSH_ORDER}/x.pdf`, `${HAB}/${DSH_ORDER}/x.pdf`, `${HAB}/x.pdf`, `${DSH}/uploads/u/x.pdf`]) {
      assert.equal(
        await errorCode(
          as(habesha, (db) =>
            db.query("insert into storage.objects (bucket_id, name) values ('order-attachments', $1)", [path]),
          ),
        ),
        "42501",
        `upload to ${path} was allowed`,
      );
    }

    // register a file against someone else's order
    assert.equal(
      await errorCode(
        as(habesha, (db) =>
          db.query("select public.customer_add_order_attachment($1, $2, 'x.pdf', 10, 'application/pdf')", [
            DSH_ORDER,
            `${DSH}/${DSH_ORDER}/x.pdf`,
          ]),
        ),
      ),
      "42501",
    );
  });

  test("storage: customers cannot list or read objects directly", async () => {
    await pool.query(
      "insert into storage.objects (bucket_id, name) values ('documents', $1) on conflict do nothing",
      [`${HAB}/documents/coa-B-26-0412.pdf`],
    );
    await as(habesha, async (db) => {
      const { rows } = await db.query("select * from storage.objects");
      assert.equal(rows.length, 0);
    });
  });

  test("proofs: a customer can answer their own proof, not another company's", async () => {
    const { rows } = await pool.query("select id from public.proofs where order_id = $1", [HAB_ORDER_FETA]);
    const proof = rows[0].id;
    assert.equal(
      await errorCode(as(dashen, (db) => db.query("select public.customer_respond_to_proof($1, true)", [proof]))),
      "42501",
    );
    await as(habesha, async (db) => {
      await db.query("select public.customer_respond_to_proof($1, true)", [proof]);
      const r = await db.query("select status from public.customer_proofs where id = $1", [proof]);
      assert.equal(r.rows[0].status, "approved");
    });
  });

  test("pickups: only your own available stock", async () => {
    const { rows } = await pool.query(
      "select id, company_id from public.finished_stock order by company_id",
    );
    const own = rows.find((r) => r.company_id === HAB).id;
    const foreign = rows.find((r) => r.company_id === DSH).id;
    assert.equal(
      await errorCode(
        as(habesha, (db) => db.query("select public.customer_request_pickup($1, now())", [[foreign]])),
      ),
      "42501",
    );
    assert.equal(
      await errorCode(
        as(habesha, (db) => db.query("select public.customer_request_pickup($1, now())", [[own, foreign]])),
      ),
      "42501",
    );
    await as(habesha, async (db) => {
      await db.query("select public.customer_request_pickup($1, now(), 'Truck at 9am')", [[own]]);
      const b = await db.query("select stock_ids from public.customer_pickup_bookings");
      assert.deepEqual(b.rows[0].stock_ids, [own]);
    });
  });

  test("messages: threads are private to the company", async () => {
    // committed so the second user can see (or not see) it
    const thread = await as(habesha, async (db) => {
      const { rows } = await db.query(
        "select public.customer_send_message('When is Feta ready?', null, 'Feta order', $1) as id",
        [HAB_ORDER_FETA],
      );
      await db.query("commit");
      return rows[0].id as string;
    });

    await as(dashen, async (db) => {
      const threads = await db.query("select * from public.customer_message_threads");
      assert.equal(threads.rows.length, 0);
      const msgs = await db.query("select * from public.customer_messages");
      assert.equal(msgs.rows.length, 0);
    });
    assert.equal(
      await errorCode(as(dashen, (db) => db.query("select public.customer_send_message('hi', $1)", [thread]))),
      "42501",
    );
    // and a new thread cannot be pinned to someone else's order
    assert.equal(
      await errorCode(
        as(dashen, (db) => db.query("select public.customer_send_message('hi', null, 'x', $1)", [HAB_ORDER_NEGUS])),
      ),
      "42501",
    );
    // only your own company's conversations can be marked as read
    assert.equal(
      await errorCode(as(dashen, (db) => db.query("select public.customer_mark_thread_read($1)", [thread]))),
      "42501",
    );
    await as(habesha, async (db) => {
      await db.query("select public.customer_mark_thread_read($1)", [thread]);
      const { rows } = await db.query("select bool_and(read_by_customer) as all_read from public.customer_messages");
      assert.equal(rows[0].all_read, true);
    });
  });
});
