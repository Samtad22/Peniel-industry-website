// Shipments received by invoice (20261109000002): each invoice line is a
// delivery in, on top of the stock already there. And the base coat used by
// colour: white and transparent apart (20261109000001).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { as, createUser, HAB, HAB_BRAND_FETA, HAB_BRAND_HABESHA, pool } from "./helpers.ts";

after(() => pool.end());

const MIGRATION = new URL("../../supabase/migrations/20261109000002_shipments_received.sql", import.meta.url);
const rerun = () => pool.query(readFileSync(MIGRATION, "utf8"));

/** The unit, usage basis and total received by invoice of a material. */
const received = async (name: string) => {
  const { rows } = await pool.query(
    `select m.unit, m.active, m.ink_name, m.use_basis, coalesce(sum(mv.quantity), 0)::float as qty, count(mv.id)::int as lines
     from public.raw_materials m
     left join public.raw_material_movements mv on mv.material_id = m.id and mv.reason like 'Received: invoice PK/%'
     where m.name = $1 group by m.id`,
    [name],
  );
  return rows[0] as { unit: string; active: boolean; ink_name: string | null; use_basis: string | null; qty: number; lines: number } | undefined;
};
const onHand = async (name: string) => Number((await pool.query("select on_hand from public.raw_materials where name = $1", [name])).rows[0].on_hand);

test("every invoice line is recorded once", async () => {
  const { rows } = await pool.query("select count(*)::int as n from public.raw_material_movements where reason like 'Received: invoice PK/%'");
  assert.equal(rows[0].n, 28);
});

test("each line goes to the right material, in its unit", async () => {
  const plain = { active: true, ink_name: null, use_basis: null };
  assert.deepEqual(await received("Transparent base coat"), { ...plain, unit: "kg", use_basis: "transparent_base_coat_sheet", qty: 1800, lines: 1 });
  assert.deepEqual(await received("White base coat"), { ...plain, unit: "kg", use_basis: "white_base_coat_sheet", qty: 7500, lines: 2 });
  assert.deepEqual(await received("CTP plate developer"), { ...plain, unit: "L", qty: 960, lines: 2 });
  // Two blankets: Japanese and Chinese.
  assert.deepEqual(await received("Printing blanket (Japanese)"), { ...plain, unit: "pcs", qty: 30, lines: 1 });
  assert.deepEqual(await received("Printing blanket (Chinese)"), { ...plain, unit: "pcs", qty: 20, lines: 1 });
  assert.deepEqual(await received("PVC-free liner compound"), { ...plain, unit: "kg", qty: 52000, lines: 1 });
  // Cartons and corrugated boxes are the Box already on the list (in "boxes").
  assert.deepEqual(await received("Box"), { ...plain, use_basis: "box", unit: "boxes", qty: 32200, lines: 2 });
  // Tinplate by the pallet: 144 + 147 pallets of 1,390 sheets.
  assert.deepEqual(await received("Tinplate sheet 0.23 mm"), { ...plain, unit: "sheets", qty: 291 * 1390, lines: 2 });
  assert.equal(
    (await pool.query("select reason from public.raw_material_movements where reason like 'Received: invoice PK/26017 of 08 Jul 2026, line 1 (%'")).rows[0].reason,
    "Received: invoice PK/26017 of 08 Jul 2026, line 1 (USD 750.00/t, 299.989 t, 144 pallets x 1,390 sheets)",
  );
  assert.deepEqual(await received("Adhesive lacquer"), { ...plain, unit: "kg", qty: 6000, lines: 1 });
});

test("kg and L are the same: Varnish in litres takes the kg as they are", async () => {
  assert.deepEqual(await received("Varnish"), { active: true, ink_name: null, use_basis: null, unit: "L", qty: 6000, lines: 1 });
  assert.equal(await received("Over print varnish"), undefined, "no second varnish");
  const { rows } = await pool.query("select reason from public.raw_material_movements where reason like 'Received: invoice PK/26019-2 of 15 Sep 2026, line 2 (%'");
  assert.equal(rows[0].reason, "Received: invoice PK/26019-2 of 15 Sep 2026, line 2 (USD 3.30/kg, 6,000 kg = 6,000 L)");
});

test("UV inks are inks, choosable on the print forms", async () => {
  const ink = { active: true, use_basis: null, unit: "kg", lines: 1 };
  assert.deepEqual(await received("Ink · Opaque White UV-H4003"), { ...ink, ink_name: "Opaque White UV-H4003", qty: 600 });
  assert.deepEqual(await received("Ink · Bright Red UV-H9208"), { ...ink, ink_name: "Bright Red UV-H9208", qty: 100 });
  assert.deepEqual(await received("Ink · Transparent Yellow UV-H1022"), { ...ink, ink_name: "Transparent Yellow UV-H1022", qty: 120 });
  assert.deepEqual(await received("Ink · White UV-4105"), { ...ink, ink_name: "White UV-4105", qty: 60 });
  // Not inks: no colour.
  assert.equal((await received("Ink adjuster UV-905"))?.ink_name, null);
  assert.equal((await received("Adhesive remover UV-4011"))?.ink_name, null);
});

