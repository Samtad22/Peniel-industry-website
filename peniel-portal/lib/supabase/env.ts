export function supabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set — copy .env.example to .env.local");
  return projectOrigin(v);
}

/**
 * Just `https://<ref>.supabase.co`. The dashboard also shows the REST
 * endpoint (`…/rest/v1/`); pasting that as the project URL makes every auth
 * call a 404 ("Invalid path specified in request URL"), so drop any path.
 */
export function projectOrigin(url: string): string {
  // Also forgive stray quotes/spaces and a missing "https://".
  const v = url.trim().replace(/^["']+|["']+$/g, "").trim();
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).origin;
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be the project URL, like https://abcd1234.supabase.co");
  }
}

export function supabaseAnonKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — copy .env.example to .env.local");
  return v;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
