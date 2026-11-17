// Produced goods entered by hand per order and batch (20261117000001): their
// total is the Quantity on the batch's Certificate of Analysis.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, errorCode, HAB, HAB_BRAND_HABESHA, HAB_ORDER_HABESHA, pool } from "./helpers.ts";

let admin: string;
let production: string;
let quality: string;
let warehouse: string;
let sales: string;
let habesha: string;
let inspection: string;

const commit = <T>(user: string, fn: (db: { query: typeof pool.query }) => Promise<T>) =>
  as(user, async (db) => {
    const r = await fn(db);
    await db.query("commit");
    return r;
  });

before(async () => {
  admin = await createUser({ email: "admin@goods.test", role: "admin" });
  production = await createUser({ email: "prod@goods.test", role: "production" });
  quality = await createUser({ email: "qc@goods.test", role: "quality" });
  warehouse = await createUser({ email: "wh@goods.test", role: "warehouse" });
  sales = await createUser({ email: "sales@goods.test", role: "sales" });
  habesha = await createUser({ email: "buyer@goods.test", role: "customer_user", companyId: HAB });
  // A released, published and signed batch the customer can open.
  inspection = await commit(quality, async (db) => {
    const { rows } = await db.query("select public.qc_save_inspection($1) as id", [
      JSON.stringify({ batch_no: "B-GOODS-1", order_id: HAB_ORDER_HABESHA, sample_size: 100, measurements: {}, defects: {}, result: "released", customer_reason: "", published: true }),
    ]);
    return rows[0].id as string;
  });
  await commit(quality, (db) => db.query("insert into public.coa_signatures (inspection_id, line, image) values ($1, 'prepared', 'data:image/png;base64,iVBORw0KGgo=')", [inspection]));
});

after(() => pool.end());

const quantity = async (user: string) => (await as(user, async (db) => (await db.query("select public.certificate_of_analysis($1) as c", [inspection])).rows[0].c))?.quantity ?? null;
const add = (user: string, batch: string, qty: number) =>
  commit(user, async (db) => (await db.query("insert into public.produced_goods (order_id, batch_no, quantity) values ($1, $2, $3) returning id", [HAB_ORDER_HABESHA, batch, qty])).rows[0].id as string);

test("the certificate shows finished stock until produced goods are recorded, then their total", async () => {
  await pool.query("insert into public.finished_stock (company_id, brand_id, order_id, batch_no, quantity) values ($1, $2, $3, 'B-GOODS-1', 400000)", [HAB, HAB_BRAND_HABESHA, HAB_ORDER_HABESHA]);
  assert.equal(Number(await quantity(quality)), 400000);
  await add(production, "B-GOODS-1", 1_200_000);
  // Several entries add up; the batch number matches without regard to case or end spaces.
  await add(quality, " b-goods-1 ", 300_000);
  assert.equal(Number(await quantity(quality)), 1_500_000);
  // The customer sees the same total on their certificate; nothing changed the signature.
  assert.equal(Number(await quantity(habesha)), 1_500_000);
  // Another batch's goods don't count.
  await add(admin, "B-GOODS-2", 999);
  assert.equal(Number(await quantity(quality)), 1_500_000);
});

test("admin, production and quality record and correct; others can't; only admin deletes", async () => {
  const id = await add(production, "B-GOODS-3", 50_000);
  await commit(quality, (db) => db.query("update public.produced_goods set quantity = 60000 where id = $1", [id]));
  assert.equal(Number((await pool.query("select quantity from public.produced_goods where id = $1", [id])).rows[0].quantity), 60000);
  for (const user of [warehouse, sales]) {
    assert.equal(await errorCode(add(user, "B-GOODS-3", 1)), "42501");
  }
  // Production can't delete (the restrictive policy): nothing happens.
  await commit(production, (db) => db.query("delete from public.produced_goods where id = $1", [id]));
  assert.equal((await pool.query("select count(*)::int as n from public.produced_goods where id = $1", [id])).rows[0].n, 1);
  await commit(admin, (db) => db.query("delete from public.produced_goods where id = $1", [id]));
  assert.equal((await pool.query("select count(*)::int as n from public.produced_goods where id = $1", [id])).rows[0].n, 0);
  // Every change is in the activity log.
  const { rows } = await pool.query("select action from public.audit_log where entity = 'produced_goods' and entity_id = $1 order by id", [id]);
  assert.deepEqual(rows.map((r) => r.action), ["created", "updated", "deleted"]);
});

test("figures are checked", async () => {
  assert.equal(await errorCode(add(production, "B-GOODS-4", 0)), "23514");
  assert.equal(await errorCode(add(production, "   ", 10)), "23514");
});

test("customers can't read the table", async () => {
  const n = await as(habesha, async (db) => (await db.query("select count(*)::int as n from public.produced_goods")).rows[0].n);
  assert.equal(n, 0);
  assert.equal(await errorCode(add(habesha, "B-GOODS-1", 5)), "42501");
});
