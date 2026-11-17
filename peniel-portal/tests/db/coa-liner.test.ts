// The liner type ID per inspection, printed on its certificate (20261117000006).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, HAB, HAB_ORDER_HABESHA, pool } from "./helpers.ts";

let quality: string;
let habesha: string;

before(async () => {
  quality = await createUser({ email: "qc@liner.test", role: "quality" });
  habesha = await createUser({ email: "buyer@liner.test", role: "customer_user", companyId: HAB });
});

after(() => pool.end());

const save = (p: Record<string, unknown>) =>
  as(quality, async (db) => {
    const { rows } = await db.query("select public.qc_save_inspection($1) as id", [
      JSON.stringify({ order_id: HAB_ORDER_HABESHA, sample_size: 100, measurements: {}, defects: {}, result: "released", customer_reason: "", published: true, ...p }),
    ]);
    await db.query("commit");
    return rows[0].id as string;
  });
const sign = (id: string) =>
  as(quality, async (db) => {
    await db.query("insert into public.coa_signatures (inspection_id, line, image) values ($1, 'prepared', 'data:image/png;base64,iVBORw0KGgo=')", [id]);
    await db.query("commit");
  });
const coa = (user: string, id: string) => as(user, async (db) => (await db.query("select public.certificate_of_analysis($1) as c", [id])).rows[0].c);

test("an inspection without a liner type keeps the Settings one, and its signature, when saved again", async () => {
  const id = await save({ batch_no: "B-LINER-1" });
  await sign(id);
  assert.equal((await coa(quality, id)).liner_type_id, null);
  // The form sends an empty liner: nothing changes, the signature stands.
  await save({ id, batch_no: "B-LINER-1", liner_type_id: "  " });
  const c = await coa(quality, id);
  assert.equal(c.liner_type_id, null);
  assert.equal(c.signed, true);
});

test("a batch's own liner type is on its certificate; changing it clears the signature", async () => {
  const id = await save({ batch_no: "B-LINER-2", liner_type_id: " Actega Svelon 855 " });
  await sign(id);
  assert.equal((await coa(quality, id)).liner_type_id, "Actega Svelon 855");
  // The customer sees it on their signed certificate.
  assert.equal((await coa(habesha, id)).liner_type_id, "Actega Svelon 855");
  // Saved without the key (another form): left as it is.
  await save({ id, batch_no: "B-LINER-2" });
  assert.equal((await coa(quality, id)).liner_type_id, "Actega Svelon 855");
  assert.equal((await coa(quality, id)).signed, true);
  // Changed: the signature no longer counts, and the customer can't open it until signed again.
  await save({ id, batch_no: "B-LINER-2", liner_type_id: "Contoform 0369" });
  const c = await coa(quality, id);
  assert.equal(c.liner_type_id, "Contoform 0369");
  assert.equal(c.signed, false);
  assert.equal(await coa(habesha, id), null);
});

test("liner type IDs are at most 60 characters", async () => {
  await assert.rejects(save({ batch_no: "B-LINER-3", liner_type_id: "x".repeat(61) }));
});
