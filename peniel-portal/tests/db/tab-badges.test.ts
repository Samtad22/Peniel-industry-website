// Tab badges remember when each person last opened each tab (nav_seen).
// Everyone reads and writes only their own rows.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, DSH, errorCode, HAB, pool } from "./helpers.ts";

let habesha: string;
let dashen: string;
let sales: string;

before(async () => {
  habesha = await createUser({ email: "buyer@tabs-habesha.test", role: "customer_user", companyId: HAB });
  dashen = await createUser({ email: "buyer@tabs-dashen.test", role: "customer_user", companyId: DSH });
  sales = await createUser({ email: "sales@tabs.test", role: "sales" });
});

after(() => pool.end());

test("a person records their own tab visits and reads only their own", async () => {
  await as(habesha, async (db) => {
    await db.query("insert into public.nav_seen (user_id, area) values ($1, 'documents') on conflict (user_id, area) do update set seen_at = now()", [habesha]);
    await db.query("update public.nav_seen set seen_at = now() where user_id = $1 and area = 'documents'", [habesha]);
    await db.query("commit");
  });
  await as(sales, async (db) => {
    await db.query("insert into public.nav_seen (user_id, area) values ($1, 'orders')", [sales]);
    await db.query("commit");
  });
  await as(dashen, async (db) => {
    const { rows } = await db.query("select user_id from public.nav_seen");
    assert.ok(rows.every((r) => r.user_id === dashen), "sees no one else's rows");
  });
  await as(sales, async (db) => {
    const { rows } = await db.query("select user_id from public.nav_seen");
    assert.ok(rows.every((r) => r.user_id === sales), "staff see only their own rows too");
  });
});

test("nobody can write someone else's visits", async () => {
  await as(dashen, async (db) => {
    assert.equal(await errorCode(db.query("insert into public.nav_seen (user_id, area) values ($1, 'orders')", [habesha])), "42501");
  });
  await as(dashen, async (db) => {
    const upd = await db.query("update public.nav_seen set seen_at = now() - interval '1 year' where user_id = $1", [habesha]);
    assert.equal(upd.rowCount, 0);
  });
  await as(null, async (db) => {
    assert.equal(await errorCode(db.query("select * from public.nav_seen")), "42501");
  });
});

test("tab names are checked", async () => {
  await as(habesha, async (db) => {
    assert.equal(await errorCode(db.query("insert into public.nav_seen (user_id, area) values ($1, 'Orders; drop')", [habesha])), "23514");
  });
});
