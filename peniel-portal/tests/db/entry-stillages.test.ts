// Production entries name the printed stillages they were pressed from.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { as, createUser, errorCode, HAB, HAB_BRAND_FETA, HAB_BRAND_HABESHA, HAB_ORDER_HABESHA, pool } from "./helpers.ts";

let production: string;
let quality: string;
let habesha: string;
let line: string;
let press: string;

before(async () => {
  production = await createUser({ email: "prod@entry-stillages.test", role: "production" });
  quality = await createUser({ email: "qc@entry-stillages.test", role: "quality" });
  habesha = await createUser({ email: "buyer@entry-stillages.test", role: "customer_user", companyId: HAB });
  line = (await pool.query("select id from public.production_lines where machine_id is not null order by name limit 1")).rows[0].id;
  press = (await pool.query("select id from public.machines where code = 'press-1'")).rows[0].id;
});

after(() => pool.end());

const commit = <T>(user: string, fn: (db: { query: typeof pool.query }) => Promise<T>) =>
  as(user, async (db) => {
    const r = await fn(db);
    await db.query("commit");
    return r;
  });

/** A finished (lacquered) stillage of a brand, optionally sent to the press. */
async function stillage(no: string, brand = HAB_BRAND_HABESHA, toPress = true) {
  const id = (await pool.query("insert into public.print_runs (brand_id, shift, stillage_no, sheets_printed, sheets_spoiled) values ($1, 'A', $2, 1410, 0) returning id", [brand, no])).rows[0].id as string;
  await pool.query("insert into public.stillage_passes (print_run_id, stage, started_at, finished_at) values ($1, 'varnish', now() - interval '2 hours', now() - interval '90 minutes')", [id]);
  await pool.query("insert into public.stillage_passes (print_run_id, stage, started_at, finished_at) values ($1, 'lacquer', now() - interval '80 minutes', now() - interval '50 minutes')", [id]);
  if (toPress) await pool.query("update public.print_runs set to_press_at = now(), press_id = $2 where id = $1", [id, press]);
  return id;
}

const log = (user: string, stillages: string[], usedUp: string[] = [], produced = 200000) =>
  commit(user, async (db) =>
    (await db.query("select public.log_production_entry(current_date, 'A', $1, $2, $3, 100, $4::uuid[], $5::uuid[]) as id", [line, HAB_ORDER_HABESHA, produced, stillages, usedUp])).rows[0].id as string,
  );

test("an entry names its stillages; a stillage stays selectable until it's used up", async () => {
  const s1 = await stillage("ST-901");
  const e1 = await log(production, [s1]);
  const links = await pool.query("select print_run_id from public.production_entry_stillages where entry_id = $1", [e1]);
  assert.deepEqual(links.rows.map((r) => r.print_run_id), [s1]);
  assert.equal((await pool.query("select used_up_at from public.print_runs where id = $1", [s1])).rows[0].used_up_at, null);

  // Next shift: same stillage, now used up.
  const e2 = await log(production, [s1], [s1]);
  const run = (await pool.query("select used_up_at, used_up_by from public.print_runs where id = $1", [s1])).rows[0];
  assert.ok(run.used_up_at);
  assert.equal(run.used_up_by, production);
  assert.equal((await pool.query("select count(*)::int as n from public.production_entry_stillages where print_run_id = $1", [s1])).rows[0].n, 2);

  // Deleting an entry (admin only) removes its links too.
  await pool.query("delete from public.production_entries where id = $1", [e2]);
  assert.equal((await pool.query("select count(*)::int as n from public.production_entry_stillages where print_run_id = $1", [s1])).rows[0].n, 1);
});

test("at least one stillage, at a press, of the order's brand", async () => {
  assert.equal(await errorCode(log(production, [])), "23514");
  const notSent = await stillage("ST-902", HAB_BRAND_HABESHA, false);
  assert.equal(await errorCode(log(production, [notSent])), "23514");
  const feta = await stillage("ST-903", HAB_BRAND_FETA);
  assert.equal(await errorCode(log(production, [feta])), "23514");
  // "Used up" must be one of the chosen stillages.
  const ok = await stillage("ST-904");
  assert.equal(await errorCode(log(production, [ok], [feta])), "23514");
  // Nothing half-saved after a refusal.
  const n = await pool.query("select count(*)::int as n from public.production_entries where produced_qty = 200000 and entry_date = current_date and shift = 'A'");
  assert.ok(n.rows[0].n >= 1);
  const orphan = await pool.query("select count(*)::int as n from public.production_entries e where e.entry_date = current_date and not exists (select 1 from public.production_entry_stillages l where l.entry_id = e.id)");
  assert.equal(orphan.rows[0].n, 0);
});

test("only production and admin log entries; staff read the links; customers never", async () => {
  const s = await stillage("ST-905");
  assert.equal(await errorCode(log(quality, [s])), "42501");
  const e = await log(production, [s]);
  const read = (u: string) => as(u, async (db) => (await db.query("select count(*)::int as n from public.production_entry_stillages where entry_id = $1", [e])).rows[0].n);
  assert.equal(await read(quality), 1);
  assert.equal(await read(habesha), 0);
});

test("a stillage that fed production can't go back to stock", async () => {
  const s = await stillage("ST-906");
  await log(production, [s]);
  assert.equal(await errorCode(commit(production, (db) => db.query("update public.print_runs set to_press_at = null where id = $1", [s]))), "23514");
  // One that didn't feed production can.
  const t = await stillage("ST-907");
  await commit(production, (db) => db.query("update public.print_runs set to_press_at = null where id = $1", [t]));
  assert.equal((await pool.query("select to_press_at from public.print_runs where id = $1", [t])).rows[0].to_press_at, null);
});
