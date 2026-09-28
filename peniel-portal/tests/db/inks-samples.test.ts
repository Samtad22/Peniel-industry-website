// Inks as raw materials, ink used per stillage and sample sheet, and
// base-coated stock with no brand yet (20261022000001).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, errorCode, HAB, HAB_BRAND_FETA, HAB_BRAND_HABESHA, pool } from "./helpers.ts";

let admin: string;
let production: string;
let warehouse: string;
let quality: string;
let customer: string;

before(async () => {
  admin = await createUser({ email: "admin@inks.test", role: "admin" });
  production = await createUser({ email: "prod@inks.test", role: "production" });
  warehouse = await createUser({ email: "wh@inks.test", role: "warehouse" });
  quality = await createUser({ email: "qc@inks.test", role: "quality" });
  customer = await createUser({ email: "buyer@inks.test", role: "customer_user", companyId: HAB });
  await pool.query("update public.brands set colours = $2 where id = $1", [HAB_BRAND_HABESHA, ["PANTONE 485 C #DA291C", "Black", "#FFCD00"]]);
  await pool.query("update public.brands set colours = $2 where id = $1", [HAB_BRAND_FETA, ["pantone 485 c", "PANTONE 7621 C"]]);
  // One tinplate sheet per sheet into the line.
  await pool.query("update public.raw_materials set use_basis = 'sheet_in', use_rate = 1 where name = 'Tinplate sheet 0.23 mm'");
});

after(() => pool.end());

const commit = <T>(user: string, fn: (db: { query: typeof pool.query }) => Promise<T>) =>
  as(user, async (db) => {
    const r = await fn(db);
    await db.query("commit");
    return r;
  });

const ink = async (name: string) => (await pool.query("select id, on_hand::float as on_hand from public.raw_materials where lower(ink_name) = lower($1)", [name])).rows[0] as { id: string; on_hand: number } | undefined;
const tinplate = async () => Number((await pool.query("select on_hand from public.raw_materials where name = 'Tinplate sheet 0.23 mm'")).rows[0].on_hand);

test("every brand colour is an ink on the list, once, in kg", async () => {
  const inks = await pool.query("select name, unit, ink_name from public.raw_materials where ink_name is not null order by ink_name");
  assert.deepEqual(
    inks.rows.map((r) => [r.ink_name, r.unit]),
    [
      ["Black", "kg"],
      ["PANTONE 485 C", "kg"],
      ["PANTONE 7621 C", "kg"],
    ],
    "the same Pantone on two brands is one ink; a bare #hex is not an ink",
  );
  assert.equal(inks.rows.find((r) => r.ink_name === "Black").name, "Ink · Black");
  // A colour added later (by sales, who can't write raw materials) still gets its ink.
  const sales = await createUser({ email: "sales@inks.test", role: "sales" });
  await commit(sales, (db) => db.query("update public.brands set colours = colours || '{PANTONE 116 C}' where id = $1", [HAB_BRAND_HABESHA]));
  assert.ok(await ink("PANTONE 116 C"));
});

test("ink rates per brand: admin, warehouse and production set them; only inks", async () => {
  const red = (await ink("PANTONE 485 C"))!;
  await commit(warehouse, (db) => db.query("insert into public.brand_ink_rates (brand_id, material_id, g_per_sheet) values ($1, $2, 0.8)", [HAB_BRAND_HABESHA, red.id]));
  await commit(production, (db) => db.query("update public.brand_ink_rates set g_per_sheet = 0.75 where brand_id = $1 and material_id = $2", [HAB_BRAND_HABESHA, red.id]));
  assert.equal(Number((await pool.query("select g_per_sheet from public.brand_ink_rates where brand_id = $1", [HAB_BRAND_HABESHA])).rows[0].g_per_sheet), 0.75);
  assert.equal(await errorCode(commit(quality, (db) => db.query("insert into public.brand_ink_rates (brand_id, material_id, g_per_sheet) values ($1, $2, 1)", [HAB_BRAND_FETA, red.id]))), "42501");
  const box = (await pool.query("select id from public.raw_materials where name = 'Box'")).rows[0].id;
  assert.equal(await errorCode(commit(admin, (db) => db.query("insert into public.brand_ink_rates (brand_id, material_id, g_per_sheet) values ($1, $2, 1)", [HAB_BRAND_FETA, box]))), "23514");
  assert.equal(await as(customer, async (db) => (await db.query("select count(*)::int as n from public.brand_ink_rates")).rows[0].n), 0);
});

