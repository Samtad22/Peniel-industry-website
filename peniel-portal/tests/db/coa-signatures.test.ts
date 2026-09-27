// Signing the Certificate of Analysis: one signature, "Prepared by", by the
// quality manager (role quality). Customers get the certificate only when the
// batch is released, published and signed for its results.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, DSH, errorCode, HAB, HAB_ORDER_HABESHA, pool } from "./helpers.ts";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

let manager: string;
let inspector: string;
let admin: string;
let production: string;
let habesha: string;
let dashen: string;

before(async () => {
  manager = await createUser({ email: "tsegaw@sign.test", role: "quality" });
  inspector = await createUser({ email: "qc@sign.test", role: "quality" });
  admin = await createUser({ email: "boss@sign.test", role: "admin" });
  production = await createUser({ email: "prod@sign.test", role: "production" });
  habesha = await createUser({ email: "buyer@sign-habesha.test", role: "customer_user", companyId: HAB });
  dashen = await createUser({ email: "buyer@sign-dashen.test", role: "customer_user", companyId: DSH });
});

after(() => pool.end());

type Batch = { id?: string; batch: string; result?: string; published?: boolean; height?: number; defects?: Record<string, number> };

const save = (b: Batch) =>
  as(inspector, async (db) => {
    const { rows } = await db.query("select public.qc_save_inspection($1) as id", [
      JSON.stringify({
        id: b.id,
        batch_no: b.batch,
        order_id: HAB_ORDER_HABESHA,
        sample_size: 100,
        measurements: { shell_height_mm: b.height ?? 6.02 },
        defects: b.defects ?? {},
        result: b.result ?? "released",
        customer_reason: b.result === "on_hold" ? "Held for a second inspection before release." : "",
        published: b.published ?? true,
      }),
    ]);
    await db.query("commit");
    return rows[0].id as string;
  });

const sign = (user: string, id: string, line = "prepared") =>
  as(user, async (db) => {
    await db.query("insert into public.coa_signatures (inspection_id, line, image) values ($1, $2, $3)", [id, line, PNG]);
    await db.query("commit");
  });

const unsign = (user: string, id: string) =>
  as(user, async (db) => {
    const r = await db.query("delete from public.coa_signatures where inspection_id = $1", [id]);
    await db.query("commit");
    return r.rowCount;
  });

const certificate = (user: string, id: string) =>
  as(user, async (db) => (await db.query("select public.certificate_of_analysis($1) as c", [id])).rows[0].c);

const ready = (user: string, id: string) =>
  as(user, async (db) => (await db.query("select certificate_ready from public.customer_quality_batches where id = $1", [id])).rows[0]?.certificate_ready);

test("the customer gets the certificate once the quality manager signs it", async () => {
  const id = await save({ batch: "B-SIGN-1" });
  assert.equal(await certificate(habesha, id), null, "released and published but not signed");
  assert.equal(await ready(habesha, id), false);
  const draft = await certificate(manager, id);
  assert.equal(draft.final, false);
  assert.equal(draft.prepared_by, null, "no name until signed");

  await sign(manager, id);
  const c = await certificate(habesha, id);
  assert.equal(c.final, true);
  assert.equal(c.prepared_by, "tsegaw");
  assert.equal(c.approved_by, null);
  assert.equal(c.signatures.prepared.image, PNG);
  assert.equal(c.signatures.prepared.name, "tsegaw");
  assert.ok(!("signer_id" in c.signatures.prepared), "customers get the name, not the user id");
  assert.equal(await ready(habesha, id), true);
  assert.equal(await certificate(dashen, id), null, "another company");
});

test("the signer is always the caller, whatever they send", async () => {
  const id = await save({ batch: "B-SIGN-2" });
  await as(manager, async (db) => {
    const { rows } = await db.query(
      "insert into public.coa_signatures (inspection_id, line, image, signer_id, signer_name, signed_at) values ($1, 'prepared', $2, $3, 'Someone else', '2020-01-01') returning signer_id, signer_name, signed_at",
      [id, PNG, admin],
    );
    assert.equal(rows[0].signer_id, manager);
    assert.equal(rows[0].signer_name, "tsegaw");
    assert.ok(new Date(rows[0].signed_at).getFullYear() > 2020);
  });
});

test("one signature: no approved by, and only quality signs", async () => {
  const id = await save({ batch: "B-SIGN-3" });
  assert.equal(await errorCode(sign(admin, id)), "42501", "admin removes, doesn't sign");
  assert.equal(await errorCode(sign(production, id)), "42501");
  assert.equal(await errorCode(sign(habesha, id)), "42501");
  await sign(manager, id);
  assert.equal(await errorCode(sign(manager, id)), "23505", "signed once");
  assert.equal(await errorCode(sign(inspector, id, "approved")), "23514", "no approved by line");
  const count = (user: string) => as(user, async (db) => (await db.query("select count(*)::int as n from public.coa_signatures where inspection_id = $1", [id])).rows[0].n);
  assert.equal(await count(production), 1, "staff read");
  assert.equal(await count(habesha), 0, "customers never read the table");
});

