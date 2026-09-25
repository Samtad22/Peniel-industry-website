// Files on messages: customers attach only their own uploads, see only their
// own company's files, and never files on a staff internal note.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, DSH, errorCode, HAB, pool } from "./helpers.ts";

let sales: string;
let habesha: string;
let dashen: string;
let thread: string;

const file = (path: string, name = "photo.jpg") => ({ path, name, size: 2048, mime: "image/jpeg" });
const upload = (path: string) => pool.query("insert into storage.objects (bucket_id, name) values ('message-attachments', $1)", [path]);

before(async () => {
  sales = await createUser({ email: "sales@ma.test", role: "sales" });
  habesha = await createUser({ email: "buyer@ma-habesha.test", role: "customer_user", companyId: HAB });
  dashen = await createUser({ email: "buyer@ma-dashen.test", role: "customer_user", companyId: DSH });
  await upload(`${HAB}/f1/crowns.jpg`);
  await upload(`${DSH}/f2/dashen.jpg`);
  thread = await as(habesha, async (db) => {
    const { rows } = await db.query("select public.customer_send_message('Photo of the dented crowns', null, 'Damaged batch', null, $1::jsonb) as id", [
      JSON.stringify([file(`${HAB}/f1/crowns.jpg`, "crowns.jpg")]),
    ]);
    await db.query("commit");
    return rows[0].id as string;
  });
});

after(() => pool.end());

test("a customer's file shows on their conversation, and only to their company", async () => {
  await as(habesha, async (db) => {
    const { rows } = await db.query("select file_name, from_peniel from public.customer_message_attachments where thread_id = $1", [thread]);
    assert.deepEqual(rows, [{ file_name: "crowns.jpg", from_peniel: false }]);
  });
  await as(dashen, async (db) => {
    const { rows } = await db.query("select * from public.customer_message_attachments");
    assert.equal(rows.length, 0);
  });
  await as(sales, async (db) => {
    const { rows } = await db.query("select company_id from public.message_attachments where thread_id = $1", [thread]);
    assert.deepEqual(rows, [{ company_id: HAB }]);
  });
});

test("customers can only attach files they uploaded to their own folder", async () => {
  const send = (path: string) =>
    as(habesha, (db) =>
      db.query("select public.customer_send_message('see attached', $1, null, null, $2::jsonb)", [thread, JSON.stringify([file(path)])]),
    );
  assert.equal(await errorCode(send(`${DSH}/f2/dashen.jpg`)), "42501", "another company's file");
  assert.equal(await errorCode(send(`${HAB}/never-uploaded.jpg`)), "42501", "a file that isn't in Storage");
  assert.equal(await errorCode(send(`${HAB}/../${DSH}/f2/dashen.jpg`)), "42501", "path tricks");
  const six = Array.from({ length: 6 }, () => file(`${HAB}/f1/crowns.jpg`));
  assert.equal(
    await errorCode(as(habesha, (db) => db.query("select public.customer_send_message('x', $1, null, null, $2::jsonb)", [thread, JSON.stringify(six)]))),
    "22023",
  );
  const { rows } = await pool.query("select id from public.messages where thread_id = $1 limit 1", [thread]);
  assert.equal(
    await errorCode(
      as(habesha, (db) =>
        db.query("insert into public.message_attachments (message_id, file_path, file_name, size_bytes) values ($1, $2, 'x.jpg', 10)", [
          rows[0].id,
          `${HAB}/f1/crowns.jpg`,
        ]),
      ),
    ),
    "42501",
    "no direct inserts",
  );
});

test("files on internal notes never reach the customer", async () => {
  await upload(`${HAB}/f3/line-2-log.pdf`);
  await upload(`${HAB}/f4/delivery-note.pdf`);
  await as(sales, async (db) => {
    for (const [internal, path] of [
      [true, `${HAB}/f3/line-2-log.pdf`],
      [false, `${HAB}/f4/delivery-note.pdf`],
    ] as const) {
      const { rows } = await db.query(
        "insert into public.messages (thread_id, author_id, body, internal, read_by_staff) values ($1, $2, 'file', $3, true) returning id",
        [thread, sales, internal],
      );
      await db.query("insert into public.message_attachments (message_id, file_path, file_name, size_bytes, mime_type) values ($1, $2, $3, 5000, 'application/pdf')", [
        rows[0].id,
        path,
        path.split("/").pop(),
      ]);
    }
    await db.query("commit");
  });
  await as(habesha, async (db) => {
    const { rows } = await db.query("select file_name, from_peniel from public.customer_message_attachments where thread_id = $1 order by created_at, file_name", [thread]);
    assert.deepEqual(
      rows.map((r) => r.file_name).sort(),
      ["crowns.jpg", "delivery-note.pdf"],
    );
  });
  await as(sales, async (db) => {
    const { rows } = await db.query("select count(*)::int as n from public.message_attachments where thread_id = $1", [thread]);
    assert.equal(rows[0].n, 3);
  });
});

test("a file can't be filed under another company's conversation", async () => {
  const code = await errorCode(
    as(sales, async (db) => {
      const { rows } = await db.query("insert into public.messages (thread_id, author_id, body, read_by_staff) values ($1, $2, 'x', true) returning id", [thread, sales]);
      // thread_id / company_id are taken from the message, so a Dashen path fails the folder check.
      await db.query("insert into public.message_attachments (message_id, company_id, file_path, file_name, size_bytes) values ($1, $2, $3, 'd.jpg', 10)", [
        rows[0].id,
        DSH,
        `${DSH}/f2/dashen.jpg`,
      ]);
    }),
  );
  assert.equal(code, "23514");
});
