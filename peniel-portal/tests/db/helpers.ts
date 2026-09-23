import pg from "pg";

export const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4 });

// Seed IDs (supabase/seed.sql)
export const HAB = "11111111-1111-4111-8111-111111111111";
export const DSH = "22222222-2222-4222-8222-222222222222";
export const BGI = "33333333-3333-4333-8333-333333333333";

export const HAB_BRAND_HABESHA = "a1000000-0000-4000-8000-000000000001";
export const HAB_BRAND_FETA = "a1000000-0000-4000-8000-000000000002";
export const DSH_BRAND = "a2000000-0000-4000-8000-000000000001";
export const BGI_BRAND = "a3000000-0000-4000-8000-000000000001";

export const HAB_ORDER_HABESHA = "c1000000-0000-4000-8000-000000000001";
export const HAB_ORDER_FETA = "c1000000-0000-4000-8000-000000000002";
export const HAB_ORDER_NEGUS = "c1000000-0000-4000-8000-000000000004";
export const DSH_ORDER = "c2000000-0000-4000-8000-000000000001";
export const BGI_ORDER = "c3000000-0000-4000-8000-000000000001";

export const DSH_INSPECTION = "d2000000-0000-4000-8000-000000000001";

/** Every ID belonging to a company other than Habesha. */
export const FOREIGN_IDS = [DSH, BGI, DSH_BRAND, BGI_BRAND, DSH_ORDER, BGI_ORDER, DSH_INSPECTION];

/** Text that only ever appears in internal fields of the seed data. */
export const INTERNAL_TEXT = /line\s*\d|press\s*[a-z]\b|oee|downtime|bay\s*\d|cpk|spc|calibration|maintenance|die change/i;

/** Columns that must never appear in anything a customer can read. */
export const FORBIDDEN_COLUMNS = [
  "line_id",
  "shift",
  "measurements",
  "internal_notes",
  "location",
  "inspector_id",
  "entered_by",
];

export type Role = "customer_user" | "admin" | "sales" | "production" | "quality" | "warehouse";

/** Create an auth user + profile directly (as the database owner). */
export async function createUser(opts: {
  email: string;
  role: Role;
  companyId?: string | null;
  active?: boolean;
}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [opts.email],
  );
  const id = rows[0].id;
  await pool.query(
    `insert into public.profiles (user_id, company_id, full_name, email, role, active)
     values ($1, $2, $3, $4, $5, $6)`,
    [id, opts.companyId ?? null, opts.email.split("@")[0], opts.email, opts.role, opts.active ?? true],
  );
  return id;
}

/**
 * Run `fn` exactly as the Supabase API would for this caller: inside a
 * transaction, as the `authenticated` role (or `anon` when userId is null)
 * with the JWT claims set. Always rolled back.
 */
export async function as<T>(userId: string | null, fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("begin");
    const claims = userId ? { sub: userId, role: "authenticated" } : { role: "anon" };
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await db.query(userId ? "set local role authenticated" : "set local role anon");
    return await fn(db);
  } finally {
    await db.query("rollback").catch(() => {});
    db.release();
  }
}

/** Resolves to the Postgres error code, or null if the query succeeded. */
export async function errorCode(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "unknown";
  }
}

export async function customerViews(): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string }>(
    `select table_name from information_schema.views
     where table_schema = 'public' and table_name like 'customer\\_%' order by 1`,
  );
  return rows.map((r) => r.table_name);
}

export async function baseTables(): Promise<string[]> {
  const { rows } = await pool.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' order by 1",
  );
  return rows.map((r) => r.tablename);
}

export async function viewColumns(view: string): Promise<{ name: string; type: string }[]> {
  const { rows } = await pool.query<{ column_name: string; data_type: string }>(
    `select column_name, data_type from information_schema.columns
     where table_schema = 'public' and table_name = $1 order by ordinal_position`,
    [view],
  );
  return rows.map((r) => ({ name: r.column_name, type: r.data_type }));
}
