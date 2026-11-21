// Lots with production and expiry dates (20261121000001), and the stock
// count from the control sheets (supabase/scripts/2026-11-21_...).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { as, createUser, errorCode, HAB, pool } from "./helpers.ts";

after(() => pool.end());

const SCRIPT = new URL("../../supabase/scripts/2026-11-21_stock_count_from_control_sheets.sql", import.meta.url);
const run = async () => {
  const c = await pool.connect();
  try {
    const res = await c.query(readFileSync(SCRIPT, "utf8"));
    const last = Array.isArray(res) ? res[res.length - 1] : res;
    return last.rows as { item: string; material: string; unit: string; was: string; now: string; lots: number; done: string }[];
  } finally {
    c.release();
  }
};
const material = async (name: string) =>
  (await pool.query("select id, unit, on_hand::float as on_hand, part_no, ink_name, active from public.raw_materials where name = $1", [name])).rows[0];

test("warehouse and production add dates; only admin deletes; customers never read them", async () => {
  const admin = await createUser({ email: "admin@lots.test", role: "admin" });
  const wh = await createUser({ email: "wh@lots.test", role: "warehouse" });
  const sales = await createUser({ email: "sales@lots.test", role: "sales" });
  const buyer = await createUser({ email: "buyer@lots.test", role: "customer_user", companyId: HAB });
  const box = (await material("Box")).id as string;
  const add = (user: string) =>
    as(user, async (db) => {
      const r = (await db.query("insert into public.raw_material_lots (material_id, quantity, produced_on, expires_on) values ($1, 100, '2026-07-01', '2027-07-01') returning id", [box])).rows[0];
      await db.query("commit");
      return r.id as string;
    });
  const id = await add(wh);
  assert.equal(await errorCode(add(sales)), "42501");
  assert.equal(await errorCode(add(buyer)), "42501");
  // Expiry before production: refused.
  assert.equal(await errorCode(pool.query("insert into public.raw_material_lots (material_id, quantity, produced_on, expires_on) values ($1, 1, '2026-07-01', '2026-06-01')", [box])), "23514");
  await as(wh, (db) => db.query("delete from public.raw_material_lots where id = $1", [id]));
  assert.equal(Number((await pool.query("select count(*) from public.raw_material_lots where id = $1", [id])).rows[0].count), 1);
  await as(admin, async (db) => {
    await db.query("delete from public.raw_material_lots where id = $1", [id]);
    await db.query("commit");
  });
  assert.equal(Number((await pool.query("select count(*) from public.raw_material_lots where id = $1", [id])).rows[0].count), 0);
  assert.equal(Number((await as(buyer, (db) => db.query("select count(*) from public.raw_material_lots"))).rows[0].count), 0);
});

test("the stock count sets each item to the sheets, with its dates, once", async () => {
  const report = await run();
  assert.equal(report.filter((r) => r.item !== "unused inks").length, 68);
  // Matched and set.
  assert.deepEqual(await material("PVC-free liner compound").then((m) => [m.unit, m.on_hand]), ["kg", 90600]);
  assert.deepEqual(await material("Polybag").then((m) => [m.on_hand]), [605500]);
  assert.deepEqual(await material("Printing blanket (Chinese)").then((m) => [m.on_hand]), [46]);
  assert.deepEqual(await material("White base coat").then((m) => [m.on_hand, m.part_no]), [7000, "601"]);
  // A supplier ink takes the sheet's name and part number.
  const yellow = await material("Ink · High Temperature Yellow UV-H1408");
  assert.deepEqual([yellow.on_hand, yellow.part_no, yellow.ink_name], [70, "UV-H1408", "High Temperature Yellow UV-H1408"]);
  // New ones.
  assert.equal((await material("Sticker")).on_hand, 349392);
  assert.equal((await material("Ink · UV Poly Base Red 53.1")).on_hand, 30);
  // Tinplate is left as it is.
  assert.ok(!report.some((r) => /tinplate/i.test(r.material ?? "")));
  // The lots: adhesive remover's two deliveries, one expired.
  const remover = (await material("Adhesive remover UV-4011")).id;
  const lots = (await pool.query("select quantity::float as q, expires_on::text as exp from public.raw_material_lots where material_id = $1 order by received_on", [remover])).rows;
  assert.deepEqual(lots, [
    { q: 60, exp: "2026-04-01" },
    { q: 60, exp: "2027-07-13" },
  ]);
  // The count is one movement, named.
  const mv = (await pool.query("select reason from public.raw_material_movements where material_id = $1 and reason like 'Stock count 20 Nov 2026%'", [remover])).rows;
  assert.equal(mv.length, 1);
  assert.match(mv[0].reason, /set to 98 kg \(was 60\)\. 49 cans of 2 kg$/);

  // Again: nothing more.
  const before = (await pool.query("select name, on_hand::float from public.raw_materials order by name")).rows;
  const lotCount = Number((await pool.query("select count(*) from public.raw_material_lots")).rows[0].count);
  const again = await run();
  assert.ok(again.filter((r) => r.item !== "unused inks").every((r) => r.lots === 0 && /^matched/.test(r.done)));
  assert.deepEqual((await pool.query("select name, on_hand::float from public.raw_materials order by name")).rows, before);
  assert.equal(Number((await pool.query("select count(*) from public.raw_material_lots")).rows[0].count), lotCount);
});

test("inks the brands' colours made, never stocked or used, go off the list; others stay", async () => {
  // An ink a brand's colour made (as the trigger does), never stocked or used.
  await pool.query("update public.brands set colours = array['PANTONE 7704 C'] where id = (select id from public.brands order by name limit 1)");
  const made = (await pool.query("select id from public.raw_materials where ink_name = 'PANTONE 7704 C'")).rows[0].id as string;
  const used = (await pool.query("insert into public.raw_materials (name, unit, on_hand, ink_name) values ('Ink · Test used', 'kg', 0, 'Test used') returning id")).rows[0].id as string;
  await pool.query("insert into public.raw_material_movements (material_id, quantity, reason) values ($1, 5, 'In'), ($1, -5, 'Out')", [used]);
  await run();
  assert.equal((await pool.query("select active from public.raw_materials where id = $1", [made])).rows[0].active, false);
  assert.equal((await pool.query("select active from public.raw_materials where id = $1", [used])).rows[0].active, true);
  // A colour added to a brand later doesn't bring it back.
  await pool.query("update public.brands set colours = array['PANTONE 7704 C'] where id = (select id from public.brands order by name desc limit 1)");
  assert.equal(Number((await pool.query("select count(*) from public.raw_materials where ink_name = 'PANTONE 7704 C'")).rows[0].count), 1);
});
