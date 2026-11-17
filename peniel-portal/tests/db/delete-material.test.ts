// Admin deletes an Inventory item for good, with its history (20261117000003).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, errorCode, HAB, HAB_BRAND_HABESHA, pool } from "./helpers.ts";

let admin: string;
let warehouse: string;
let production: string;
let customer: string;

const commit = <T>(user: string, fn: (db: { query: typeof pool.query }) => Promise<T>) =>
  as(user, async (db) => {
    const r = await fn(db);
    await db.query("commit");
    return r;
  });
const del = (user: string, id: string) => commit(user, async (db) => (await db.query("select public.admin_delete_material($1) as r", [id])).rows[0].r);
const exists = async (id: string) => (await pool.query("select count(*)::int as n from public.raw_materials where id = $1", [id])).rows[0].n === 1;

before(async () => {
  admin = await createUser({ email: "admin@del-mat.test", role: "admin" });
  warehouse = await createUser({ email: "wh@del-mat.test", role: "warehouse" });
  production = await createUser({ email: "prod@del-mat.test", role: "production" });
  customer = await createUser({ email: "buyer@del-mat.test", role: "customer_user", companyId: HAB });
});

after(() => pool.end());

test("only admin deletes an item; it goes with its movements and is in the activity log", async () => {
  const id = (await pool.query("insert into public.raw_materials (name, unit) values ('Duplicate varnish', 'kg') returning id")).rows[0].id as string;
  await pool.query("insert into public.raw_material_movements (material_id, quantity, reason) values ($1, 100, 'Delivery'), ($1, -30, 'Issued')", [id]);
  for (const user of [warehouse, production, customer]) {
    assert.equal(await errorCode(del(user, id)), "42501");
    // Nor straight on the table (warehouse and production may write raw materials, not delete them).
    await commit(user, (db) => db.query("delete from public.raw_materials where id = $1", [id])).catch(() => {});
    assert.ok(await exists(id));
  }
  const r = await del(admin, id);
  assert.deepEqual(r, { name: "Duplicate varnish", movements: 2, stillages: 0, samples: 0 });
  assert.equal(await exists(id), false);
  assert.equal((await pool.query("select count(*)::int as n from public.raw_material_movements where material_id = $1", [id])).rows[0].n, 0);
  const log = (await pool.query("select actor, action, before from public.audit_log where entity = 'raw_materials' and entity_id = $1", [id])).rows;
  assert.equal(log.length, 1);
  assert.equal(log[0].actor, admin);
  assert.equal(log[0].action, "deleted");
  assert.equal(log[0].before.name, "Duplicate varnish");
  assert.equal(log[0].before.movements_deleted, 2);
  // Gone already: a clear error.
  assert.equal(await errorCode(del(admin, id)), "P0002");
});

test("an ink comes out of the stillages and samples that used it; their other inks stay", async () => {
  await pool.query("update public.brands set colours = $2 where id = $1", [HAB_BRAND_HABESHA, ["PANTONE 485 C #DA291C", "Black"]]);
  const red = (await pool.query("select id from public.raw_materials where ink_name = 'PANTONE 485 C'")).rows[0].id as string;
  const black = (await pool.query("select id from public.raw_materials where ink_name = 'Black'")).rows[0].id as string;
  await pool.query("insert into public.raw_material_movements (material_id, quantity, reason) values ($1, 50, 'Delivery'), ($2, 50, 'Delivery')", [red, black]);
  await pool.query("insert into public.brand_ink_rates (brand_id, material_id, g_per_sheet) values ($1, $2, 0.8)", [HAB_BRAND_HABESHA, red]);
  const run = (
    await pool.query("insert into public.print_runs (brand_id, shift, stillage_no, sheets_printed, inks) values ($1, 'A', 'DEL-1', 1000, $2) returning id", [
      HAB_BRAND_HABESHA,
      JSON.stringify({ [red]: 800, [black]: 500 }),
    ])
  ).rows[0].id as string;
  const sample = (await pool.query("insert into public.sample_sheets (brand_id, sheets, inks) values ($1, 10, $2) returning id", [HAB_BRAND_HABESHA, JSON.stringify({ [red]: 8 })])).rows[0].id as string;
  const blackBefore = Number((await pool.query("select on_hand from public.raw_materials where id = $1", [black])).rows[0].on_hand);

  const r = await del(admin, red);
  assert.equal(r.stillages, 1);
  assert.equal(r.samples, 1);
  assert.deepEqual((await pool.query("select inks from public.print_runs where id = $1", [run])).rows[0].inks, { [black]: 500 });
  assert.deepEqual((await pool.query("select inks from public.sample_sheets where id = $1", [sample])).rows[0].inks, {});
  assert.equal((await pool.query("select count(*)::int as n from public.brand_ink_rates where material_id = $1", [red])).rows[0].n, 0);
  // The black ink's use is unchanged; the stillage can still be edited.
  assert.equal(Number((await pool.query("select on_hand from public.raw_materials where id = $1", [black])).rows[0].on_hand), blackBefore);
  await pool.query("update public.print_runs set inks = inks where id = $1", [run]);
  // The brand still prints that colour: changing its colours brings the ink back, at 0 kg.
  await pool.query("update public.brands set colours = colours || '{PANTONE 7621 C}' where id = $1", [HAB_BRAND_HABESHA]);
  assert.equal(Number((await pool.query("select on_hand from public.raw_materials where ink_name = 'PANTONE 485 C'")).rows[0].on_hand), 0);
});
