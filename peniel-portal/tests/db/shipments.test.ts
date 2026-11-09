// Shipments received by invoice (20261109000001): each invoice line is a
// delivery in, on top of the stock already there.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { as, createUser, pool } from "./helpers.ts";

after(() => pool.end());

const MIGRATION = new URL("../../supabase/migrations/20261109000001_shipments_received.sql", import.meta.url);

/** The unit, and the total received by invoice, of a material. */
const received = async (name: string) => {
  const { rows } = await pool.query(
    `select m.unit, m.active, m.ink_name, coalesce(sum(mv.quantity), 0)::float as qty, count(mv.id)::int as lines
     from public.raw_materials m
     left join public.raw_material_movements mv on mv.material_id = m.id and mv.reason like 'Received: invoice PK/%'
     where m.name = $1 group by m.id`,
    [name],
  );
  return rows[0] as { unit: string; active: boolean; ink_name: string | null; qty: number; lines: number } | undefined;
};

test("every invoice line is recorded once", async () => {
  const { rows } = await pool.query("select count(*)::int as n from public.raw_material_movements where reason like 'Received: invoice PK/%'");
  assert.equal(rows[0].n, 26);
});

test("each line goes to the right material, in the invoice's unit", async () => {
  assert.deepEqual(await received("White base coat"), { unit: "kg", active: true, ink_name: null, qty: 7500, lines: 2 });
  assert.deepEqual(await received("Transparent base coat"), { unit: "kg", active: true, ink_name: null, qty: 1800, lines: 1 });
  assert.deepEqual(await received("CTP plate developer"), { unit: "L", active: true, ink_name: null, qty: 960, lines: 2 });
  assert.deepEqual(await received("Printing blanket"), { unit: "pcs", active: true, ink_name: null, qty: 50, lines: 2 });
  assert.deepEqual(await received("PVC-free liner compound"), { unit: "kg", active: true, ink_name: null, qty: 52000, lines: 1 });
  // Cartons and corrugated boxes are the Box already on the list (in "boxes").
  assert.deepEqual(await received("Box"), { unit: "boxes", active: true, ink_name: null, qty: 32200, lines: 2 });
  // Varnish was on the list in litres, never used: kept in kg from now on.
  assert.deepEqual(await received("Varnish"), { unit: "kg", active: true, ink_name: null, qty: 6000, lines: 1 });
  assert.equal((await received("Over print varnish")), undefined, "no second varnish");
  assert.deepEqual(await received("Adhesive lacquer"), { unit: "kg", active: true, ink_name: null, qty: 6000, lines: 1 });
});

test("UV inks are inks, choosable on the print forms", async () => {
  assert.deepEqual(await received("Ink · Opaque White UV-H4003"), { unit: "kg", active: true, ink_name: "Opaque White UV-H4003", qty: 600, lines: 1 });
  assert.deepEqual(await received("Ink · Bright Red UV-H9208"), { unit: "kg", active: true, ink_name: "Bright Red UV-H9208", qty: 100, lines: 1 });
  assert.deepEqual(await received("Ink · Transparent Yellow UV-H1022"), { unit: "kg", active: true, ink_name: "Transparent Yellow UV-H1022", qty: 120, lines: 1 });
  assert.deepEqual(await received("Ink · White UV-4105"), { unit: "kg", active: true, ink_name: "White UV-4105", qty: 60, lines: 1 });
  // Not inks: no colour.
  assert.equal((await received("Ink adjuster UV-905"))?.ink_name, null);
  assert.equal((await received("Adhesive remover UV-4011"))?.ink_name, null);
});

test("adds to the stock on hand; running it again adds nothing", async () => {
  const before = (await pool.query("select name, on_hand::float as on_hand from public.raw_materials order by name")).rows;
  await pool.query(readFileSync(MIGRATION, "utf8"));
  const again = (await pool.query("select name, on_hand::float as on_hand from public.raw_materials order by name")).rows;
  assert.deepEqual(again, before);
});

test("a material kept in another unit with history keeps its own; the delivery goes to a new one", async () => {
  await pool.query("delete from public.raw_material_movements where reason like 'Received: invoice PK/26019-1 of 10 Sep 2026, line 3 %'");
  await pool.query("update public.raw_materials set unit = 'L' where name = 'Thinner'");
  await pool.query("insert into public.raw_material_movements (material_id, quantity, reason) select id, 40, 'Counted' from public.raw_materials where name = 'Thinner'");
  await pool.query(readFileSync(MIGRATION, "utf8"));
  const thinner = (await pool.query("select unit, on_hand::float as on_hand from public.raw_materials where name = 'Thinner'")).rows[0];
  assert.deepEqual(thinner, { unit: "L", on_hand: 40 });
  assert.deepEqual(await received("Thinner (kg)"), { unit: "kg", active: true, ink_name: null, qty: 1800, lines: 1 });
});

test("staff read the deliveries; customers don't", async () => {
  const wh = await createUser({ email: "wh@shipments.test", role: "warehouse" });
  const buyer = await createUser({ email: "buyer@shipments.test", role: "customer_user", companyId: "11111111-1111-4111-8111-111111111111" });
  const n = (user: string) => as(user, async (db) => (await db.query("select count(*)::int as n from public.raw_material_movements where reason like 'Received: invoice PK/%'")).rows[0].n);
  assert.ok((await n(wh)) > 0);
  assert.equal(await n(buyer), 0);
});