test("adds to the stock on hand; running it again adds nothing", async () => {
  const before = (await pool.query("select name, on_hand::float as on_hand from public.raw_materials order by name")).rows;
  await rerun();
  const again = (await pool.query("select name, on_hand::float as on_hand from public.raw_materials order by name")).rows;
  assert.deepEqual(again, before);
});

test("a material kept in barrels takes kg / 200", async () => {
  await pool.query("delete from public.raw_material_movements where reason like 'Received: invoice PK/26019-1 of 10 Sep 2026, line 2 (%'");
  await pool.query("update public.raw_materials set unit = 'barrels' where name = 'Transparent base coat'");
  await rerun();
  assert.equal(await onHand("Transparent base coat"), 9);
  const { rows } = await pool.query("select reason from public.raw_material_movements where reason like 'Received: invoice PK/26019-1 of 10 Sep 2026, line 2 (%'");
  assert.equal(rows[0].reason, "Received: invoice PK/26019-1 of 10 Sep 2026, line 2 (USD 3.60/kg, 1,800 kg = 9 barrels of 200)");
});

test("a material kept in an unrelated unit with history keeps its own; the delivery goes to a new one", async () => {
  await pool.query("delete from public.raw_material_movements where reason like 'Received: invoice PK/26019-1 of 10 Sep 2026, line 3 (%'");
  await pool.query("update public.raw_materials set unit = 'cans' where name = 'Thinner'");
  await pool.query("insert into public.raw_material_movements (material_id, quantity, reason) select id, 40, 'Counted' from public.raw_materials where name = 'Thinner'");
  await rerun();
  assert.deepEqual((await pool.query("select unit, on_hand::float as on_hand from public.raw_materials where name = 'Thinner'")).rows[0], { unit: "cans", on_hand: 40 });
  assert.equal((await received("Thinner (kg)"))?.qty, 1800);
});

test("the white base coat is used only on white-coated sheets, the transparent only on transparent", async () => {
  await pool.query("update public.raw_materials set use_rate = 0.01 where name = 'White base coat'");
  await pool.query("update public.raw_materials set unit = 'kg', use_rate = 0.02 where name = 'Transparent base coat'");
  const white0 = await onHand("White base coat");
  const clear0 = await onHand("Transparent base coat");
  const stillage = async (no: string, brand: string | null, coat: string | null) => {
    const id = (await pool.query("insert into public.print_runs (brand_id, shift, stillage_no, sheets_printed, printed, base_sheets) values ($1, 'A', $2, 0, false, 1000) returning id", [brand, no])).rows[0].id as string;
    await pool.query("insert into public.stillage_passes (print_run_id, stage, material, started_at) values ($1, 'base_coat', $2, now())", [id, coat]);
    return id;
  };
  // The coat recorded on the pass.
  await stillage("BC-W", null, "White base coat");
  assert.equal(await onHand("White base coat"), white0 - 10);
  assert.equal(await onHand("Transparent base coat"), clear0);
  await stillage("BC-T", null, "Transparent base coat");
  assert.equal(await onHand("Transparent base coat"), clear0 - 20);
  assert.equal(await onHand("White base coat"), white0 - 10);
  // No coat on the pass: the brand's.
  await pool.query("update public.brands set base_coat = 'transparent' where id = $1", [HAB_BRAND_FETA]);
  const id = await stillage("BC-F", HAB_BRAND_FETA, null);
  assert.equal(await onHand("Transparent base coat"), clear0 - 40);
  // Changing the coat on the pass moves the use across.
  await pool.query("update public.stillage_passes set material = 'White base coat' where print_run_id = $1", [id]);
  assert.equal(await onHand("Transparent base coat"), clear0 - 20);
  assert.equal(await onHand("White base coat"), white0 - 20);
  // A base coat with neither: nothing of either.
  await pool.query("update public.brands set base_coat = null where id = $1", [HAB_BRAND_HABESHA]);
  await stillage("BC-N", HAB_BRAND_HABESHA, null);
  assert.equal(await onHand("White base coat"), white0 - 20);
  assert.equal(await onHand("Transparent base coat"), clear0 - 20);
});

test("staff read the deliveries; customers don't", async () => {
  const wh = await createUser({ email: "wh@shipments.test", role: "warehouse" });
  const buyer = await createUser({ email: "buyer@shipments.test", role: "customer_user", companyId: HAB });
  const n = (user: string) => as(user, async (db) => (await db.query("select count(*)::int as n from public.raw_material_movements where reason like 'Received: invoice PK/%'")).rows[0].n);
  assert.ok((await n(wh)) > 0);
  assert.equal(await n(buyer), 0);
});
