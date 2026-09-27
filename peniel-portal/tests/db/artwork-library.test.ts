// The artwork library: the customer's single-crown artwork (staff with artwork
// access read; admin and sales add) and the 702-up print layouts for the CTP
// machine (admin only). Customers read neither.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, DSH, DSH_BRAND, errorCode, HAB, HAB_BRAND_HABESHA, pool } from "./helpers.ts";

let admin: string;
let sales: string;
let quality: string;
let production: string;
let habesha: string;

before(async () => {
  admin = await createUser({ email: "boss@lib.test", role: "admin" });
  sales = await createUser({ email: "sales@lib.test", role: "sales" });
  quality = await createUser({ email: "qc@lib.test", role: "quality" });
  production = await createUser({ email: "prod@lib.test", role: "production" });
  habesha = await createUser({ email: "buyer@lib-habesha.test", role: "customer_user", companyId: HAB });
});

after(() => pool.end());

const path = (company: string, folder: string, name: string) => `${company}/${folder}/${crypto.randomUUID()}/${name}`;

const add = (user: string, kind: string, filePath: string, brand = HAB_BRAND_HABESHA) =>
  as(user, async (db) => {
    const { rows } = await db.query(
      "insert into public.brand_artwork_files (brand_id, kind, file_path, file_name, size_bytes, ups) values ($1, $2, $3, 'x.ai', 10, $4) returning id",
      [brand, kind, filePath, kind === "print_layout" ? 702 : null],
    );
    await db.query("commit");
    return rows[0].id as string;
  });

const visible = (user: string) =>
  as(user, async (db) => (await db.query("select kind from public.brand_artwork_files order by kind")).rows.map((r) => r.kind));

test("design files: admin and sales add; admin, sales and quality read", async () => {
  await add(sales, "design", path(HAB, "design", "habesha.ai"));
  assert.equal(await errorCode(add(quality, "design", path(HAB, "design", "q.ai"))), "42501");
  assert.equal(await errorCode(add(production, "design", path(HAB, "design", "p.ai"))), "42501");
  for (const u of [admin, sales, quality]) assert.ok((await visible(u)).includes("design"));
  assert.deepEqual(await visible(production), []);
  assert.deepEqual(await visible(habesha), [], "customers read nothing");
});

test("print layouts: admin only, for everything", async () => {
  await add(admin, "print_layout", path(HAB, "print-layout", "habesha-702.ai"));
  assert.equal(await errorCode(add(sales, "print_layout", path(HAB, "print-layout", "s.ai"))), "42501");
  assert.ok((await visible(admin)).includes("print_layout"));
  for (const u of [sales, quality, production, habesha]) assert.ok(!(await visible(u)).includes("print_layout"), "only admin sees print layouts");
  // Sales can't turn a design into a print layout or remove a print layout.
  const d = await add(sales, "design", path(HAB, "design", "d.ai"));
  const moved = await errorCode(
    as(sales, (db) => db.query("update public.brand_artwork_files set kind = 'print_layout', file_path = replace(file_path, '/design/', '/print-layout/') where id = $1", [d])),
  );
  assert.equal(moved, "42501");
  const n = await as(sales, async (db) => (await db.query("delete from public.brand_artwork_files where kind = 'print_layout'")).rowCount);
  assert.equal(n, 0);
});

test("a row can only point at its own section and its brand's company folder", async () => {
  assert.equal(await errorCode(add(sales, "design", path(HAB, "print-layout", "sneaky.ai"))), "23514", "a print layout file through a design row");
  assert.equal(await errorCode(add(sales, "design", path(DSH, "design", "other.ai"))), "23514", "another company's folder");
  assert.equal(await errorCode(add(admin, "print_layout", path(HAB, "design", "x.ai"))), "23514");
  await add(sales, "design", path(DSH, "design", "dashen.ai"), DSH_BRAND);
});

test("storage: the same split on the files", async () => {
  const put = (user: string, name: string) =>
    as(user, async (db) => {
      await db.query("insert into storage.objects (bucket_id, name) values ('artwork-library', $1)", [name]);
      await db.query("commit");
    });
  const read = (user: string, folder: string) =>
    as(user, async (db) => (await db.query("select count(*)::int as n from storage.objects where bucket_id = 'artwork-library' and name like $1", [`%/${folder}/%`])).rows[0].n);
  await put(sales, path(HAB, "design", "a.ai"));
  await put(admin, path(HAB, "print-layout", "b.ai"));
  assert.equal(await errorCode(put(sales, path(HAB, "print-layout", "c.ai"))), "42501");
  assert.equal(await errorCode(put(quality, path(HAB, "design", "d.ai"))), "42501");
  assert.equal(await errorCode(put(habesha, path(HAB, "design", "e.ai"))), "42501");
  assert.equal(await errorCode(put(sales, `${HAB}/elsewhere/f.ai`)), "42501");
  assert.equal(await read(quality, "design"), 1);
  assert.equal(await read(quality, "print-layout"), 0);
  assert.equal(await read(sales, "print-layout"), 0);
  assert.equal(await read(admin, "print-layout"), 1);
  assert.equal(await read(habesha, "design"), 0);
});