test("removing: your own signature; admin can remove any", async () => {
  const id = await save({ batch: "B-SIGN-5" });
  await sign(manager, id);
  assert.equal(await unsign(inspector, id), 0, "not someone else's");
  assert.equal(await unsign(production, id), 0);
  assert.equal(await unsign(admin, id), 1);
  await sign(manager, id);
  assert.equal(await unsign(manager, id), 1);
});

test("changing the results voids the signature until signed again", async () => {
  const id = await save({ batch: "B-SIGN-6" });
  await sign(manager, id);
  assert.equal((await certificate(habesha, id)).final, true);

  await save({ id, batch: "B-SIGN-6", defects: { bent_crowns: 1 } });
  assert.equal(await certificate(habesha, id), null);
  assert.equal(await ready(habesha, id), false);
  assert.deepEqual((await certificate(manager, id)).signatures, {}, "the old signature is not shown");

  await sign(manager, id);
  assert.equal((await certificate(habesha, id)).final, true);
  const { rows } = await pool.query("select count(*)::int as n from public.coa_signatures where inspection_id = $1", [id]);
  assert.equal(rows[0].n, 1, "the old one was replaced");

  await save({ id, batch: "B-SIGN-6", height: 6.1, defects: { bent_crowns: 1 } });
  assert.equal(await certificate(habesha, id), null);
  await save({ id, batch: "B-SIGN-6", defects: { bent_crowns: 1 } });
  assert.equal((await certificate(habesha, id)).final, true, "back to the signed results");

  await as(inspector, async (db) => {
    await db.query("update public.qc_inspections set published = false where id = $1", [id]);
    await db.query("update public.qc_inspections set published = true where id = $1", [id]);
    await db.query("commit");
  });
  assert.equal((await certificate(habesha, id)).final, true, "publishing doesn't change the results");
});

test("a held batch can be signed but the customer doesn't get it", async () => {
  const id = await save({ batch: "B-SIGN-HELD", result: "on_hold" });
  await sign(manager, id);
  assert.equal(await certificate(habesha, id), null);
});

test("certificates issued before signing (coa_legacy) stay open unsigned, with the inspector's name", async () => {
  const id = await save({ batch: "B-SIGN-7" });
  await pool.query("update public.qc_inspections set coa_legacy = true where id = $1", [id]);
  const c = await certificate(habesha, id);
  assert.equal(c.final, true);
  assert.equal(c.prepared_by, "qc");
  assert.equal(await ready(habesha, id), true);
});

test("deleting an inspection removes its signature", async () => {
  const id = await save({ batch: "B-SIGN-8" });
  await sign(manager, id);
  await pool.query("delete from public.qc_inspections where id = $1", [id]);
  const { rows } = await pool.query("select count(*)::int as n from public.coa_signatures where inspection_id = $1", [id]);
  assert.equal(rows[0].n, 0);
});

test("a saved signature is private to its owner; signatures are PNGs", async () => {
  await as(manager, async (db) => {
    await db.query("insert into public.staff_signatures (image) values ($1)", [PNG]);
    await db.query("commit");
  });
  const mine = (user: string) => as(user, async (db) => (await db.query("select user_id from public.staff_signatures")).rows);
  assert.deepEqual((await mine(manager)).map((r) => r.user_id), [manager]);
  assert.deepEqual(await mine(admin), [], "not even admin");
  assert.equal(
    await errorCode(as(admin, (db) => db.query("insert into public.staff_signatures (user_id, image) values ($1, $2)", [manager, PNG]))),
    "42501",
  );
  assert.equal(await errorCode(as(habesha, (db) => db.query("insert into public.staff_signatures (image) values ($1)", [PNG]))), "42501");
  const id = await save({ batch: "B-SIGN-9" });
  assert.equal(
    await errorCode(as(manager, (db) => db.query("insert into public.coa_signatures (inspection_id, line, image) values ($1, 'prepared', 'data:image/jpeg;base64,x')", [id]))),
    "23514",
  );
});

test("the ready email is claimed once per signed certificate, by the service role only", async () => {
  const claim = (id: string) => pool.query("select public.coa_claim_ready_email($1) as ok", [id]).then((r) => r.rows[0].ok);
  const id = await save({ batch: "B-SIGN-10", published: false });
  await sign(manager, id);
  assert.equal(await claim(id), false, "not published yet");
  await save({ id, batch: "B-SIGN-10", published: true });
  assert.equal(await claim(id), true);
  assert.equal(await claim(id), false, "only once");
  await save({ id, batch: "B-SIGN-10", defects: { bent_crowns: 2 } });
  assert.equal(await claim(id), false, "not signed for the new results");
  await sign(manager, id);
  assert.equal(await claim(id), true);
  assert.equal(await errorCode(as(admin, (db) => db.query("select public.coa_claim_ready_email($1)", [id]))), "42501");
});
