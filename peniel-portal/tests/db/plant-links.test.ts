// Linking the plant: stillages to the press, production per liner, and raw
// materials used automatically as work is logged.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, errorCode, HAB_BRAND_HABESHA, HAB_ORDER_HABESHA, pool } from "./helpers.ts";

let production: string;
let warehouse: string;
let admin: string;

before(async () => {
  production = await createUser({ email: "prod@links.test", role: "production" });
  warehouse = await createUser({ email: "store@links.test", role: "warehouse" });
  admin = await createUser({ email: "boss@links.test", role: "admin" });
});

after(() => pool.end());

const commit = <T>(user: string, fn: (db: { query: typeof pool.query }) => Promise<T>) =>
  as(user, async (db) => {
    const r = await fn(db);
    await db.query("commit");
    return r;
  });

const newStillage = (no: string, extra = "") =>
  commit(production, async (db) =>
    (await db.query(`insert into public.print_runs (brand_id, shift, stillage_no, sheets_printed, sheets_spoiled${extra ? ", " + extra.split("=")[0] : ""}) values ($1, 'A', $2, 1400, 10${extra ? ", " + extra.split("=")[1] : ""}) returning id`, [HAB_BRAND_HABESHA, no])).rows[0].id as string,
  );

const onHand = async (name: string) => Number((await pool.query("select on_hand from public.raw_materials where name = $1", [name])).rows[0].on_hand);

test("liners are production lines; the setup lines are kept for history but hidden", async () => {
  const { rows } = await pool.query(
    "select l.name, l.active, m.code from public.production_lines l left join public.machines m on m.id = l.machine_id order by l.name",
  );
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(byName["Press 1 · Liner 1A"].code, "liner-1a");
  assert.equal(byName["Press 3 · Liner 3B"].code, "liner-3b");
  assert.equal(byName["Line 1 · Press A"].active, false);
  assert.equal(rows.filter((r) => r.code).length, 6);
  // A new liner gets its line; renaming it (or its press) follows.
  await pool.query("insert into public.machines (code, name, category, parent_id) select 'liner-1c', 'Liner 1C', 'press', id from public.machines where code = 'press-1'");
  await pool.query("update public.machines set name = 'Press One' where code = 'press-1'");
  const { rows: after } = await pool.query("select name from public.production_lines where machine_id in (select id from public.machines where code in ('liner-1a', 'liner-1c')) order by name");
  assert.deepEqual(after.map((r) => r.name), ["Press One · Liner 1A", "Press One · Liner 1C"]);
  await pool.query("update public.machines set name = 'Press 1' where code = 'press-1'");
});

test("only a finished stillage goes to the press", async () => {
  const id = await newStillage("ST-500");
  const press = (await pool.query("select id from public.machines where code = 'press-1'")).rows[0].id;
  const send = () => commit(production, (db) => db.query("update public.print_runs set to_press_at = now(), press_id = $2 where id = $1", [id, press]));
  assert.equal(await errorCode(send()), "23514");
  await commit(production, async (db) => {
    await db.query("insert into public.stillage_passes (print_run_id, stage, started_at, finished_at) values ($1, 'varnish', '2026-09-26T08:00:00Z', '2026-09-26T08:30:00Z')", [id]);
    await db.query("insert into public.stillage_passes (print_run_id, stage, started_at, finished_at) values ($1, 'lacquer', '2026-09-26T09:00:00Z', '2026-09-26T09:30:00Z')", [id]);
  });
  await send();
  const { rows } = await pool.query("select to_press_at, press_id from public.print_runs where id = $1", [id]);
  assert.ok(rows[0].to_press_at);
  assert.equal(rows[0].press_id, press);
  // Undo: back in stock, the press is cleared.
  await commit(production, (db) => db.query("update public.print_runs set to_press_at = null where id = $1", [id]));
  assert.equal((await pool.query("select press_id from public.print_runs where id = $1", [id])).rows[0].press_id, null);
});

