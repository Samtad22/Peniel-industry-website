// Customer Artwork Catalogue (20261118000002): each brand's design code,
// CTP plates and colour separations; designs not on the list are added.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { as, createUser, DSH_BRAND, HAB, HAB_BRAND_FETA, HAB_BRAND_HABESHA, pool } from "./helpers.ts";

after(() => pool.end());

const MIGRATION = new URL("../../supabase/migrations/20261118000002_brand_artwork_catalogue.sql", import.meta.url);
const run = async () => {
  const c = await pool.connect();
  try {
    const res = await c.query(readFileSync(MIGRATION, "utf8"));
    const last = Array.isArray(res) ? res[res.length - 1] : res;
    return last.rows as { code: string; customer: string; brand: string; plates: number; done: string }[];
  } finally {
    c.release();
  }
};
const brand = async (id: string) =>
  (await pool.query("select name, design_code, plates, jsonb_array_length(separations)::int as seps, separations->0->>'name' as first from public.brands where id = $1", [id])).rows[0];

test("brands on the list get their design; the others are added under their customer", async () => {
  // As on the live database: the brands from the order sheet.
  const eab = (await pool.query("insert into public.companies (name, code) values ('East Africa Bottling S.C.', 'EAB') returning id")).rows[0].id as string;
  const coca = (await pool.query("insert into public.brands (company_id, name) values ($1, 'Coca') returning id", [eab])).rows[0].id as string;
  const kostara = (await pool.query("insert into public.brands (company_id, name) values ($1, 'Habesha Kostara') returning id", [HAB])).rows[0].id as string;
  const inks = Number((await pool.query("select count(*) from public.raw_materials where ink_name is not null")).rows[0].count);

  const report = await run();
  assert.equal(report.length, 30);
  assert.deepEqual(await brand(HAB_BRAND_HABESHA), { name: "Habesha", design_code: "HAB-01", plates: 4, seps: 4, first: "PANTONE 871 C (gold)" });
  assert.deepEqual(await brand(HAB_BRAND_FETA), { name: "Feta", design_code: "HAB-05", plates: 4, seps: 4, first: "PANTONE 7621 C" });
  assert.deepEqual(await brand(DSH_BRAND), { name: "Dashen", design_code: "DAS-01", plates: 3, seps: 3, first: "PANTONE 485 C" });
  // Names as in the catalogue match the ones on the list.
  assert.equal((await brand(coca)).design_code, "CCE-01");
  assert.equal((await brand(kostara)).design_code, "HAB-02");
  const sprite = report.find((r) => r.code === "CCE-03")!;
  assert.deepEqual([sprite.customer, sprite.brand, sprite.plates, sprite.done], ["East Africa Bottling S.C.", "Sprite", 3, "brand added"]);
  // New customers.
  assert.equal(report.find((r) => r.code === "KOM-01")!.done, "customer and brand added");
  // Each brand once: no second Coca-Cola.
  assert.equal(Number((await pool.query("select count(*) from public.brands where name in ('Coca', 'Coca-Cola') and active")).rows[0].count), 1);
  // Inventory gets no new inks.
  assert.equal(Number((await pool.query("select count(*) from public.raw_materials where ink_name is not null")).rows[0].count), inks);
  // Awash Malt: 6 plates.
  assert.equal(report.find((r) => r.code === "KEG-02")!.plates, 6);

  // Again: everything matched, nothing added.
  const before = Number((await pool.query("select count(*) from public.brands")).rows[0].count);
  assert.ok((await run()).every((r) => r.done === "matched"));
  assert.equal(Number((await pool.query("select count(*) from public.brands")).rows[0].count), before);
});

test("a design changed by hand is kept", async () => {
  await run();
  await pool.query("update public.brands set design_code = 'HEI-09', plates = 5 where name = 'Heineken'");
  const r = (await run()).find((x) => x.code === "HEI-01")!;
  assert.match(r.done, /kept its own design HEI-09/);
  assert.equal((await pool.query("select plates from public.brands where name = 'Heineken'")).rows[0].plates, 5);
});

test("customers never see the separations", async () => {
  await run();
  const buyer = await createUser({ email: "buyer@catalogue.test", role: "customer_user", companyId: HAB });
  const row = await as(buyer, async (db) => (await db.query("select * from public.customer_brands limit 1")).rows[0]);
  for (const col of ["design_code", "design_note", "plates", "separations"]) assert.ok(!(col in row), col);
});
