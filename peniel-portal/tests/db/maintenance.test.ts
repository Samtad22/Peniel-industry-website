// Maintenance: the plant's machines by section and their maintenance log.
// INTERNAL: admin and production only; customers (and other staff) read nothing.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, errorCode, HAB, pool } from "./helpers.ts";

let admin: string;
let production: string;
let sales: string;
let habesha: string;

before(async () => {
  admin = await createUser({ email: "boss@maint.test", role: "admin" });
  production = await createUser({ email: "prod@maint.test", role: "production" });
  sales = await createUser({ email: "sales@maint.test", role: "sales" });
  habesha = await createUser({ email: "buyer@maint-habesha.test", role: "customer_user", companyId: HAB });
});

after(() => pool.end());

const machine = async (code: string) =>
  (await pool.query("select id, status, status_note, parent_id from public.machines where code = $1", [code])).rows[0];

const log = (user: string, machineId: string, extra: Record<string, unknown> = {}) =>
  as(user, async (db) => {
    const cols = { machine_id: machineId, kind: "breakdown", description: "Gearbox noise", stopped_machine: true, ...extra };
    const keys = Object.keys(cols);
    const { rows } = await db.query(
      `insert into public.maintenance_logs (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
      Object.values(cols),
    );
    await db.query("commit");
    return rows[0].id as string;
  });

test("Peniel's machines are there, by section, with presses and their two liners", async () => {
  const { rows } = await pool.query("select category, count(*)::int as n from public.machines group by category order by category");
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.category, r.n])), { coating_oven: 1, ctp: 3, press: 9, printing: 2 });
  const press1 = await machine("press-1");
  assert.equal((await machine("liner-1a")).parent_id, press1.id);
  assert.equal((await machine("press-2")).status, "down");
  assert.equal((await machine("press-3")).status, "on_order");
  assert.equal((await machine("liner-2b")).status, "idle");
});

test("only admin and production read or write; customers and other staff see nothing", async () => {
  const count = (user: string) => as(user, async (db) => (await db.query("select count(*)::int as n from public.machines")).rows[0].n);
  assert.equal(await count(admin), 15);
  assert.equal(await count(production), 15);
  assert.equal(await count(sales), 0);
  assert.equal(await count(habesha), 0);
  const m = await machine("uv-dryer");
  assert.equal(await errorCode(log(sales, m.id)), "42501");
  assert.equal(await errorCode(log(habesha, m.id)), "42501");
  assert.equal(
    await errorCode(as(production, (db) => db.query("insert into public.machines (code, name, category) values ('x', 'X', 'ctp')"))),
    "42501",
    "only admin adds machines",
  );
});

test("a stopping job marks the machine down; finishing it marks it running again", async () => {
  const m = await machine("printer");
  assert.equal(m.status, "running");
  const id = await log(production, m.id);
  assert.equal((await machine("printer")).status, "down");
  // A second, non-stopping job doesn't change anything.
  const clean = await log(production, m.id, { kind: "cleaning", description: "Rollers cleaned", stopped_machine: false, started_at: "2026-09-27T08:00:00Z", finished_at: "2026-09-27T08:30:00Z" });
  assert.ok(clean);
  assert.equal((await machine("printer")).status, "down");
  await as(production, async (db) => {
    await db.query("update public.maintenance_logs set finished_at = now() where id = $1", [id]);
    await db.query("commit");
  });
  assert.equal((await machine("printer")).status, "running");
});

test("finishing the repair of a machine that was already down (Press 2) brings it back", async () => {
  const m = await machine("press-2");
  const id = await log(admin, m.id, { kind: "repair", description: "Main shaft bearing replaced" });
  assert.equal((await machine("press-2")).status, "down");
  await as(admin, async (db) => {
    await db.query("update public.maintenance_logs set finished_at = now() where id = $1", [id]);
    await db.query("commit");
  });
  const after = await machine("press-2");
  assert.equal(after.status, "running");
  assert.equal(after.status_note, null);
});

test("an idle or on-order machine keeps its status after a job without a stop", async () => {
  const m = await machine("liner-3a");
  await log(admin, m.id, { kind: "inspection", description: "Delivery check", stopped_machine: false, started_at: "2026-09-27T08:00:00Z", finished_at: "2026-09-27T08:30:00Z" });
  assert.equal((await machine("liner-3a")).status, "on_order");
});

test("a job can't finish before it started", async () => {
  const m = await machine("ctp");
  assert.equal(await errorCode(log(production, m.id, { started_at: "2026-09-27T10:00:00Z", finished_at: "2026-09-27T09:00:00Z" })), "23514");
});
