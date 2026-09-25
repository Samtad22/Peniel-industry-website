// Phase 5: the email log is for admins only.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, errorCode, HAB, pool } from "./helpers.ts";

let admin: string;
let sales: string;
let customer: string;

before(async () => {
  admin = await createUser({ email: "admin@p5.test", role: "admin" });
  sales = await createUser({ email: "sales@p5.test", role: "sales" });
  customer = await createUser({ email: "buyer@p5.test", role: "customer_user", companyId: HAB });
  await pool.query(
    "insert into public.notification_log (kind, recipient, subject, status, company_id) values ('order_confirmed', 'buyer@p5.test', 'Order confirmed', 'skipped', $1)",
    [HAB],
  );
});

after(() => pool.end());

test("only admins read the email log; nobody writes it through the API", async () => {
  await as(admin, async (db) => {
    const { rows } = await db.query("select count(*)::int as n from public.notification_log");
    assert.equal(rows[0].n, 1);
  });
  for (const who of [sales, customer]) {
    await as(who, async (db) => {
      const { rows } = await db.query("select * from public.notification_log");
      assert.equal(rows.length, 0);
    });
  }
  for (const who of [admin, customer]) {
    assert.equal(
      await errorCode(
        as(who, (db) => db.query("insert into public.notification_log (kind, recipient, subject, status) values ('x', 'a@b.c', 's', 'sent')")),
      ),
      "42501",
    );
  }
  assert.equal(await errorCode(as(null, (db) => db.query("select * from public.notification_log"))), "42501");
});
