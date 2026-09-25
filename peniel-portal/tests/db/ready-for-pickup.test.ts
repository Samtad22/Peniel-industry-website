// Setting an order to Ready for pickup puts its crowns into stock, which is
// what the customer books a pickup from. Sales set the status, so Sales may
// add finished stock (but not change or remove it).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, DSH, errorCode, HAB, HAB_BRAND_HABESHA, HAB_ORDER_HABESHA, pool } from "./helpers.ts";

let sales: string;
let habesha: string;
let dashen: string;

before(async () => {
  sales = await createUser({ email: "sales@pickup.test", role: "sales" });
  habesha = await createUser({ email: "buyer@pickup-habesha.test", role: "customer_user", companyId: HAB });
  dashen = await createUser({ email: "buyer@pickup-dashen.test", role: "customer_user", companyId: DSH });
});

after(() => pool.end());

test("sales add an order's crowns to stock; the customer sees them available, other customers don't", async () => {
  const id = await as(sales, async (db) => {
    const { rows } = await db.query(
      `insert into public.finished_stock (company_id, brand_id, order_id, batch_no, quantity, location, status)
       values ($1, $2, $3, 'RFP-001', 3600000, 'Bay 2', 'available') returning id`,
      [HAB, HAB_BRAND_HABESHA, HAB_ORDER_HABESHA],
    );
    await db.query("commit");
    return rows[0].id as string;
  });
  await as(habesha, async (db) => {
    const { rows } = await db.query("select * from public.customer_finished_stock where id = $1", [id]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "available");
    assert.equal(Number(rows[0].quantity), 3600000);
    assert.ok(!("location" in rows[0]), "location stays internal");
  });
  await as(dashen, async (db) => {
    const { rows } = await db.query("select * from public.customer_finished_stock where id = $1", [id]);
    assert.equal(rows.length, 0);
  });
  // Sales can't change or remove stock once it's there.
  await as(sales, async (db) => {
    const upd = await db.query("update public.finished_stock set quantity = 1 where id = $1", [id]);
    assert.equal(upd.rowCount, 0);
    const del = await db.query("delete from public.finished_stock where id = $1", [id]);
    assert.equal(del.rowCount, 0);
  });
});

test("sales can't add stock for a brand of another customer", async () => {
  await as(sales, async (db) => {
    assert.equal(
      await errorCode(
        db.query(
          `insert into public.finished_stock (company_id, brand_id, order_id, batch_no, quantity, status)
           values ($1, $2, $3, 'RFP-X', 10, 'available')`,
          [DSH, HAB_BRAND_HABESHA, HAB_ORDER_HABESHA],
        ),
      ),
      "23503",
    );
  });
});

test("customers still can't add stock", async () => {
  await as(habesha, async (db) => {
    assert.equal(
      await errorCode(
        db.query(
          `insert into public.finished_stock (company_id, brand_id, order_id, batch_no, quantity, status)
           values ($1, $2, $3, 'RFP-C', 10, 'available')`,
          [HAB, HAB_BRAND_HABESHA, HAB_ORDER_HABESHA],
        ),
      ),
      "42501",
    );
  });
});
