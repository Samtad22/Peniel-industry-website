// Only admin deletes log entries; the people who record them still add and edit.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, HAB_BRAND_HABESHA, HAB_ORDER_HABESHA, pool } from "./helpers.ts";

let admin: string;
let production: string;
let quality: string;

before(async () => {
  admin = await createUser({ email: "boss@del.test", role: "admin" });
  production = await createUser({ email: "prod@del.test", role: "production" });
  quality = await createUser({ email: "qc@del.test", role: "quality" });
});

after(() => pool.end());

const del = (user: string, table: string, id: string) =>
  as(user, async (db) => {
    const r = await db.query(`delete from public.${table} where id = $1`, [id]);
    await db.query("commit");
    return r.rowCount;
  });

test("production and quality can't delete their entries; admin can", async () => {
  const line = (await pool.query("select id from public.production_lines where active limit 1")).rows[0].id;
  const entry = (await pool.query("insert into public.production_entries (order_id, entry_date, shift, line_id, produced_qty) values ($1, '2026-09-26', 'A', $2, 1000) returning id", [HAB_ORDER_HABESHA, line])).rows[0].id;
  const run = (await pool.query("insert into public.print_runs (brand_id, shift, sheets_printed) values ($1, 'A', 1400) returning id", [HAB_BRAND_HABESHA])).rows[0].id;
  const machine = (await pool.query("select id from public.machines where code = 'uv-dryer'")).rows[0].id;
  const job = (await pool.query("insert into public.maintenance_logs (machine_id, kind, description, started_at, finished_at) values ($1, 'cleaning', 'x', now() - interval '1 hour', now()) returning id", [machine])).rows[0].id;
  const insp = await as(quality, async (db) => {
    const { rows } = await db.query("select public.qc_save_inspection($1) as id", [JSON.stringify({ batch_no: "B-DEL", order_id: HAB_ORDER_HABESHA, sample_size: 100, measurements: {}, defects: {}, result: "", published: false })]);
    await db.query("commit");
    return rows[0].id as string;
  });

  assert.equal(await del(production, "production_entries", entry), 0);
  assert.equal(await del(production, "print_runs", run), 0);
  assert.equal(await del(production, "maintenance_logs", job), 0);
  assert.equal(await del(quality, "qc_inspections", insp), 0);

  // Editing still works for them.
  await as(production, async (db) => {
    const r = await db.query("update public.production_entries set produced_qty = 1200 where id = $1", [entry]);
    assert.equal(r.rowCount, 1);
  });
  await as(quality, async (db) => {
    await db.query("select public.qc_save_inspection($1)", [JSON.stringify({ id: insp, batch_no: "B-DEL", order_id: HAB_ORDER_HABESHA, sample_size: 100, measurements: {}, defects: { bent_crowns: 1 }, result: "", published: false })]);
  });

  assert.equal(await del(admin, "production_entries", entry), 1);
  assert.equal(await del(admin, "print_runs", run), 1);
  assert.equal(await del(admin, "maintenance_logs", job), 1);
  assert.equal(await del(admin, "qc_inspections", insp), 1);
});
