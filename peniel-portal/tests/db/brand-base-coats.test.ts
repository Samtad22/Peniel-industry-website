// Every brand's base coat (20261118000001): Coca-Cola and Habesha products
// transparent, every other brand white; a new brand gets it by that rule.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BGI, DSH, DSH_BRAND, HAB, HAB_BRAND_FETA, HAB_BRAND_HABESHA, pool } from "./helpers.ts";

after(() => pool.end());

const MIGRATION = new URL("../../supabase/migrations/20261118000001_brand_base_coats.sql", import.meta.url);
const coat = async (id: string) => (await pool.query("select base_coat from public.brands where id = $1", [id])).rows[0].base_coat as string | null;

test("Habesha brands transparent, other breweries white", async () => {
  assert.equal(await coat(HAB_BRAND_HABESHA), "transparent");
  assert.equal(await coat(HAB_BRAND_FETA), "transparent");
  assert.equal(await coat(DSH_BRAND), "white");
  const { rows } = await pool.query("select count(*)::int as n from public.brands where company_id = $1 and base_coat <> 'white'", [BGI]);
  assert.equal(rows[0].n, 0);
});

test("Coca-Cola products (East Africa Bottling) transparent; a new brand gets the rule's coat", async () => {
  const eab = (await pool.query("insert into public.companies (name, code) values ('East Africa Bottling S.C.', 'EAB') returning id")).rows[0].id as string;
  const add = async (company: string, name: string, base: string | null = null) =>
    (await pool.query("insert into public.brands (company_id, name, base_coat) values ($1, $2, $3) returning base_coat", [company, name, base])).rows[0].base_coat;
  assert.equal(await add(eab, "Sprite"), "transparent");
  assert.equal(await add(eab, "Fanta Orange"), "transparent");
  assert.equal(await add(HAB, "Habesha Kostara"), "transparent");
  assert.equal(await add(DSH, "Balageru"), "white");
  // Chosen on the form: kept.
  assert.equal(await add(DSH, "Dashen Special", "transparent"), "transparent");
});

test("running it again sets every brand by the rule, and changes nothing more", async () => {
  await pool.query("update public.brands set base_coat = null where id = $1", [HAB_BRAND_HABESHA]);
  await pool.query("update public.brands set base_coat = 'transparent' where id = $1", [DSH_BRAND]);
  await pool.query(readFileSync(MIGRATION, "utf8"));
  assert.equal(await coat(HAB_BRAND_HABESHA), "transparent");
  assert.equal(await coat(DSH_BRAND), "white");
  const before = (await pool.query("select id, base_coat from public.brands order by id")).rows;
  await pool.query(readFileSync(MIGRATION, "utf8"));
  assert.deepEqual((await pool.query("select id, base_coat from public.brands order by id")).rows, before);
});
