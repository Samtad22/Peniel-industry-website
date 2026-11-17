// Deliveries per order (20261117000007): who records them, what customers
// see, and a collected pickup adding its delivery.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, DSH, DSH_ORDER, errorCode, HAB, HAB_BRAND_HABESHA, HAB_ORDER_HABESHA, pool } from "./helpers.ts";

let admin: string;
let sales: string;
let warehouse: string;
let production: string;
let habesha: string;
let dashen: string;

const commit = <T>(user: string, fn: (db: { query: typeof pool.query }) => Promise<T>) =>
  as(user, async (db) => {
    const r = await fn(db);
    await db.query("commit");
    return r;
  });
const add = (user: string, orderId: string, qty: number, extra: Record<string, unknown> = {}) =>
  commit(user, async (db) => {
    const cols = ["order_id", "do_no", "delivered_on", "quantity", ...Object.keys(extra)];
    const vals = [orderId, "D-1", "2026-11-10", qty, ...Object.values(extra)];
    return (await db.query(`insert into public.order_deliveries (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id, company_id`, vals)).rows[0] as {
      id: string;
      company_id: string;
    };
  });

before(async () => {
  admin = await createUser({ email: "admin@deliveries.test", role: "admin" });
  sales = await createUser({ email: "sales@deliveries.test", role: "sales" });
  warehouse = await createUser({ email: "wh@deliveries.test", role: "warehouse" });
  production = await createUser({ email: "prod@deliveries.test", role: "production" });
  habesha = await createUser({ email: "buyer@deliveries.test", role: "customer_user", companyId: HAB });
  dashen = await createUser({ email: "buyer@deliveries-dsh.test", role: "customer_user", companyId: DSH });
});

after(() => pool.end());

test("sales, warehouse and admin record deliveries; the company is always the order's", async () => {
  const a = await add(sales, HAB_ORDER_HABESHA, 1_900_000);
  assert.equal(a.company_id, HAB);
  await add(warehouse, HAB_ORDER_HABESHA, 500_000, { kind: "return_exchange" });
  await add(admin, DSH_ORDER, 100_000);
  // A wrong company sent with it is replaced by the order's.
  const b = await add(sales, HAB_ORDER_HABESHA, 10_000, { company_id: DSH });
  assert.equal(b.company_id, HAB);
  for (const user of [production, habesha]) assert.equal(await errorCode(add(user, HAB_ORDER_HABESHA, 1)), "42501");
  assert.equal(await errorCode(add(sales, HAB_ORDER_HABESHA, 0)), "23514");
});

test("only admin deletes a delivery", async () => {
  const { id } = await add(sales, HAB_ORDER_HABESHA, 20_000);
  await commit(sales, (db) => db.query("delete from public.order_deliveries where id = $1", [id]));
  assert.equal((await pool.query("select count(*)::int as n from public.order_deliveries where id = $1", [id])).rows[0].n, 1);
  await commit(admin, (db) => db.query("delete from public.order_deliveries where id = $1", [id]));
  assert.equal((await pool.query("select count(*)::int as n from public.order_deliveries where id = $1", [id])).rows[0].n, 0);
});

test("customers see their own deliveries only, without notes", async () => {
  await add(sales, HAB_ORDER_HABESHA, 30_000, { notes: "Driver Abebe, truck 3" });
  const mine = await as(habesha, async (db) => (await db.query("select * from public.customer_order_deliveries")).rows);
  assert.ok(mine.length > 0);
  assert.ok(mine.every((r) => r.order_id === HAB_ORDER_HABESHA));
  assert.ok(!("notes" in mine[0]) && !("entered_by" in mine[0]) && !("company_id" in mine[0]));
  const theirs = await as(dashen, async (db) => (await db.query("select order_id from public.customer_order_deliveries")).rows);
  assert.ok(theirs.every((r) => r.order_id === DSH_ORDER));
  // Never the table itself.
  assert.equal((await as(habesha, async (db) => (await db.query("select count(*)::int as n from public.order_deliveries")).rows[0])).n, 0);
});

test("a pickup collected with a delivery note adds its delivery, once", async () => {
  const stock = (
    await pool.query(
      "insert into public.finished_stock (company_id, brand_id, order_id, batch_no, quantity) values ($1, $2, $3, 'B-DEL-9', 1200000) returning id",
      [HAB, HAB_BRAND_HABESHA, HAB_ORDER_HABESHA],
    )
  ).rows[0].id as string;
  const booking = (await pool.query("insert into public.pickup_bookings (company_id, requested_at, status) values ($1, now(), 'confirmed') returning id", [HAB])).rows[0].id as string;
  await pool.query("insert into public.pickup_booking_items (booking_id, stock_id) values ($1, $2)", [booking, stock]);
  await commit(warehouse, (db) => db.query("select public.staff_record_collection($1, 'Truck 3', 'Abebe', 'DO-0042')", [booking]));
  const { rows } = await pool.query("select kind, do_no, quantity::float as quantity, delivered_on is not null as dated from public.order_deliveries where finished_stock_id = $1", [stock]);
  assert.deepEqual(rows, [{ kind: "delivery", do_no: "DO-0042", quantity: 1200000, dated: true }]);
  // Touching the stock again doesn't add another.
  await pool.query("update public.finished_stock set collected_at = collected_at where id = $1", [stock]);
  assert.equal((await pool.query("select count(*)::int as n from public.order_deliveries where finished_stock_id = $1", [stock])).rows[0].n, 1);
});

test("deleting an order takes its deliveries with it", async () => {
  const id = (
    await pool.query("insert into public.orders (company_id, brand_id, po_number, quantity) values ($1, $2, 'PO-DEL', 1000000) returning id", [HAB, HAB_BRAND_HABESHA])
  ).rows[0].id as string;
  await add(sales, id, 10_000);
  await pool.query("delete from public.orders where id = $1", [id]);
  assert.equal((await pool.query("select count(*)::int as n from public.order_deliveries where order_id = $1", [id])).rows[0].n, 0);
});