test("ink used on a stillage comes off stock in kg, and follows edits and deletes", async () => {
  const red = (await ink("PANTONE 485 C"))!;
  const black = (await ink("Black"))!;
  const id = await commit(production, async (db) =>
    (
      await db.query(
        "insert into public.print_runs (brand_id, shift, stillage_no, sheets_printed, sheets_spoiled, inks) values ($1, 'A', 'ST-801', 1420, 0, $2) returning id",
        [HAB_BRAND_HABESHA, { [red.id]: 1136, [black.id]: 0 }],
      )
    ).rows[0].id as string,
  );
  assert.deepEqual((await pool.query("select inks from public.print_runs where id = $1", [id])).rows[0].inks, { [red.id]: 1136 }, "zero entries dropped");
  assert.equal((await ink("PANTONE 485 C"))!.on_hand, -1.136);
  await commit(production, (db) => db.query("update public.print_runs set inks = $2 where id = $1", [id, { [red.id]: 900.5, [black.id]: 250 }]));
  assert.equal((await ink("PANTONE 485 C"))!.on_hand, -0.901);
  assert.equal((await ink("Black"))!.on_hand, -0.25);
  const mv = await pool.query("select reason from public.raw_material_movements where source_table = 'print_runs' and source_id = $1 and material_id = $2", [id, black.id]);
  assert.deepEqual(mv.rows.map((r) => r.reason), ["Used: stillage ST-801"]);
  await pool.query("delete from public.print_runs where id = $1", [id]);
  assert.equal((await ink("PANTONE 485 C"))!.on_hand, 0);
  assert.equal((await ink("Black"))!.on_hand, 0);
});

test("ink figures are checked", async () => {
  const red = (await ink("PANTONE 485 C"))!;
  const box = (await pool.query("select id from public.raw_materials where name = 'Box'")).rows[0].id;
  const run = (inks: unknown) =>
    commit(production, (db) => db.query("insert into public.print_runs (brand_id, shift, sheets_printed, inks) values ($1, 'A', 1400, $2)", [HAB_BRAND_HABESHA, JSON.stringify(inks)]));
  assert.equal(await errorCode(run({ [box]: 10 })), "23514", "not an ink");
  assert.equal(await errorCode(run({ [red.id]: -1 })), "23514", "negative");
  assert.equal(await errorCode(run({ [red.id]: "5" })), "23514", "not a number");
  assert.equal(await errorCode(run([1, 2])), "23514", "not a list of inks");
});

test("sample sheets: tinplate and ink off stock; production logs, only admin deletes, customers never read", async () => {
  const red = (await ink("PANTONE 485 C"))!;
  const before = await tinplate();
  const id = await commit(production, async (db) =>
    (
      await db.query("insert into public.sample_sheets (brand_id, purpose, sheets, inks) values ($1, 'colour_match', 25, $2) returning id", [HAB_BRAND_HABESHA, { [red.id]: 40 }])
    ).rows[0].id as string,
  );
  assert.equal(await tinplate(), before - 25);
  assert.equal((await ink("PANTONE 485 C"))!.on_hand, -0.04);
  assert.equal(await errorCode(commit(quality, (db) => db.query("insert into public.sample_sheets (sheets) values (5)"))), "42501");
  assert.equal(await as(customer, async (db) => (await db.query("select count(*)::int as n from public.sample_sheets")).rows[0].n), 0);
  // Production can't delete (nothing happens); admin can.
  await commit(production, (db) => db.query("delete from public.sample_sheets where id = $1", [id]));
  assert.equal((await pool.query("select count(*)::int as n from public.sample_sheets where id = $1", [id])).rows[0].n, 1);
  await commit(admin, (db) => db.query("delete from public.sample_sheets where id = $1", [id]));
  assert.equal(await tinplate(), before);
  assert.equal((await ink("PANTONE 485 C"))!.on_hand, 0);
  assert.equal(await errorCode(commit(production, (db) => db.query("insert into public.sample_sheets (sheets, purpose) values (5, 'fun')"))), "23514");
});

test("base-coated stock has no brand until it is printed", async () => {
  const id = await commit(production, async (db) =>
    (
      await db.query("insert into public.print_runs (brand_id, shift, stillage_no, sheets_printed, printed, base_sheets) values (null, 'A', 'BC-001', 0, false, 1420) returning id")
    ).rows[0].id as string,
  );
  await pool.query("insert into public.stillage_passes (print_run_id, stage, started_at, finished_at) values ($1, 'base_coat', now() - interval '1 hour', now() - interval '30 minutes')", [id]);
  // Printed without a brand: refused.
  assert.equal(await errorCode(commit(production, (db) => db.query("update public.print_runs set printed = true, sheets_printed = 1410 where id = $1", [id]))), "23514");
  await commit(production, (db) => db.query("update public.print_runs set printed = true, sheets_printed = 1410, brand_id = $2 where id = $1", [id, HAB_BRAND_FETA]));
  const r = (await pool.query("select brand_id, printed from public.print_runs where id = $1", [id])).rows[0];
  assert.deepEqual(r, { brand_id: HAB_BRAND_FETA, printed: true });
  // A new stillage straight on the print line still needs its brand.
  assert.equal(await errorCode(commit(production, (db) => db.query("insert into public.print_runs (shift, sheets_printed) values ('A', 1400)"))), "23514");
});
