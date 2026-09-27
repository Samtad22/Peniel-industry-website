// Signing the Certificate of Analysis: "Prepared by" then "Approved by", by two
// different people (quality or admin). Customers get the certificate only when
// the batch is released, published and signed on both lines for its results.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, DSH, errorCode, HAB, HAB_ORDER_HABESHA, pool } from "./helpers.ts";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

let quality: string;
let quality2: string;
let admin: string;
let production: string;
let habesha: string;
let dashen: string;

before(async () => {
  quality = await createUser({ email: "qc@sign.test", role: "quality" });
  quality2 = await createUser({ email: "qo@sign.test", role: "quality" });
  admin = await createUser({ email: "boss@sign.test", role: "admin" });
  production = await createUser({ email: "prod@sign.test", role: "production" });
  habesha = await createUser({ email: "buyer@sign-habesha.test", role: "customer_user", companyId: HAB });
  dashen = await createUser({ email: "buyer@sign-dashen.test", role: "customer_user", companyId: DSH });
});

after(() => pool.end());

type Batch = { id?: string; batch: string; result?: string; published?: boolean; height?: number; defects?: Record<string, number> };

const save = (b: Batch) =>
  as(quality, async (db) => {
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

const sign = (user: string, id: string, line: "prepared" | "approved") =>
  as(user, async (db) => {
    await db.query("insert into public.coa_signatures (inspection_id, line, image) values ($1, $2, $3)", [id, line, PNG]);
    await db.query("commit");
  });

const unsign = (user: string, id: string, line: "prepared" | "approved") =>
  as(user, async (db) => {
    const r = await db.query("delete from public.coa_signatures where inspection_id = $1 and line = $2", [id, line]);
    await db.query("commit");
    return r.rowCount;
  });

const certificate = (user: string, id: string) =>
  as(user, async (db) => (await db.query("select public.certificate_of_analysis($1) as c", [id])).rows[0].c);

const ready = (user: string, id: string) =>
  as(user, async (db) => (await db.query("select certificate_ready from public.customer_quality_batches where id = $1", [id])).rows[0]?.certificate_ready);

test("the customer gets the certificate only after both signatures", async () => {
  const id = await save({ batch: "B-SIGN-1" });
  assert.equal(await certificate(habesha, id), null, "released and published but not signed");
  assert.equal(await ready(habesha, id), false);

  await sign(quality, id, "prepared");
  assert.equal(await certificate(habesha, id), null, "only prepared");
  const draft = await certificate(quality, id);
  assert.equal(draft.final, false);
  assert.equal(draft.prepared_by, "qc");
  assert.equal(draft.signatures.prepared.image, PNG);

  await sign(admin, id, "approved");
  const c = await certificate(habesha, id);
  assert.equal(c.final, true);
  assert.equal(c.prepared_by, "qc");
  assert.equal(c.approved_by, "boss");
  assert.equal(c.signatures.prepared.image, PNG);
  assert.equal(c.signatures.approved.name, "boss");
  assert.ok(!("signer_id" in c.signatures.approved), "customers get names, not user ids");
  assert.equal(await ready(habesha, id), true);
  assert.equal(await certificate(dashen, id), null, "another company");
});

test("the signer is always the caller, whatever they send", async () => {
  const id = await save({ batch: "B-SIGN-2" });
  await as(quality, async (db) => {
    const { rows } = await db.query(
      "insert into public.coa_signatures (inspection_id, line, image, signer_id, signer_name, signed_at) values ($1, 'prepared', $2, $3, 'Someone else', '2020-01-01') returning signer_id, signer_name, signed_at",
      [id, PNG, admin],
    );
    assert.equal(rows[0].signer_id, quality);
    assert.equal(rows[0].signer_name, "qc");
    assert.ok(new Date(rows[0].signed_at).getFullYear() > 2020);
  });
});

test("approved by comes after prepared by, from a different person, on a released batch", async () => {
  const id = await save({ batch: "B-SIGN-3" });
  assert.equal(await errorCode(sign(admin, id, "approved")), "23514", "prepared first");
  await sign(quality, id, "prepared");
  assert.equal(await errorCode(sign(quality, id, "approved")), "23514", "a different person approves");
  assert.equal(await errorCode(sign(quality, id, "prepared")), "23505", "one signature per line");
  await sign(quality2, id, "approved");

  const held = await save({ batch: "B-SIGN-HELD", result: "on_hold" });
  await sign(quality, held, "prepared");
  assert.equal(await errorCode(sign(admin, held, "approved")), "23514", "a held batch is not approved");
});

test("only quality and admin sign; staff read; customers never read signatures", async () => {
  const id = await save({ batch: "B-SIGN-4" });
  assert.equal(await errorCode(sign(production, id, "prepared")), "42501");
  assert.equal(await errorCode(sign(habesha, id, "prepared")), "42501");
  await sign(quality, id, "prepared");
  const count = (user: string) => as(user, async (db) => (await db.query("select count(*)::int as n from public.coa_signatures where inspection_id = $1", [id])).rows[0].n);
  assert.equal(await count(production), 1);
  assert.equal(await count(habesha), 0);
  assert.equal(await errorCode(as(habesha, (db) => db.query("select * from public.staff_signatures"))), null);
});

test("removing: your own signature (admin any), and approved before prepared", async () => {
  const id = await save({ batch: "B-SIGN-5" });
  await sign(quality, id, "prepared");
  await sign(quality2, id, "approved");
  assert.equal(await unsign(quality, id, "approved"), 0, "not someone else's");
  assert.equal(await errorCode(unsign(quality, id, "prepared")), "23514", "approved is removed first");
  assert.equal(await unsign(quality2, id, "approved"), 1);
  assert.equal(await unsign(admin, id, "prepared"), 1, "admin can remove any");
  assert.equal(await unsign(production, id, "prepared"), 0);
});

test("changing the results voids the signatures until signed again", async () => {
  const id = await save({ batch: "B-SIGN-6" });
  await sign(quality, id, "prepared");
  await sign(admin, id, "approved");
  assert.equal((await certificate(habesha, id)).final, true);

  // A new defect count: the signatures no longer match.
  await save({ id, batch: "B-SIGN-6", defects: { bent_crowns: 1 } });
  assert.equal(await certificate(habesha, id), null);
  assert.equal(await ready(habesha, id), false);
  const draft = await certificate(quality, id);
  assert.deepEqual(draft.signatures, {}, "old signatures are not shown");
  assert.equal(draft.approved_by, null);

  // Approving the new results needs the new prepared signature first.
  assert.equal(await errorCode(sign(admin, id, "approved")), "23514");
  await sign(quality, id, "prepared");
  await sign(admin, id, "approved");
  assert.equal((await certificate(habesha, id)).final, true);
  const { rows } = await pool.query("select line from public.coa_signatures where inspection_id = $1 order by line", [id]);
  assert.deepEqual(rows.map((r) => r.line), ["approved", "prepared"], "the old ones were replaced");

  // A new measurement too; and back to the signed results counts again.
  await save({ id, batch: "B-SIGN-6", height: 6.1, defects: { bent_crowns: 1 } });
  assert.equal(await certificate(habesha, id), null);
  await save({ id, batch: "B-SIGN-6", defects: { bent_crowns: 1 } });
  assert.equal((await certificate(habesha, id)).final, true);

  // Editing only customer-facing text or the publish flag keeps them.
  await as(quality, async (db) => {
    await db.query("update public.qc_inspections set published = false where id = $1", [id]);
    await db.query("update public.qc_inspections set published = true where id = $1", [id]);
    await db.query("commit");
  });
  assert.equal((await certificate(habesha, id)).final, true);
});

test("certificates issued before signing (coa_legacy) stay open unsigned", async () => {
  const id = await save({ batch: "B-SIGN-7" });
  await pool.query("update public.qc_inspections set coa_legacy = true where id = $1", [id]);
  const c = await certificate(habesha, id);
  assert.equal(c.final, true);
  assert.equal(c.approved_by, null);
  assert.equal(await ready(habesha, id), true);
});

test("deleting an inspection removes its signatures", async () => {
  const id = await save({ batch: "B-SIGN-8" });
  await sign(quality, id, "prepared");
  await sign(admin, id, "approved");
  await pool.query("delete from public.qc_inspections where id = $1", [id]);
  const { rows } = await pool.query("select count(*)::int as n from public.coa_signatures where inspection_id = $1", [id]);
  assert.equal(rows[0].n, 0);
});

test("a saved signature is private to its owner", async () => {
  await as(quality, async (db) => {
    await db.query("insert into public.staff_signatures (image) values ($1)", [PNG]);
    await db.query("commit");
  });
  const mine = (user: string) => as(user, async (db) => (await db.query("select user_id from public.staff_signatures")).rows);
  assert.deepEqual((await mine(quality)).map((r) => r.user_id), [quality]);
  assert.deepEqual(await mine(admin), [], "not even admin");
  assert.equal(
    await errorCode(as(admin, (db) => db.query("insert into public.staff_signatures (user_id, image) values ($1, $2)", [quality, PNG]))),
    "42501",
  );
  assert.equal(await errorCode(as(habesha, (db) => db.query("insert into public.staff_signatures (image) values ($1)", [PNG]))), "42501");
  const id = await save({ batch: "B-SIGN-9" });
  assert.equal(
    await errorCode(as(quality, (db) => db.query("insert into public.coa_signatures (inspection_id, line, image) values ($1, 'prepared', 'data:image/jpeg;base64,x')", [id]))),
    "23514",
    "a PNG only",
  );
});

test("the ready email is claimed once per signed certificate, by the service role only", async () => {
  const claim = (id: string) => pool.query("select public.coa_claim_ready_email($1) as ok", [id]).then((r) => r.rows[0].ok);
  const id = await save({ batch: "B-SIGN-10", published: false });
  await sign(quality, id, "prepared");
  await sign(admin, id, "approved");
  assert.equal(await claim(id), false, "not published yet");
  await save({ id, batch: "B-SIGN-10", published: true });
  assert.equal(await claim(id), true);
  assert.equal(await claim(id), false, "only once");
  // Re-signed after new results: the customer hears again.
  await save({ id, batch: "B-SIGN-10", defects: { bent_crowns: 2 } });
  assert.equal(await claim(id), false, "not signed for the new results");
  await sign(quality, id, "prepared");
  await sign(admin, id, "approved");
  assert.equal(await claim(id), true);
  assert.equal(await errorCode(as(admin, (db) => db.query("select public.coa_claim_ready_email($1)", [id]))), "42501");
});
