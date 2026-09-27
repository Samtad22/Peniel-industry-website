// Settings: staff read them, only admin changes them; changes are audited.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, errorCode, HAB, pool } from "./helpers.ts";

let admin: string;
let production: string;
let habesha: string;

before(async () => {
  admin = await createUser({ email: "boss@settings.test", role: "admin" });
  production = await createUser({ email: "prod@settings.test", role: "production" });
  habesha = await createUser({ email: "buyer@settings-habesha.test", role: "customer_user", companyId: HAB });
});

after(() => pool.end());

test("admin saves settings, staff read them, customers see nothing", async () => {
  await as(admin, async (db) => {
    await db.query("insert into public.portal_settings (key, value) values ('plant', $1) on conflict (key) do update set value = excluded.value", [JSON.stringify({ reject_limit_pct: 0.6 })]);
    await db.query("commit");
  });
  const read = (u: string) => as(u, async (db) => (await db.query("select value from public.portal_settings where key = 'plant'")).rows);
  assert.equal((await read(production))[0].value.reject_limit_pct, 0.6);
  assert.deepEqual(await read(habesha), []);
  assert.equal(await errorCode(as(production, (db) => db.query("insert into public.portal_settings (key, value) values ('coa', '{}')"))), "42501");
  const upd = await as(production, async (db) => (await db.query("update public.portal_settings set value = '{}' where key = 'plant'")).rowCount);
  assert.equal(upd, 0);
  assert.equal(await errorCode(as(admin, (db) => db.query("insert into public.portal_settings (key, value) values ('nope', '{}')"))), "23514");
  const log = await pool.query("select count(*)::int as n from public.audit_log where entity = 'portal_settings'");
  assert.ok(log.rows[0].n >= 1);
});

test("admin edits reason presets; others can't", async () => {
  await as(admin, async (db) => {
    await db.query("insert into public.hold_reason_presets (text, kind, sort_order) values ('Waiting for tinplate delivery.', 'hold', 9)");
    await db.query("commit");
  });
  assert.equal(await errorCode(as(production, (db) => db.query("insert into public.hold_reason_presets (text, kind) values ('x', 'hold')"))), "42501");
  const log = await pool.query("select count(*)::int as n from public.audit_log where entity = 'hold_reason_presets'");
  assert.ok(log.rows[0].n >= 1);
});

test("admin changes a staff role (audited); staff can't, and only admin reads the activity log", async () => {
  const n = await as(admin, async (db) => {
    const r = await db.query("update public.profiles set role = 'quality' where user_id = $1", [production]);
    await db.query("commit");
    return r.rowCount;
  });
  assert.equal(n, 1);
  const upd = await as(production, async (db) => (await db.query("update public.profiles set role = 'admin' where user_id = $1", [production])).rowCount);
  assert.equal(upd, 0);
  const role = await pool.query("select role from public.profiles where user_id = $1", [production]);
  assert.equal(role.rows[0].role, "quality");
  // Staff read an order's own history (the order page); the rest is admin only.
  const readLog = (u: string) =>
    as(u, async (db) => (await db.query("select count(*)::int as n from public.audit_log where entity not in ('orders', 'order_attachments', 'order_status_events')")).rows[0].n);
  assert.ok((await readLog(admin)) > 0);
  assert.equal(await readLog(production), 0);
  assert.equal(await readLog(habesha), 0);
});
