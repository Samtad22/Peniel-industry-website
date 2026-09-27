// Customers cancel their own order while Peniel hasn't confirmed it; it is final.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, DSH, errorCode, HAB, HAB_BRAND_HABESHA, pool } from "./helpers.ts";

let habesha: string;
let dashen: string;
let sales: string;

before(async () => {
  habesha = await createUser({ email: "buyer@cancel-habesha.test", role: "customer_user", companyId: HAB });
  dashen = await createUser({ email: "buyer@cancel-dashen.test", role: "customer_user", companyId: DSH });
  sales = await createUser({ email: "sales@cancel.test", role: "sales" });
});

after(() => pool.end());

const newOrder = async () =>
  (await pool.query("insert into public.orders (company_id, brand_id, po_number, quantity) values ($1, $2, 'PO-CANCEL', 500000) returning id", [HAB, HAB_BRAND_HABESHA])).rows[0].id as string;

const cancel = (user: string, id: string, reason: string | null = null) =>
  as(user, async (db) => {
    await db.query("select public.customer_cancel_order($1, $2)", [id, reason]);
    await db.query("commit");
  });

test("the customer cancels a submitted order; the timeline shows it", async () => {
  const id = await newOrder();
  await cancel(habesha, id, "Ordered the wrong brand");
  const { rows } = await pool.query("select status, customer_reason from public.orders where id = $1", [id]);
  assert.deepEqual(rows[0], { status: "cancelled", customer_reason: "Ordered the wrong brand" });
  const ev = await as(habesha, async (db) => (await db.query("select status from public.customer_order_timeline where order_id = $1 order by created_at", [id])).rows.map((r) => r.status));
  assert.deepEqual(ev, ["submitted", "cancelled"]);
  // Final: it can't be confirmed afterwards.
  assert.equal(await errorCode(pool.query("update public.orders set status = 'confirmed', confirmed_due_date = '2026-10-30' where id = $1", [id])), "23514");
});

test("not once confirmed, not another company's, not staff", async () => {
  const id = await newOrder();
  assert.equal(await errorCode(cancel(dashen, id)), "42501");
  assert.equal(await errorCode(cancel(sales, id)), "42501");
  await pool.query("update public.orders set status = 'confirmed', confirmed_due_date = '2026-10-30' where id = $1", [id]);
  assert.equal(await errorCode(cancel(habesha, id)), "23514");
  // A default reason when none is given.
  const other = await newOrder();
  await cancel(habesha, other);
  const { rows } = await pool.query("select customer_reason from public.orders where id = $1", [other]);
  assert.match(rows[0].customer_reason, /Cancelled by the customer/);
});
