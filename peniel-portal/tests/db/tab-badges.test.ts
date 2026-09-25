// Tab badges remember when each person last opened each tab (nav_seen).
// Everyone reads and writes only their own rows.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, DSH, errorCode, HAB, HAB_ORDER_HABESHA, pool } from "./helpers.ts";

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

test("a status change after the customer's last visit counts on their Orders tab; staff don't count their own", async () => {
  const sales2 = await createUser({ email: "sales2@tabs.test", role: "sales" });
  // Everyone has just looked at Orders.
  for (const u of [habesha, sales, sales2]) {
    await pool.query("insert into public.nav_seen (user_id, area, seen_at) values ($1, 'orders', now() - interval '1 second') on conflict (user_id, area) do update set seen_at = excluded.seen_at", [u]);
  }
  // Sales moves the order on, as the portal does.
  await as(sales, async (db) => {
    const { rows } = await db.query("select status from public.orders where id = $1", [HAB_ORDER_HABESHA]);
    const next = rows[0].status === "in_production" ? "quality_check" : "in_production";
    await db.query("update public.orders set status = $2, customer_reason = null where id = $1", [HAB_ORDER_HABESHA, next]);
    await db.query("commit");
  });

  // Customer: the same query the Orders badge runs (customer_order_timeline, not "submitted", after their visit).
  await as(habesha, async (db) => {
    const { rows } = await db.query(
      `select distinct t.order_id from public.customer_order_timeline t
       where t.status <> 'submitted'
         and t.created_at > (select seen_at from public.nav_seen where user_id = $1 and area = 'orders')`,
      [habesha],
    );
    assert.deepEqual(rows.map((r) => r.order_id), [HAB_ORDER_HABESHA]);
  });
  // Staff: the one who made the change doesn't get a badge; a colleague does.
  const staffCount = (me: string) =>
    as(me, async (db) => {
      const { rows } = await db.query(
        `select count(distinct e.order_id)::int as n from public.order_status_events e
         where e.created_at > (select seen_at from public.nav_seen where user_id = $1 and area = 'orders')
           and (e.created_by is null or e.created_by <> $1)`,
        [me],
      );
      return rows[0].n as number;
    });
  assert.equal(await staffCount(sales), 0);
  assert.equal(await staffCount(sales2), 1);
});
