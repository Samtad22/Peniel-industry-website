// The consumption baseline (20261117000005): per-sheet usage rates and each
// brand's ink grams from Peniel's Consumption Summary.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DSH, DSH_BRAND, pool } from "./helpers.ts";

after(() => pool.end());

const MIGRATION = new URL("../../supabase/migrations/20261117000005_consumption_baseline.sql", import.meta.url);
/** Runs the migration again and returns its report (the last statement's rows). */
const rerun = async () => {
  const res = (await pool.query(readFileSync(MIGRATION, "utf8"))) as unknown as { rows: { what: string; item: string; result: string }[] }[];
  return res[res.length - 1].rows;
};
const material = async (name: string) =>
  (await pool.query("select unit, use_basis, use_rate::float as rate from public.raw_materials where name = $1", [name])).rows[0] as { unit: string; use_basis: string; rate: number };
const brandRates = async (brandId: string) =>
  Object.fromEntries(
    (await pool.query("select m.ink_name, r.g_per_sheet::float as g from public.brand_ink_rates r join public.raw_materials m on m.id = r.material_id where r.brand_id = $1", [brandId])).rows.map((r) => [r.ink_name, r.g]),
  );

test("per-sheet usage rates go on the items the invoices were recorded on, in their unit", async () => {
  assert.deepEqual(await material("Varnish"), { unit: "L", use_basis: "varnish_sheet", rate: 0.015 });
  assert.deepEqual(await material("Adhesive lacquer"), { unit: "kg", use_basis: "lacquer_sheet", rate: 0.015 });
  assert.deepEqual(await material("White base coat"), { unit: "kg", use_basis: "white_base_coat_sheet", rate: 0.02515 });
  assert.deepEqual(await material("Transparent base coat"), { unit: "kg", use_basis: "transparent_base_coat_sheet", rate: 0.0076 });
  assert.deepEqual(await material("Fountain solution (alcohol-free)"), { unit: "L", use_basis: "sheet_printed", rate: 0.00075 });
  assert.deepEqual(await material("Multifunctional washing water"), { unit: "L", use_basis: "sheet_printed", rate: 0.0011 });
  assert.deepEqual(await material("Specific car wash water"), { unit: "L", use_basis: "sheet_printed", rate: 0.0032 });
  assert.deepEqual(await material("CTP plate developer"), { unit: "L", use_basis: "sheet_printed", rate: 0.00023 });
});

test("supplier inks are on the list once; the shipment's UV inks are reused", async () => {
  await rerun();
  const { rows } = await pool.query("select ink_name from public.raw_materials where ink_name is not null and ink_name !~* '^(pantone|black$)'");
  assert.deepEqual(
    rows.map((r) => r.ink_name as string).sort(),
    [
      "Black 5001",
      "Blue 3401",
      "Bright Red UV-H9208",
      "Green UV60",
      "Opaque White UV-H4003",
      "Red 2401",
      "Red 6614",
      "Silver UV47",
      "Silver connecting material",
      "Transparent White",
      "Transparent Yellow UV-H1022",
      "White UV-4105",
      "Yellow 1401",
      "Yellow 1408",
    ],
  );
});

test("each brand gets its grams per sheet; mixed lines are split evenly; missing brands are reported", async () => {
  const coca = (await pool.query("insert into public.brands (company_id, name) values ($1, 'Coca-Cola') returning id", [DSH])).rows[0].id as string;
  const report = await rerun();
  // Dashen (the seed's brand of that name).
  assert.deepEqual(await brandRates(DSH_BRAND), {
    "Opaque White UV-H4003": 4.38,
    "Transparent White": 2.18,
    "Red 6614": 0.088,
    "Red 2401": 0.088,
    "Yellow 1408": 1.47,
    "Green UV60": 0.06,
  });
  // "Coca" matches Coca-Cola; its red and yellow mixes are split.
  assert.deepEqual(await brandRates(coca), {
    "Red 6614": 0.425,
    "Red 2401": 0.425,
    "Transparent Yellow UV-H1022": 0.2767,
    "Yellow 1408": 0.2767,
    "Yellow 1401": 0.2767,
    "Opaque White UV-H4003": 3.63,
  });
  const missing = report.filter((r) => r.result.startsWith("no brand")).map((r) => r.item).sort();
  assert.deepEqual(missing, ["Balageru", "Heineken", "Meta"]);
  assert.ok(report.some((r) => r.what === "Usage rate" && r.item === "Varnish" && r.result === "0.015 L per varnish sheet"));
  // A figure changed by hand is replaced by the baseline on a re-run; nothing doubles.
  await pool.query("update public.brand_ink_rates set g_per_sheet = 9 where brand_id = $1", [coca]);
  await rerun();
  assert.equal((await brandRates(coca))["Red 6614"], 0.425);
  assert.equal((await pool.query("select count(*)::int as n from public.brand_ink_rates where brand_id = $1", [coca])).rows[0].n, 6);
});