test("materials with a rate are used automatically, and kept in step on edit and delete", async () => {
  await pool.query("update public.raw_materials set use_basis = 'sheet_in', use_rate = 1 where name = 'Tinplate sheet 0.23 mm'");
  await pool.query("update public.raw_materials set use_basis = 'sheet_printed', use_rate = 0.002 where name = 'Varnish'");
  await pool.query("update public.raw_materials set use_basis = 'lacquer_sheet', use_rate = 0.01 where name = 'Lacquer'");
  await pool.query("update public.raw_materials set use_basis = 'thousand_crowns', use_rate = 0.5 where name = 'PVC-free liner compound'");
  const tin0 = await onHand("Tinplate sheet 0.23 mm");
  const ink0 = await onHand("Varnish");
  const lac0 = await onHand("Lacquer");
  const liner0 = await onHand("PVC-free liner compound");

  const id = await newStillage("ST-600");
  assert.equal(await onHand("Tinplate sheet 0.23 mm"), tin0 - 1410);
  assert.equal(await onHand("Varnish"), ink0 - 2.82);
  // A corrected count re-computes; no double counting.
  await commit(production, (db) => db.query("update public.print_runs set sheets_printed = 1390 where id = $1", [id]));
  assert.equal(await onHand("Tinplate sheet 0.23 mm"), tin0 - 1400);
  await commit(production, async (db) => {
    await db.query("insert into public.stillage_passes (print_run_id, stage, started_at, finished_at) values ($1, 'varnish', '2026-09-26T08:00:00Z', '2026-09-26T08:30:00Z')", [id]);
    await db.query("insert into public.stillage_passes (print_run_id, stage, started_at) values ($1, 'lacquer', '2026-09-26T09:00:00Z')", [id]);
  });
  assert.equal(await onHand("Lacquer"), lac0 - 13.9);

  const entry = await commit(production, async (db) =>
    (await db.query(
      "insert into public.production_entries (order_id, entry_date, shift, line_id, produced_qty, reject_qty) select $1, '2026-09-26', 'A', id, 1000000, 2000 from public.production_lines where machine_id is not null limit 1 returning id",
      [HAB_ORDER_HABESHA],
    )).rows[0].id as string,
  );
  assert.equal(await onHand("PVC-free liner compound"), liner0 - 501);

  // Deleting (admin only) gives it back.
  await commit(admin, (db) => db.query("delete from public.production_entries where id = $1", [entry]));
  await commit(admin, (db) => db.query("delete from public.print_runs where id = $1", [id]));
  assert.equal(await onHand("PVC-free liner compound"), liner0);
  assert.equal(await onHand("Tinplate sheet 0.23 mm"), tin0);
  assert.equal(await onHand("Lacquer"), lac0);
  assert.equal(await onHand("Varnish"), ink0);
});

test("automatic use can take stock below zero; by hand it can't", async () => {
  await pool.query("update public.raw_materials set use_basis = 'oven_pass', use_rate = 100000, on_hand = 10 where name = 'Varnish'");
  const id = await newStillage("ST-700");
  await commit(production, (db) => db.query("insert into public.stillage_passes (print_run_id, stage, started_at) values ($1, 'varnish', now())", [id]));
  assert.ok((await onHand("Varnish")) < 0, "a count is due");
  const mat = (await pool.query("select id from public.raw_materials where name = 'Lacquer'")).rows[0].id;
  const all = await onHand("Lacquer");
  assert.equal(
    await errorCode(commit(warehouse, (db) => db.query("insert into public.raw_material_movements (material_id, quantity, reason) values ($1, $2, 'issued')", [mat, -(all + 1)]))),
    "23514",
  );
});

test("packing: 1 box and 1 polybag per 10,000 good crowns; printing ink is off the list", async () => {
  const box0 = await onHand("Box");
  const bag0 = await onHand("Polybag");
  const entry = await commit(production, async (db) =>
    (await db.query(
      "insert into public.production_entries (order_id, entry_date, shift, line_id, produced_qty, reject_qty) select $1, '2026-09-27', 'B', id, 233464, 700 from public.production_lines where machine_id is not null limit 1 returning id",
      [HAB_ORDER_HABESHA],
    )).rows[0].id as string,
  );
  // Good crowns only (camera rejects go to sorting): 233,464 / 10,000 = 23.346 boxes.
  assert.equal(await onHand("Box"), box0 - 23.346);
  assert.equal(await onHand("Polybag"), bag0 - 23.346);

  // A material taken off the list isn't used automatically.
  await pool.query("update public.raw_materials set active = false where name = 'Polybag'");
  await commit(production, (db) => db.query("update public.production_entries set produced_qty = 100000 where id = $1", [entry]));
  assert.equal(await onHand("Box"), box0 - 10);
  assert.equal(await onHand("Polybag"), bag0);
  await pool.query("update public.raw_materials set active = true where name = 'Polybag'");
  await commit(admin, (db) => db.query("delete from public.production_entries where id = $1", [entry]));

  const ink = await pool.query("select 1 from public.raw_materials where name = 'Printing ink' and active");
  assert.equal(ink.rowCount, 0);
});
