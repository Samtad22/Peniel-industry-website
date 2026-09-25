// Artwork both ways: customers send artwork to Peniel, and physical proofs
// carry a tracking number the customer sees but driver details they don't.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, DSH, DSH_BRAND, errorCode, HAB, HAB_BRAND_FETA, HAB_ORDER_FETA, pool } from "./helpers.ts";

let sales: string;
let production: string;
let habesha: string;
let dashen: string;

const upload = (path: string) => pool.query("insert into storage.objects (bucket_id, name) values ('artwork', $1)", [path]);
const submit = (db: { query: typeof pool.query }, path: string, brand: string | null = HAB_BRAND_FETA, order: string | null = null) =>
  db.query("select public.customer_submit_artwork('New Feta label', $1, 'feta.pdf', 120000, 'application/pdf', $2, $3, 'Gold foil this time') as id", [
    path,
    brand,
    order,
  ]);

before(async () => {
  sales = await createUser({ email: "sales@aw.test", role: "sales" });
  production = await createUser({ email: "production@aw.test", role: "production" });
  habesha = await createUser({ email: "buyer@aw-habesha.test", role: "customer_user", companyId: HAB });
  dashen = await createUser({ email: "buyer@aw-dashen.test", role: "customer_user", companyId: DSH });
  await upload(`${HAB}/submissions/a1/feta.pdf`);
  await upload(`${DSH}/submissions/a2/dashen.pdf`);
});

after(() => pool.end());

test("a customer sends artwork for their own brand; only they and Peniel see it", async () => {
  const id = await as(habesha, async (db) => {
    const { rows } = await submit(db, `${HAB}/submissions/a1/feta.pdf`, HAB_BRAND_FETA, HAB_ORDER_FETA);
    await db.query("commit");
    return rows[0].id as string;
  });
  await as(habesha, async (db) => {
    const { rows } = await db.query("select title, brand_name, status from public.customer_artwork_submissions where id = $1", [id]);
    assert.deepEqual(rows, [{ title: "New Feta label", brand_name: "Feta", status: "submitted" }]);
  });
  await as(dashen, async (db) => {
    const { rows } = await db.query("select * from public.customer_artwork_submissions");
    assert.equal(rows.length, 0);
  });
  await as(sales, async (db) => {
    const { rows } = await db.query("select company_id from public.artwork_submissions where id = $1", [id]);
    assert.deepEqual(rows, [{ company_id: HAB }]);
  });
});

test("customers can't send another company's file, brand or order, or insert directly", async () => {
  assert.equal(await errorCode(as(habesha, (db) => submit(db, `${DSH}/submissions/a2/dashen.pdf`))), "42501", "another company's file");
  assert.equal(await errorCode(as(habesha, (db) => submit(db, `${HAB}/submissions/nope.pdf`))), "42501", "file not uploaded");
  await upload(`${HAB}/submissions/a3/x.pdf`);
  assert.equal(await errorCode(as(habesha, (db) => submit(db, `${HAB}/submissions/a3/x.pdf`, DSH_BRAND))), "42501", "another company's brand");
  assert.equal(
    await errorCode(
      as(habesha, (db) =>
        db.query(
          "insert into public.artwork_submissions (company_id, title, file_path, file_name, size_bytes) values ($1, 't', $2, 'x.pdf', 10)",
          [HAB, `${HAB}/submissions/a3/x.pdf`],
        ),
      ),
    ),
    "42501",
    "direct insert",
  );
});

test("only Sales and Admin review; asking for changes needs a comment for the customer", async () => {
  const { rows } = await pool.query("select id from public.artwork_submissions limit 1");
  const id = rows[0].id as string;
  await as(production, async (db) => {
    const r = await db.query("update public.artwork_submissions set status = 'accepted' where id = $1", [id]);
    assert.equal(r.rowCount, 0, "production can't review");
  });
  assert.equal(
    await errorCode(as(sales, (db) => db.query("update public.artwork_submissions set status = 'changes_requested' where id = $1", [id]))),
    "23514",
  );
  await as(sales, async (db) => {
    await db.query(
      "update public.artwork_submissions set status = 'changes_requested', staff_comment = 'Please send the logo as a vector PDF.', reviewed_by = $2, reviewed_at = now() where id = $1",
      [id, sales],
    );
    await db.query("commit");
  });
  await as(habesha, async (db) => {
    const { rows: r } = await db.query("select status, staff_comment from public.customer_artwork_submissions where id = $1", [id]);
    assert.deepEqual(r, [{ status: "changes_requested", staff_comment: "Please send the logo as a vector PDF." }]);
  });
});

test("a physical proof shows its tracking number to the customer, never the driver or vehicle", async () => {
  await as(sales, async (db) => {
    await db.query(
      `insert into public.proofs (brand_id, physical_delivery, courier, tracking_number, dispatched_at, sent_by)
       values ($1, 'courier', 'DHL', '1234567890', now(), $2)`,
      [HAB_BRAND_FETA, sales],
    );
    await db.query(
      `insert into public.proofs (brand_id, physical_delivery, dispatched_at, delivery_driver, delivery_vehicle, sent_by)
       values ($1, 'peniel_driver', now(), 'Getachew', 'AA 3-12345', $2)`,
      [HAB_BRAND_FETA, sales],
    );
    await db.query("commit");
  });
  await as(habesha, async (db) => {
    const { rows } = await db.query(
      "select physical_delivery, courier, tracking_number from public.customer_proofs where physical_delivery is not null order by created_at, physical_delivery",
    );
    assert.deepEqual(
      rows.map((r) => [r.physical_delivery, r.courier, r.tracking_number]).sort(),
      [
        ["courier", "DHL", "1234567890"],
        ["peniel_driver", null, null],
      ],
    );
    const text = JSON.stringify((await db.query("select * from public.customer_proofs")).rows);
    assert.ok(!/Getachew|AA 3-12345/.test(text), "driver and vehicle stay internal");
  });
  // A proof needs either a file or a physical delivery.
  assert.equal(
    await errorCode(as(sales, (db) => db.query("insert into public.proofs (brand_id, sent_by) values ($1, $2)", [HAB_BRAND_FETA, sales]))),
    "23514",
  );
});
